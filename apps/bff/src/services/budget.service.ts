/**
 * CUENTAX — Budgets vs Actuals
 * ================================
 * Monthly budget amounts per (account_code, cost_center?). Compared against
 * posted Odoo journal entries for the same period to produce a variance
 * report. Variance = Actual - Budget. Favorable/unfavorable depends on
 * whether the account is revenue (more is favorable) or expense (less is
 * favorable).
 */

import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/client'
import { budgets } from '@/db/schema'
import { odooAccountingAdapter } from '@/adapters/odoo-accounting.adapter'
import { logger } from '@/core/logger'

export interface BudgetRow {
  id: number
  company_id: number
  cost_center_id: number | null
  account_code: string
  account_name: string | null
  year: number
  month: number
  amount: number
  notes: string | null
}

export interface BudgetInput {
  cost_center_id?: number | null
  account_code: string
  account_name?: string
  year: number
  month: number
  amount: number
  notes?: string
}

export async function listBudgets(
  companyId: number, year?: number, month?: number,
): Promise<BudgetRow[]> {
  const conditions = [eq(budgets.company_id, companyId)]
  if (year) conditions.push(eq(budgets.year, year))
  if (month) conditions.push(eq(budgets.month, month))
  const rows = await db.select().from(budgets).where(and(...conditions))
  return rows.map(toRow)
}

export async function upsertBudget(
  companyId: number, input: BudgetInput,
): Promise<BudgetRow> {
  // Manual upsert. Use isNull() for null cost_center_id — SQL equality
  // doesn't match NULL to NULL, so a plain eq(..., null) returns nothing
  // and we'd end up creating duplicates instead of updating.
  const existing = await db.select().from(budgets).where(and(
    eq(budgets.company_id, companyId),
    eq(budgets.year, input.year),
    eq(budgets.month, input.month),
    eq(budgets.account_code, input.account_code),
    input.cost_center_id != null
      ? eq(budgets.cost_center_id, input.cost_center_id)
      : isNull(budgets.cost_center_id),
  )).limit(1)

  if (existing.length > 0) {
    const [updated] = await db.update(budgets).set({
      amount: String(input.amount),
      account_name: input.account_name ?? null,
      notes: input.notes ?? null,
      updated_at: new Date(),
    }).where(eq(budgets.id, existing[0].id)).returning()
    return toRow(updated)
  }
  const [created] = await db.insert(budgets).values({
    company_id: companyId,
    cost_center_id: input.cost_center_id ?? null,
    account_code: input.account_code,
    account_name: input.account_name ?? null,
    year: input.year,
    month: input.month,
    amount: String(input.amount),
    notes: input.notes ?? null,
  }).returning()
  return toRow(created)
}

export async function bulkUpsertBudgets(
  companyId: number, inputs: BudgetInput[],
): Promise<{ upserted: number }> {
  let n = 0
  for (const input of inputs) {
    await upsertBudget(companyId, input)
    n++
  }
  return { upserted: n }
}

export async function deleteBudget(id: number): Promise<void> {
  await db.delete(budgets).where(eq(budgets.id, id))
}

// ── Variance report ────────────────────────────────────────

export interface BudgetVarianceLine {
  account_code: string
  account_name: string
  cost_center_id: number | null
  cost_center_name: string | null
  budget_amount: number
  actual_amount: number
  variance: number                         // actual - budget
  variance_pct: number                     // variance / budget (* 100)
  is_revenue: boolean                      // for favorable/unfavorable coloring
  favorable: boolean                       // revenue: actual >= budget; expense: actual <= budget
}

export interface BudgetVarianceReport {
  period: { year: number; month: number | null; from: string; to: string }
  currency: 'CLP' | 'USD'
  lines: BudgetVarianceLine[]
  totals: {
    total_budget: number
    total_actual: number
    total_variance: number
    favorable_count: number
    unfavorable_count: number
  }
}

/**
 * Compare budget to actuals for a period. Actuals come from posted Odoo
 * move lines grouped by account code (and analytic distribution for the
 * cost-center dimension).
 */
