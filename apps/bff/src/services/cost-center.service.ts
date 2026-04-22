/**
 * CUENTAX — Cost Center Service
 * ================================
 * Generic analytic dimension for multi-tenant use. Each client defines what
 * makes sense for their business:
 *   - Airbnb owner → "Propiedades" with one center per unit
 *   - Construction  → "Proyectos" with one center per obra
 *   - Law firm      → "Casos" with one per case/client
 *   - Retailer      → "Locales" with one per store
 *
 * Backed by Odoo's native account.analytic.account + account.analytic.plan.
 * Local DB row (cost_centers) mirrors Odoo and adds keyword-based matching
 * so the AI classifier and auto-tagger can assign the right center to each
 * imported transaction without manual work.
 */

import { eq, and, sql, inArray } from 'drizzle-orm'
import { db } from '@/db/client'
import { costCenters, transactionClassifications } from '@/db/schema'
import { odooAccountingAdapter } from '@/adapters/odoo-accounting.adapter'
import { logger } from '@/core/logger'

// ── Types ────────────────────────────────────────────────────
export interface CostCenterInput {
  name: string
  code?: string
  plan_name?: string            // e.g. "Propiedades" — creates plan if missing
  keywords?: string[]           // bank description keywords for auto-match
  airbnb_listing?: string       // exact Listing name in Airbnb CSV exports
  parent_odoo_id?: number       // Odoo analytic parent, if any
  notes?: string
}

export interface CostCenterRow {
  id: number
  company_id: number
  odoo_analytic_id: number
  odoo_plan_id: number | null
  plan_name: string | null
  name: string
  code: string | null
  keywords: string[]
  airbnb_listing: string | null
  parent_id: number | null
  active: boolean
  notes: string | null
}

// ── Keyword matching ────────────────────────────────────────

/**
 * Find the cost center whose keywords best match a transaction description.
 * Returns the winning row, or null if no keyword matched. Longer keywords
 * win ties (more specific). Case-insensitive substring match.
 */
export function matchCostCenterByKeywords(
  description: string,
  centers: Array<Pick<CostCenterRow, 'id' | 'keywords'>>,
): number | null {
  const desc = description.toUpperCase()
  let winner: { id: number; score: number } | null = null

  for (const c of centers) {
    const kws = Array.isArray(c.keywords) ? c.keywords : []
    for (const kw of kws) {
      const K = String(kw).toUpperCase().trim()
      if (K.length === 0) continue
      if (desc.includes(K)) {
        const score = K.length
        if (!winner || score > winner.score) winner = { id: c.id, score }
      }
    }
  }
  return winner?.id ?? null
}

// ── Odoo plan management ────────────────────────────────────

/**
 * Get or create an Odoo analytic plan by name for a company. Plans group
 * analytic accounts (e.g. "Propiedades" is one plan with multiple accounts).
 */
async function ensureAnalyticPlan(
  odooCompanyId: number,
  planName: string,
): Promise<number | null> {
  const existing = await odooAccountingAdapter.searchRead(
    'account.analytic.plan',
    [['name', '=', planName]],
    ['id', 'name'],
    { limit: 1, context: { allowed_company_ids: [odooCompanyId] } },
  ) as Array<{ id: number }>
  if (existing.length > 0) return existing[0].id

  try {
    const id = await odooAccountingAdapter.create(
      'account.analytic.plan',
      { name: planName },
      { allowed_company_ids: [odooCompanyId], company_id: odooCompanyId },
    )
    return id || null
  } catch (err) {
    logger.warn({ err, planName }, 'Could not create analytic plan — will create account without explicit plan')
    return null
  }
}

// ── CRUD ────────────────────────────────────────────────────

/**
 * Create a cost center: creates the analytic account in Odoo + local mirror.
 */
