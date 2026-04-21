/**
 * CUENTAX — Bank Reconciliation Service
 * =======================================
 * Utilities for a robust bank import flow over a full year of statements:
 *
 *  - Deduplicate transactions via stable external_id hashes
 *  - Persist to bank_transactions so classifications can link to them
 *  - Reconcile opening/closing balances when available
 *  - Detect inter-account transfers (matching positive/negative pairs)
 */

import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { bankAccounts, bankTransactions } from '@/db/schema'
import type { ParsedStatementLine } from './bank-import.service'
import { logger } from '@/core/logger'

export interface DedupResult {
  inserted: number
  skipped: number
  transactionIds: number[] // DB ids in the same order as input lines (0 for skipped)
}

/**
 * Insert parsed statement lines into bank_transactions, deduplicating by
 * (bank_account_id, external_id). Returns counts and the per-line DB id so
 * downstream classifications can link back to the canonical transaction.
 *
 * @param currency 'USD' stores amounts as cents (x100), 'CLP' stores as integer pesos.
 *                 Defaults to 'USD' for the US accounting flow.
 */
export async function persistTransactions(
  companyId: number,
  bankAccountId: number,
  lines: ParsedStatementLine[],
  source: 'csv' | 'ofx' = 'csv',
  currency: 'USD' | 'CLP' = 'USD',
): Promise<DedupResult> {
  if (lines.length === 0) {
    return { inserted: 0, skipped: 0, transactionIds: [] }
  }

  // Look up existing transactions for this account with these external_ids
  const externalIds = lines.map(l => l.external_id)
  const existing = await db.select({
    id: bankTransactions.id,
    external_id: bankTransactions.external_id,
  })
    .from(bankTransactions)
    .where(and(
      eq(bankTransactions.bank_account_id, bankAccountId),
      inArray(bankTransactions.external_id, externalIds),
    ))

  const existingMap = new Map(existing.map(r => [r.external_id, r.id]))

  const transactionIds: number[] = []
  let inserted = 0
  let skipped = 0

  for (const line of lines) {
    const existingId = existingMap.get(line.external_id)
    if (existingId) {
      transactionIds.push(existingId)
      skipped++
      continue
    }

    // bank_transactions.monto is bigint (integer). For CLP that's pesos, for
    // USD we store cents to preserve decimals without a schema change.
    const storedAmount = currency === 'USD'
      ? Math.round(line.amount * 100)
      : Math.round(line.amount)

    const [row] = await db.insert(bankTransactions).values({
      company_id: companyId,
      bank_account_id: bankAccountId,
      fecha: line.date,
      descripcion: line.description,
      referencia: line.reference || null,
      monto: storedAmount,
      tipo: line.amount >= 0 ? 'credito' : 'debito',
      source,
      external_id: line.external_id,
    }).returning({ id: bankTransactions.id })

    transactionIds.push(row.id)
    inserted++
  }

  logger.info(
    { companyId, bankAccountId, inserted, skipped, total: lines.length },
    'Bank transactions persisted',
  )

  return { inserted, skipped, transactionIds }
}

// ─── Cash reconciliation ──────────────────────────────────────

export interface ReconciliationResult {
  ok: boolean
  expected_closing: number
  computed_closing: number
  diff: number
  total_deposits: number
  total_payments: number
  transaction_count: number
  note: string
}

/**
 * Verify that opening + sum(transactions) == expected closing balance.
 * Returns a human-readable status and the numeric gap (0 when reconciled).
 */
export function reconcileBalances(
  lines: ParsedStatementLine[],
  openingBalance: number,
  expectedClosing: number,
  tolerance: number = 0.01,
): ReconciliationResult {
  const totalDeposits = lines.filter(l => l.amount > 0).reduce((s, l) => s + l.amount, 0)
  const totalPayments = lines.filter(l => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0)
  const computedClosing = openingBalance + totalDeposits - totalPayments
  const diff = Math.abs(computedClosing - expectedClosing)
  const ok = diff <= tolerance

  return {
    ok,
    expected_closing: expectedClosing,
    computed_closing: Number(computedClosing.toFixed(2)),
    diff: Number(diff.toFixed(2)),
    total_deposits: Number(totalDeposits.toFixed(2)),
    total_payments: Number(totalPayments.toFixed(2)),
    transaction_count: lines.length,
    note: ok
      ? 'Statement balances. All transactions appear complete.'
      : `Gap of ${diff.toFixed(2)} between expected closing (${expectedClosing.toFixed(2)}) and computed (${computedClosing.toFixed(2)}). Missing transactions or parsing error likely.`,
  }
}

