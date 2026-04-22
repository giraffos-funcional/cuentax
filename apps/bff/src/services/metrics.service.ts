/**
 * CUENTAX — Internal Metrics Service
 * ====================================
 * High-level operational metrics for the per-company health dashboard.
 * Meant to give answers like:
 *   - How many imports this month? This year?
 *   - What % of classifications were AI vs rules vs manual?
 *   - What's the average AI confidence?
 *   - How many classifications are still pending review?
 *   - Days since last import?
 *   - Total journal entries posted?
 */

import { and, eq, gte, sql, desc } from 'drizzle-orm'
import { db } from '@/db/client'
import { bankTransactions, transactionClassifications } from '@/db/schema'

export interface CompanyMetrics {
  bank: {
    total_transactions: number
    this_year: number
    this_month: number
    last_import_at: string | null
    days_since_last_import: number | null
    distinct_external_ids: number
  }
  classification: {
    total: number
    approved: number
    pending: number
    by_source: Record<string, number>    // 'ai' / 'rule' / 'manual'
    avg_confidence: number
    avg_confidence_by_source: Record<string, number>
    high_confidence_pct: number           // % of classifications with confidence >= 0.8
  }
  journal_entries: {
    total_posted: number
    posted_this_month: number
    posted_this_year: number
  }
  ai_cost_estimate: {
    total_transactions_classified_by_ai: number
    estimated_usd: number                 // ~$0.01 per 30 transactions
  }
}

export async function buildCompanyMetrics(companyId: number): Promise<CompanyMetrics> {
  const now = new Date()
  const yearStart = `${now.getFullYear()}-01-01`
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  // ── Bank transactions
  const bankTotal = await db.select({ n: sql<number>`COUNT(*)::int` })
    .from(bankTransactions).where(eq(bankTransactions.company_id, companyId))
  const bankYear = await db.select({ n: sql<number>`COUNT(*)::int` })
    .from(bankTransactions).where(and(eq(bankTransactions.company_id, companyId), gte(bankTransactions.fecha, yearStart)))
  const bankMonth = await db.select({ n: sql<number>`COUNT(*)::int` })
    .from(bankTransactions).where(and(eq(bankTransactions.company_id, companyId), gte(bankTransactions.fecha, monthStart)))
  const lastImport = await db.select({ d: sql<Date | null>`MAX(${bankTransactions.created_at})` })
    .from(bankTransactions).where(eq(bankTransactions.company_id, companyId))
  const distinctExt = await db.select({ n: sql<number>`COUNT(DISTINCT ${bankTransactions.external_id})::int` })
    .from(bankTransactions).where(eq(bankTransactions.company_id, companyId))

  const lastImportDate = lastImport[0]?.d
  const daysSinceLast = lastImportDate
    ? Math.floor((now.getTime() - new Date(lastImportDate).getTime()) / 86_400_000)
    : null

  // ── Classifications
  const classTotal = await db.select({ n: sql<number>`COUNT(*)::int` })
    .from(transactionClassifications).where(eq(transactionClassifications.company_id, companyId))
  const classApproved = await db.select({ n: sql<number>`COUNT(*)::int` })
    .from(transactionClassifications)
    .where(and(eq(transactionClassifications.company_id, companyId), eq(transactionClassifications.approved, true)))
  const classBySource = await db.select({
    source: transactionClassifications.classification_source,
    n: sql<number>`COUNT(*)::int`,
    avg_conf: sql<number>`AVG(${transactionClassifications.confidence})`,
  })
    .from(transactionClassifications)
    .where(eq(transactionClassifications.company_id, companyId))
    .groupBy(transactionClassifications.classification_source)

  const avgConfRow = await db.select({
    avg: sql<number>`COALESCE(AVG(${transactionClassifications.confidence}), 0)`,
    high_count: sql<number>`COUNT(*) FILTER (WHERE ${transactionClassifications.confidence} >= 0.8)::int`,
  })
    .from(transactionClassifications)
    .where(eq(transactionClassifications.company_id, companyId))

  const aiCount = classBySource.find(r => r.source === 'ai')?.n ?? 0

  // ── Journal entries posted (sum of classifications with odoo_move_id)
  const postedTotal = await db.select({ n: sql<number>`COUNT(*)::int` })
    .from(transactionClassifications)
    .where(and(
      eq(transactionClassifications.company_id, companyId),
      sql`${transactionClassifications.odoo_move_id} IS NOT NULL`,
    ))
  const postedYear = await db.select({ n: sql<number>`COUNT(*)::int` })
    .from(transactionClassifications)
    .where(and(
      eq(transactionClassifications.company_id, companyId),
      sql`${transactionClassifications.odoo_move_id} IS NOT NULL`,
      gte(transactionClassifications.original_date, yearStart),
    ))
  const postedMonth = await db.select({ n: sql<number>`COUNT(*)::int` })
    .from(transactionClassifications)
    .where(and(
      eq(transactionClassifications.company_id, companyId),
      sql`${transactionClassifications.odoo_move_id} IS NOT NULL`,
      gte(transactionClassifications.original_date, monthStart),
    ))

  const total = classTotal[0]?.n ?? 0
  const approved = classApproved[0]?.n ?? 0

  const bySource: Record<string, number> = {}
  const avgBySource: Record<string, number> = {}
  for (const r of classBySource) {
    const key = r.source ?? 'unknown'
    bySource[key] = r.n
    avgBySource[key] = Number((r.avg_conf ?? 0).toFixed(3))
  }

  return {
    bank: {
      total_transactions: bankTotal[0]?.n ?? 0,
      this_year: bankYear[0]?.n ?? 0,
      this_month: bankMonth[0]?.n ?? 0,
      last_import_at: lastImportDate ? new Date(lastImportDate).toISOString() : null,
      days_since_last_import: daysSinceLast,
      distinct_external_ids: distinctExt[0]?.n ?? 0,
    },
    classification: {
      total,
      approved,
      pending: total - approved,
      by_source: bySource,
      avg_confidence: Number((avgConfRow[0]?.avg ?? 0).toFixed(3)),
      avg_confidence_by_source: avgBySource,
      high_confidence_pct: total > 0 ? Number(((avgConfRow[0]?.high_count ?? 0) / total * 100).toFixed(1)) : 0,
    },
    journal_entries: {
      total_posted: postedTotal[0]?.n ?? 0,
      posted_this_month: postedMonth[0]?.n ?? 0,
      posted_this_year: postedYear[0]?.n ?? 0,
    },
    ai_cost_estimate: {
      total_transactions_classified_by_ai: aiCount,
      // Rough estimate: 30 tx per Claude call at ~$0.015 → $0.0005/tx
      estimated_usd: Number((aiCount * 0.0005).toFixed(2)),
    },
  }
}