export async function createCostCenter(
  companyId: number,
  odooCompanyId: number,
  input: CostCenterInput,
): Promise<CostCenterRow> {
  // Use the admin-default-company trick so Odoo properly attributes the
  // analytic account to the target company (same reason account codes need it).
  const result = await odooAccountingAdapter.withAdminDefaultCompany(odooCompanyId, async () => {
    const planId = input.plan_name
      ? await ensureAnalyticPlan(odooCompanyId, input.plan_name)
      : null

    const values: Record<string, unknown> = {
      name: input.name,
      company_id: odooCompanyId,
      active: true,
    }
    if (planId) values.plan_id = planId
    if (input.code) values.code = input.code
    if (input.parent_odoo_id) values.parent_id = input.parent_odoo_id

    const odooId = await odooAccountingAdapter.create(
      'account.analytic.account',
      values,
      { allowed_company_ids: [odooCompanyId], company_id: odooCompanyId },
    )
    if (!odooId) throw new Error('Failed to create analytic account in Odoo')

    // Mirror locally
    const [row] = await db.insert(costCenters).values({
      company_id: companyId,
      odoo_analytic_id: odooId,
      odoo_plan_id: planId,
      plan_name: input.plan_name ?? null,
      name: input.name,
      code: input.code ?? null,
      keywords: input.keywords ?? [],
      airbnb_listing: input.airbnb_listing ?? null,
      notes: input.notes ?? null,
    }).returning()

    return toRow(row)
  })

  return result
}

/**
 * Pull any Odoo analytic accounts that exist for this company but aren't in
 * our local mirror, and insert them. Useful when a customer already has
 * analytic accounts configured directly in Odoo.
 */
export async function syncCostCentersFromOdoo(
  companyId: number,
  odooCompanyId: number,
): Promise<{ synced: number; total_in_odoo: number }> {
  const odooAccounts = await odooAccountingAdapter.searchRead(
    'account.analytic.account',
    [['company_id', '=', odooCompanyId]],
    ['id', 'name', 'code', 'plan_id', 'active', 'parent_id'],
    { limit: 500, context: { allowed_company_ids: [odooCompanyId] } },
  ) as Array<{
    id: number
    name: string
    code: string | false
    plan_id: [number, string] | false
    active: boolean
    parent_id: [number, string] | false
  }>

  const existing = await db.select({
    odoo_analytic_id: costCenters.odoo_analytic_id,
  }).from(costCenters).where(eq(costCenters.company_id, companyId))
  const existingSet = new Set(existing.map(r => r.odoo_analytic_id))

  let synced = 0
  for (const a of odooAccounts) {
    if (existingSet.has(a.id)) continue
    await db.insert(costCenters).values({
      company_id: companyId,
      odoo_analytic_id: a.id,
      odoo_plan_id: a.plan_id ? a.plan_id[0] : null,
      plan_name: a.plan_id ? a.plan_id[1] : null,
      name: a.name,
      code: a.code === false ? null : (a.code ?? null),
      active: a.active,
      keywords: [],
    })
    synced++
  }

  logger.info({ companyId, synced, total: odooAccounts.length }, 'Cost centers synced from Odoo')
  return { synced, total_in_odoo: odooAccounts.length }
}

export async function listCostCenters(companyId: number): Promise<CostCenterRow[]> {
  const rows = await db.select().from(costCenters)
    .where(and(eq(costCenters.company_id, companyId), eq(costCenters.active, true)))
    .orderBy(costCenters.name)
  return rows.map(toRow)
}

export async function getCostCenter(id: number): Promise<CostCenterRow | null> {
  const [row] = await db.select().from(costCenters)
    .where(eq(costCenters.id, id)).limit(1)
  return row ? toRow(row) : null
}

export async function updateCostCenter(
  id: number,
  updates: Partial<Pick<CostCenterInput, 'name' | 'keywords' | 'airbnb_listing' | 'notes' | 'code'>>,
): Promise<CostCenterRow | null> {
  const row = await getCostCenter(id)
  if (!row) return null

  const dbUpdates: Record<string, unknown> = { updated_at: new Date() }
  if (updates.name !== undefined) dbUpdates.name = updates.name
  if (updates.keywords !== undefined) dbUpdates.keywords = updates.keywords
  if (updates.airbnb_listing !== undefined) dbUpdates.airbnb_listing = updates.airbnb_listing
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes
  if (updates.code !== undefined) dbUpdates.code = updates.code

  await db.update(costCenters).set(dbUpdates).where(eq(costCenters.id, id))

  // Mirror name/code to Odoo (keywords are local-only)
  if (updates.name !== undefined || updates.code !== undefined) {
    const odooValues: Record<string, unknown> = {}
    if (updates.name !== undefined) odooValues.name = updates.name
    if (updates.code !== undefined) odooValues.code = updates.code
    try {
      await odooAccountingAdapter.write('account.analytic.account', [row.odoo_analytic_id], odooValues)
    } catch (err) {
      logger.warn({ err, id }, 'Odoo analytic account update failed — local row updated anyway')
    }
  }

  return getCostCenter(id)
}

