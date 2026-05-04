/**
 * Revenue-share calculator.
 *
 * Reads tenant_fees active for the period (intersect valid_from/valid_to),
 * sums by fee_type, applies the tenant's current rates, returns totals
 * + per-PYME breakdown.
 *
 * Refs: docs/multitenancy/phase-03-revenue-share.md T3.4
 */
import { eq, and, lte, gte, sql, isNull, or } from 'drizzle-orm'
import { db } from '@/db/client'
import { tenants, tenantFees, companies } from '@/db/schema'

export interface FeeBreakdownRow {
  company_id: number
  company_name: string
  fee_type: 'contabilidad' | 'remuneraciones'
  monthly_clp: number
  share_clp: number
}

export interface RevenueShareResult {
  tenant_id: number
  period: string  // YYYY-MM
  rate_contabilidad: number
  rate_remuneraciones: number
  total_contabilidad_clp: number
  total_remuneraciones_clp: number
  share_contabilidad_clp: number
  share_remuneraciones_clp: number
  total_share_clp: number
  detail: FeeBreakdownRow[]
}

export function lastDayOfPeriod(period: string): string {
  // period is YYYY-MM. Return YYYY-MM-DD of last day (date string).
  const [y, m] = period.split('-').map(Number)
  if (!y || !m) throw new Error(`Invalid period: ${period}`)
  // Last day = day 0 of next month in JS Date
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${period}-${String(lastDay).padStart(2, '0')}`
}

export function firstDayOfPeriod(period: string): string {
  return `${period}-01`
}

/**
 * Calculate revenue-share totals for a tenant + period.
 * Does not write anything — caller persists the run row.
 */
export async function calculateRevenueShare(
  tenantId: number,
  period: string,
): Promise<RevenueShareResult> {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error(`Invalid period (expected YYYY-MM): ${period}`)
  }

  const tenantRows = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1)
  const tenant = tenantRows[0]
  if (!tenant) throw new Error(`tenant ${tenantId} not found`)

  const rateContabilidad   = Number(tenant.revenue_share_rate_contabilidad)
  const rateRemuneraciones = Number(tenant.revenue_share_rate_remuneraciones)

  const periodStart = firstDayOfPeriod(period)
  const periodEnd   = lastDayOfPeriod(period)

  // Active fees in the period: valid_from <= periodEnd AND (valid_to IS NULL OR valid_to >= periodStart) AND active.
  const rows = await db
    .select({
      fee_id:        tenantFees.id,
      company_id:    tenantFees.company_id,
      fee_type:      tenantFees.fee_type,
      monthly_clp:   tenantFees.monthly_clp,
      company_name:  companies.razon_social,
    })
    .from(tenantFees)
    .innerJoin(companies, eq(companies.id, tenantFees.company_id))
    .where(
      and(
        eq(tenantFees.tenant_id, tenantId),
        eq(tenantFees.active, true),
        lte(tenantFees.valid_from, periodEnd),
        or(isNull(tenantFees.valid_to), gte(tenantFees.valid_to, periodStart)),
      ),
    )
    .orderBy(tenantFees.company_id)

  const detail: FeeBreakdownRow[] = []
  let totalCont = 0
  let totalRem = 0

  for (const r of rows) {
    const isCont = r.fee_type === 'contabilidad'
    const rate = isCont ? rateContabilidad : rateRemuneraciones
    const shareClp = Math.round(r.monthly_clp * rate)
    detail.push({
      company_id:   r.company_id,
      company_name: r.company_name,
      fee_type:     r.fee_type as 'contabilidad' | 'remuneraciones',
      monthly_clp:  r.monthly_clp,
      share_clp:    shareClp,
    })
    if (isCont) totalCont += r.monthly_clp
    else        totalRem  += r.monthly_clp
  }

  const shareCont = Math.round(totalCont * rateContabilidad)
  const shareRem  = Math.round(totalRem  * rateRemuneraciones)

  return {
    tenant_id:                  tenantId,
    period,
    rate_contabilidad:          rateContabilidad,
    rate_remuneraciones:        rateRemuneraciones,
    total_contabilidad_clp:     totalCont,
    total_remuneraciones_clp:   totalRem,
    share_contabilidad_clp:     shareCont,
    share_remuneraciones_clp:   shareRem,
    total_share_clp:            shareCont + shareRem,
    detail,
  }
}

/** Avoid unused-import warning when only types from sql are needed in future edits. */
void sql