// ─── Transfer detection ───────────────────────────────────────

export interface TransferPair {
  out_line_index: number
  in_line_index: number
  amount: number
  date_out: string
  date_in: string
  description_out: string
  description_in: string
  confidence: number
}

/**
 * Detect likely inter-account transfers: a negative line and a positive line
 * with the same absolute amount within a few days, where at least one side
 * has a transfer keyword. These should NOT be posted as income/expense —
 * they cancel out at the company level.
 */
export function detectTransfers(
  lines: ParsedStatementLine[],
  windowDays: number = 3,
): TransferPair[] {
  const TRANSFER_KEYWORDS = /transfer|zelle|wire|internal|to\s+checking|to\s+savings|from\s+checking|from\s+savings|book\s+transfer/i
  const pairs: TransferPair[] = []
  const usedIndexes = new Set<number>()

  for (let i = 0; i < lines.length; i++) {
    if (usedIndexes.has(i)) continue
    const a = lines[i]
    if (a.amount >= 0) continue // look for outflow first

    for (let j = 0; j < lines.length; j++) {
      if (i === j || usedIndexes.has(j)) continue
      const b = lines[j]
      if (b.amount <= 0) continue
      if (Math.abs(a.amount) !== Math.abs(b.amount)) continue

      const dayDiff = Math.abs(dateDiffDays(a.date, b.date))
      if (dayDiff > windowDays) continue

      const keywordMatch = TRANSFER_KEYWORDS.test(a.description) || TRANSFER_KEYWORDS.test(b.description)
      const confidence = keywordMatch ? 0.95 : 0.6 // amount+date alone is weaker signal

      pairs.push({
        out_line_index: i,
        in_line_index: j,
        amount: Math.abs(a.amount),
        date_out: a.date,
        date_in: b.date,
        description_out: a.description,
        description_in: b.description,
        confidence,
      })
      usedIndexes.add(i)
      usedIndexes.add(j)
      break
    }
  }

  return pairs
}

function dateDiffDays(a: string, b: string): number {
  const ms = new Date(a).getTime() - new Date(b).getTime()
  return ms / (1000 * 60 * 60 * 24)
}

// ─── Year-end summary ─────────────────────────────────────────

export interface YearSummary {
  year: number
  transaction_count: number
  total_deposits: number
  total_payments: number
  net_cash_flow: number
  monthly: Array<{ month: number; deposits: number; payments: number; net: number; count: number }>
  top_vendors_by_spend: Array<{ vendor: string; total: number; count: number }>
  top_income_sources: Array<{ source: string; total: number; count: number }>
}

/**
 * Build an executive summary of bank activity for a given year.
 * Uses bank_transactions only — independent of classification state so it
 * can show a picture even before AI classification runs.
 */