export async function deactivateCostCenter(id: number): Promise<void> {
  const row = await getCostCenter(id)
  if (!row) return
  await db.update(costCenters).set({ active: false, updated_at: new Date() })
    .where(eq(costCenters.id, id))
  try {
    await odooAccountingAdapter.write('account.analytic.account', [row.odoo_analytic_id], { active: false })
  } catch (err) {
    logger.warn({ err, id }, 'Odoo analytic deactivate failed')
  }
}

// ── Bulk / retroactive tagging ─────────────────────────────

/**
 * Walk every classification for a company that doesn't have a cost center
 * assigned yet, and apply keyword matching to auto-tag them.
 * Useful after adding/updating keywords on a center.
 */
export async function autoTagClassifications(
  companyId: number,
): Promise<{ tagged: number; total_untagged: number }> {
  const centers = await listCostCenters(companyId)
  if (centers.length === 0) return { tagged: 0, total_untagged: 0 }

  const pending = await db.select({
    id: transactionClassifications.id,
    desc: transactionClassifications.original_description,
  })
    .from(transactionClassifications)
    .where(and(
      eq(transactionClassifications.company_id, companyId),
      sql`${transactionClassifications.cost_center_id} IS NULL`,
    ))

  let tagged = 0
  for (const tx of pending) {
    const matchId = matchCostCenterByKeywords(tx.desc, centers)
    if (matchId) {
      await db.update(transactionClassifications)
        .set({ cost_center_id: matchId, updated_at: new Date() })
        .where(eq(transactionClassifications.id, tx.id))
      tagged++
    }
  }

  logger.info({ companyId, tagged, total: pending.length }, 'Retroactive cost center tagging complete')
  return { tagged, total_untagged: pending.length - tagged }
}

export async function assignCostCenter(
  classificationId: number,
  costCenterId: number | null,
): Promise<void> {
  await db.update(transactionClassifications)
    .set({ cost_center_id: costCenterId, updated_at: new Date() })
    .where(eq(transactionClassifications.id, classificationId))
}

export async function bulkAssignCostCenter(
  classificationIds: number[],
  costCenterId: number | null,
): Promise<number> {
  if (classificationIds.length === 0) return 0
  const result = await db.update(transactionClassifications)
    .set({ cost_center_id: costCenterId, updated_at: new Date() })
    .where(inArray(transactionClassifications.id, classificationIds))
  return (result as any).rowCount ?? classificationIds.length
}

// ── P&L by cost center ─────────────────────────────────────

export interface CostCenterPnl {
  cost_center_id: number | null       // null = untagged bucket
  cost_center_name: string
  revenue_by_account: Array<{ account: string; amount: number }>
  expense_by_account: Array<{ account: string; amount: number }>
  total_revenue: number
  total_expenses: number
  net_income: number
}

export interface CostCenterPnlReport {
  period: { year: number; month: number | null; from: string; to: string }
  currency: 'CLP' | 'USD'
  by_center: CostCenterPnl[]
  totals: { revenue: number; expenses: number; net_income: number }
}

/**
 * Build a P&L report grouped by cost center for a period.
 * Queries Odoo posted move lines filtered by analytic_distribution.
 */
