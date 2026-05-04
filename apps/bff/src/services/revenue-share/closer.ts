/**
 * Persist a revenue-share run for a tenant + period. Idempotent on
 * (tenant_id, period) — re-running before lock just refreshes totals.
 *
 * Refs: docs/multitenancy/phase-03-revenue-share.md T3.5
 */
import { eq, and } from 'drizzle-orm'
import { db } from '@/db/client'
import { revenueShareRuns } from '@/db/schema'
import { calculateRevenueShare, type RevenueShareResult } from './calculator'
import { logger } from '@/core/logger'

export async function closeRevenueShare(
  tenantId: number,
  period: string,
): Promise<{ run_id: number; result: RevenueShareResult; status: string }> {
  // If already locked, do not recompute.
  const existing = await db
    .select()
    .from(revenueShareRuns)
    .where(and(eq(revenueShareRuns.tenant_id, tenantId), eq(revenueShareRuns.period, period)))
    .limit(1)

  if (existing[0] && (existing[0].status === 'locked' || existing[0].status === 'paid')) {
    logger.info({ tenantId, period, status: existing[0].status }, 'rs.run_already_locked')
    return {
      run_id: existing[0].id,
      result: {
        tenant_id: tenantId,
        period,
        rate_contabilidad:        Number(existing[0].rate_contabilidad),
        rate_remuneraciones:      Number(existing[0].rate_remuneraciones),
        total_contabilidad_clp:   existing[0].total_contabilidad_clp,
        total_remuneraciones_clp: existing[0].total_remuneraciones_clp,
        share_contabilidad_clp:   existing[0].share_contabilidad_clp,
        share_remuneraciones_clp: existing[0].share_remuneraciones_clp,
        total_share_clp:          existing[0].total_share_clp,
        detail:                   (existing[0].detail as never[] | null) ?? [],
      },
      status: existing[0].status,
    }
  }

  const result = await calculateRevenueShare(tenantId, period)

  if (existing[0]) {
    const [row] = await db
      .update(revenueShareRuns)
      .set({
        rate_contabilidad:        result.rate_contabilidad.toFixed(4),
        rate_remuneraciones:      result.rate_remuneraciones.toFixed(4),
        total_contabilidad_clp:   result.total_contabilidad_clp,
        total_remuneraciones_clp: result.total_remuneraciones_clp,
        share_contabilidad_clp:   result.share_contabilidad_clp,
        share_remuneraciones_clp: result.share_remuneraciones_clp,
        total_share_clp:          result.total_share_clp,
        detail:                   result.detail,
        status:                   'ready',
        calculated_at:            new Date(),
      })
      .where(eq(revenueShareRuns.id, existing[0].id))
      .returning()
    return { run_id: row!.id, result, status: row!.status }
  }

  const [row] = await db
    .insert(revenueShareRuns)
    .values({
      tenant_id:                tenantId,
      period,
      status:                   'ready',
      rate_contabilidad:        result.rate_contabilidad.toFixed(4),
      rate_remuneraciones:      result.rate_remuneraciones.toFixed(4),
      total_contabilidad_clp:   result.total_contabilidad_clp,
      total_remuneraciones_clp: result.total_remuneraciones_clp,
      share_contabilidad_clp:   result.share_contabilidad_clp,
      share_remuneraciones_clp: result.share_remuneraciones_clp,
      total_share_clp:          result.total_share_clp,
      detail:                   result.detail,
      calculated_at:            new Date(),
    })
    .returning()

  if (!row) throw new Error('Failed to insert revenue_share_run')
  logger.info(
    { tenantId, period, runId: row.id, total_share_clp: result.total_share_clp },
    'rs.run_created',
  )
  return { run_id: row.id, result, status: row.status }
}

export async function lockRun(runId: number): Promise<void> {
  await db
    .update(revenueShareRuns)
    .set({ status: 'locked', locked_at: new Date() })
    .where(eq(revenueShareRuns.id, runId))
}