export async function buildYearSummary(companyId: number, year: number): Promise<YearSummary> {
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`

  const [monthly, txns] = await Promise.all([
    db.select({
      month: sql<number>`EXTRACT(MONTH FROM ${bankTransactions.fecha}::date)::int`,
      deposits: sql<number>`COALESCE(SUM(CASE WHEN ${bankTransactions.monto} > 0 THEN ${bankTransactions.monto} ELSE 0 END), 0)`,
      payments: sql<number>`COALESCE(SUM(CASE WHEN ${bankTransactions.monto} < 0 THEN ABS(${bankTransactions.monto}) ELSE 0 END), 0)`,
      count: sql<number>`COUNT(*)::int`,
    })
      .from(bankTransactions)
      .where(and(
        eq(bankTransactions.company_id, companyId),
        gte(bankTransactions.fecha, yearStart),
        lte(bankTransactions.fecha, yearEnd),
      ))
      .groupBy(sql`EXTRACT(MONTH FROM ${bankTransactions.fecha}::date)`)
      .orderBy(sql`EXTRACT(MONTH FROM ${bankTransactions.fecha}::date)`),

    db.select({
      descripcion: bankTransactions.descripcion,
      monto: bankTransactions.monto,
    })
      .from(bankTransactions)
      .where(and(
        eq(bankTransactions.company_id, companyId),
        gte(bankTransactions.fecha, yearStart),
        lte(bankTransactions.fecha, yearEnd),
      )),
  ])

  // Group by vendor (normalize description for grouping)
  const vendorSpend = new Map<string, { total: number; count: number }>()
  const incomeSource = new Map<string, { total: number; count: number }>()

  for (const tx of txns) {
    const vendor = normalizeVendor(tx.descripcion)
    const amount = Number(tx.monto) / 100 // stored as cents
    const bucket = amount < 0 ? vendorSpend : incomeSource
    const current = bucket.get(vendor) ?? { total: 0, count: 0 }
    current.total += Math.abs(amount)
    current.count += 1
    bucket.set(vendor, current)
  }

  const sortedVendors = [...vendorSpend.entries()]
    .map(([vendor, v]) => ({ vendor, total: Number(v.total.toFixed(2)), count: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  const sortedIncome = [...incomeSource.entries()]
    .map(([source, v]) => ({ source, total: Number(v.total.toFixed(2)), count: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  const totals = monthly.reduce(
    (acc, m) => ({
      deposits: acc.deposits + Number(m.deposits) / 100,
      payments: acc.payments + Number(m.payments) / 100,
      count: acc.count + m.count,
    }),
    { deposits: 0, payments: 0, count: 0 },
  )

  return {
    year,
    transaction_count: totals.count,
    total_deposits: Number(totals.deposits.toFixed(2)),
    total_payments: Number(totals.payments.toFixed(2)),
    net_cash_flow: Number((totals.deposits - totals.payments).toFixed(2)),
    monthly: monthly.map(m => ({
      month: m.month,
      deposits: Number((Number(m.deposits) / 100).toFixed(2)),
      payments: Number((Number(m.payments) / 100).toFixed(2)),
      net: Number(((Number(m.deposits) - Number(m.payments)) / 100).toFixed(2)),
      count: m.count,
    })),
    top_vendors_by_spend: sortedVendors,
    top_income_sources: sortedIncome,
  }
}

/**
 * Pull a meaningful vendor name out of a bank transaction description.
 * Chase/BofA descriptions often include dates, IDs, and trailing digits.
 */
export function normalizeVendor(description: string): string {
  let v = description.trim().toUpperCase()
  // Strip common noise: dates, reference numbers, long digit runs
  v = v.replace(/\b\d{2}\/\d{2}(\/\d{2,4})?\b/g, '')
  v = v.replace(/\b\d{6,}\b/g, '')
  v = v.replace(/\s{2,}/g, ' ').trim()
  // Take first 3-4 meaningful words
  const words = v.split(' ').filter(w => w.length > 2)
  return words.slice(0, 3).join(' ') || description.toUpperCase()
}

// ─── Get or create default bank account ───────────────────────

/**
 * Ensure the company has a bank_account row we can link transactions to.
 * If none exists, create a minimal default so the import flow isn't blocked.
 */
export async function ensureDefaultBankAccount(
  companyId: number,
  name: string = 'Default Bank Account',
): Promise<number> {
  const existing = await db.select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(eq(bankAccounts.company_id, companyId))
    .limit(1)

  if (existing.length > 0) return existing[0].id

  const [row] = await db.insert(bankAccounts).values({
    company_id: companyId,
    nombre: name,
    banco: 'Generic',
    tipo_cuenta: 'corriente',
    numero_cuenta: '',
    moneda: 'USD',
    activo: true,
  }).returning({ id: bankAccounts.id })

  logger.info({ companyId, bankAccountId: row.id }, 'Created default bank account for US company')
  return row.id
}