export async function buildCostCenterPnl(
  companyId: number,
  odooCompanyId: number,
  year: number,
  month: number | undefined,
  currency: 'CLP' | 'USD',
): Promise<CostCenterPnlReport> {
  const from = month ? `${year}-${String(month).padStart(2, '0')}-01` : `${year}-01-01`
  const to   = month ? `${year}-${String(month).padStart(2, '0')}-31` : `${year}-12-31`

  const centers = await listCostCenters(companyId)
  const centerById = new Map(centers.map(c => [c.odoo_analytic_id, c]))

  // Pull all posted lines with analytic_distribution set
  const lines = await odooAccountingAdapter.searchRead(
    'account.move.line',
    [
      ['company_id', '=', odooCompanyId],
      ['date', '>=', from],
      ['date', '<=', to],
      ['parent_state', '=', 'posted'],
    ],
    ['account_id', 'debit', 'credit', 'analytic_distribution'],
    { limit: 10_000, context: { allowed_company_ids: [odooCompanyId] } },
  ) as Array<{
    account_id: [number, string]
    debit: number
    credit: number
    analytic_distribution: Record<string, number> | false | null
  }>

  // Bucket: cost_center_id (or 'untagged') → account → { debit, credit }
  type AccountAgg = Map<string, { debit: number; credit: number }>
  const buckets = new Map<string, AccountAgg>()

  for (const line of lines) {
    const acct = line.account_id?.[1] ?? 'Unknown'
    const dist = line.analytic_distribution
    // Odoo 18 analytic_distribution: { "<analytic_account_id>": <percent> }
    // (can also be multi-dimensional like "id1,id2" for multi-plan, handled below)
    const hasDist = dist && typeof dist === 'object' && Object.keys(dist).length > 0

    if (!hasDist) {
      addToBucket(buckets, 'untagged', acct, line.debit, line.credit)
      continue
    }

    for (const [key, percent] of Object.entries(dist)) {
      // Multi-plan keys look like "10,25" — take first element
      const firstId = Number(String(key).split(',')[0])
      const share = Number(percent) / 100
      if (!Number.isFinite(firstId) || !Number.isFinite(share)) continue
      const bucketKey = centerById.has(firstId) ? String(firstId) : 'untagged'
      addToBucket(buckets, bucketKey, acct, line.debit * share, line.credit * share)
    }
  }

  // Build report rows
  const byCenter: CostCenterPnl[] = []
  for (const [key, accts] of buckets) {
    const center = key === 'untagged' ? null : centerById.get(Number(key))
    const revEntries: Array<{ account: string; amount: number }> = []
    const expEntries: Array<{ account: string; amount: number }> = []

    for (const [account, agg] of accts) {
      const code = account.split(' ')[0]
      if (isRevenueCode(code)) {
        revEntries.push({ account, amount: round2(agg.credit - agg.debit) })
      } else if (isExpenseCode(code)) {
        expEntries.push({ account, amount: round2(agg.debit - agg.credit) })
      }
      // else: balance-sheet account (bank, AR, etc.) — skip in P&L
    }

    const totalRev = revEntries.reduce((s, r) => s + r.amount, 0)
    const totalExp = expEntries.reduce((s, r) => s + r.amount, 0)

    byCenter.push({
      cost_center_id: center?.id ?? null,
      cost_center_name: center?.name ?? (key === 'untagged' ? '(sin centro)' : `Odoo ${key}`),
      revenue_by_account: revEntries.sort((a, b) => b.amount - a.amount),
      expense_by_account: expEntries.sort((a, b) => b.amount - a.amount),
      total_revenue: round2(totalRev),
      total_expenses: round2(totalExp),
      net_income: round2(totalRev - totalExp),
    })
  }

  byCenter.sort((a, b) => b.net_income - a.net_income)

  const totalRevenue = byCenter.reduce((s, c) => s + c.total_revenue, 0)
  const totalExpenses = byCenter.reduce((s, c) => s + c.total_expenses, 0)

  return {
    period: { year, month: month ?? null, from, to },
    currency,
    by_center: byCenter,
    totals: {
      revenue: round2(totalRevenue),
      expenses: round2(totalExpenses),
      net_income: round2(totalRevenue - totalExpenses),
    },
  }
}

// ── helpers ────────────────────────────────────────────────

function toRow(row: typeof costCenters.$inferSelect): CostCenterRow {
  return {
    id: row.id,
    company_id: row.company_id,
    odoo_analytic_id: row.odoo_analytic_id,
    odoo_plan_id: row.odoo_plan_id,
    plan_name: row.plan_name,
    name: row.name,
    code: row.code,
    keywords: Array.isArray(row.keywords) ? row.keywords as string[] : [],
    airbnb_listing: row.airbnb_listing,
    parent_id: row.parent_id,
    active: row.active ?? true,
    notes: row.notes,
  }
}

function addToBucket(
  buckets: Map<string, Map<string, { debit: number; credit: number }>>,
  bucketKey: string,
  account: string,
  debit: number,
  credit: number,
): void {
  let accts = buckets.get(bucketKey)
  if (!accts) {
    accts = new Map()
    buckets.set(bucketKey, accts)
  }
  const agg = accts.get(account) ?? { debit: 0, credit: 0 }
  agg.debit += debit || 0
  agg.credit += credit || 0
  accts.set(account, agg)
}

function isRevenueCode(code: string): boolean {
  return code.startsWith('4')
}

function isExpenseCode(code: string): boolean {
  return code.startsWith('5') || code.startsWith('6') || code.startsWith('7')
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