export async function buildBudgetVariance(
  companyId: number,
  odooCompanyId: number,
  year: number,
  month: number | undefined,
  currency: 'CLP' | 'USD' = 'USD',
  /** Map local cost_center_id → odoo_analytic_id (for analytic_distribution matching). */
  localToOdooAnalytic: Map<number, number> = new Map(),
  /** Map local cost_center_id → display name. */
  costCenterNameLookup: Map<number, string> = new Map(),
): Promise<BudgetVarianceReport> {
  const from = month ? `${year}-${String(month).padStart(2, '0')}-01` : `${year}-01-01`
  const to   = month ? `${year}-${String(month).padStart(2, '0')}-31` : `${year}-12-31`

  // 1. Load budgets for the period
  const budgetRows = await listBudgets(companyId, year, month)

  // 2. Load actuals from Odoo for the same period
  const lines = await odooAccountingAdapter.searchRead(
    'account.move.line',
    [
      ['company_id', '=', odooCompanyId],
      ['date', '>=', from],
      ['date', '<=', to],
      ['parent_state', '=', 'posted'],
    ],
    ['account_id', 'debit', 'credit', 'analytic_distribution'],
    { limit: 20_000, context: { allowed_company_ids: [odooCompanyId] } },
  ) as Array<{
    account_id: [number, string]
    debit: number
    credit: number
    analytic_distribution: Record<string, number> | false | null
  }>

  // Map Odoo analytic IDs (keys in analytic_distribution) → local cost_center IDs
  // via the lookup; we already receive Map<odooAnalyticId, localName> but for this
  // we need <odooAnalyticId, localId>. Caller can pass either; we'll match by
  // cost_center name as fallback.

  // 3. Aggregate actuals by (code, cost_center_id)
  type Key = string  // `${code}|${ccId ?? 'null'}`
  const actuals = new Map<Key, { debit: number; credit: number; accountName: string }>()

  for (const line of lines) {
    const acctLabel = line.account_id?.[1] ?? ''
    const code = acctLabel.split(' ')[0]
    if (!code) continue

    // Determine target cost center(s) from analytic_distribution (can be empty)
    const dist = line.analytic_distribution
    const hasDist = dist && typeof dist === 'object' && Object.keys(dist).length > 0

    if (!hasDist) {
      const key = `${code}|null`
      const agg = actuals.get(key) ?? { debit: 0, credit: 0, accountName: acctLabel }
      agg.debit += Number(line.debit) || 0
      agg.credit += Number(line.credit) || 0
      actuals.set(key, agg)
      continue
    }

    for (const [distKey, percent] of Object.entries(dist)) {
      const share = Number(percent) / 100
      const firstOdooId = Number(String(distKey).split(',')[0])
      if (!Number.isFinite(firstOdooId) || !Number.isFinite(share)) continue
      // We need local cost_center_id — look up by odoo_analytic_id
      const localCcId = [...localToOdooAnalytic.entries()]
        .find(([, odooId]) => odooId === firstOdooId)?.[0] ?? null
      const key = `${code}|${localCcId ?? 'null'}`
      const agg = actuals.get(key) ?? { debit: 0, credit: 0, accountName: acctLabel }
      agg.debit += (Number(line.debit) || 0) * share
      agg.credit += (Number(line.credit) || 0) * share
      actuals.set(key, agg)
    }
  }

  // 4. Build variance lines — one per budgeted entry + any orphan actuals
  const varianceLines: BudgetVarianceLine[] = []
  const seen = new Set<Key>()

  for (const b of budgetRows) {
    const key: Key = `${b.account_code}|${b.cost_center_id ?? 'null'}`
    seen.add(key)
    const actual = actuals.get(key)
    const isRevenue = b.account_code.startsWith('4')
    const actualAmt = actual
      ? (isRevenue ? (actual.credit - actual.debit) : (actual.debit - actual.credit))
      : 0
    const variance = actualAmt - b.amount
    const variancePct = b.amount !== 0 ? (variance / b.amount) * 100 : 0
    varianceLines.push({
      account_code: b.account_code,
      account_name: b.account_name ?? actual?.accountName ?? '',
      cost_center_id: b.cost_center_id,
      cost_center_name: b.cost_center_id ? (costCenterNameLookup.get(b.cost_center_id) ?? null) : null,
      budget_amount: round2(b.amount),
      actual_amount: round2(actualAmt),
      variance: round2(variance),
      variance_pct: round2(variancePct),
      is_revenue: isRevenue,
      favorable: isRevenue ? variance >= 0 : variance <= 0,
    })
  }

  // 5. Orphan actuals (actual movement but no budget): still show them
  for (const [key, agg] of actuals) {
    if (seen.has(key)) continue
    const [code, ccStr] = key.split('|')
    const ccId = ccStr === 'null' ? null : Number(ccStr)
    const isRevenue = code.startsWith('4')
    const isExpense = code.startsWith('5') || code.startsWith('6') || code.startsWith('7')
    if (!isRevenue && !isExpense) continue   // skip balance-sheet accounts
    const actualAmt = isRevenue ? (agg.credit - agg.debit) : (agg.debit - agg.credit)
    varianceLines.push({
      account_code: code,
      account_name: agg.accountName,
      cost_center_id: ccId,
      cost_center_name: ccId ? (costCenterNameLookup.get(ccId) ?? null) : null,
      budget_amount: 0,
      actual_amount: round2(actualAmt),
      variance: round2(actualAmt),
      variance_pct: 0,
      is_revenue: isRevenue,
      favorable: isRevenue ? actualAmt >= 0 : actualAmt <= 0,
    })
  }

  varianceLines.sort((a, b) =>
    Math.abs(b.variance) - Math.abs(a.variance),
  )

  const totalBudget = budgetRows.reduce((s, b) => s + Number(b.amount), 0)
  const totalActual = varianceLines.reduce((s, l) => s + l.actual_amount, 0)
  const favCount = varianceLines.filter(l => l.favorable).length
  const unfavCount = varianceLines.filter(l => !l.favorable && l.budget_amount > 0).length

  return {
    period: { year, month: month ?? null, from, to },
    currency,
    lines: varianceLines,
    totals: {
      total_budget: round2(totalBudget),
      total_actual: round2(totalActual),
      total_variance: round2(totalActual - totalBudget),
      favorable_count: favCount,
      unfavorable_count: unfavCount,
    },
  }
}

function toRow(row: typeof budgets.$inferSelect): BudgetRow {
  return {
    id: row.id,
    company_id: row.company_id,
    cost_center_id: row.cost_center_id,
    account_code: row.account_code,
    account_name: row.account_name,
    year: row.year,
    month: row.month,
    amount: Number(row.amount),
    notes: row.notes,
  }
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
