/**
 * Cron: close revenue-share for every active tenant.
 *
 * Schedule: 1st of each month at 04:00 America/Santiago. Idempotent
 * thanks to (tenant_id, period) unique key on revenue_share_runs.
 *
 * Refs: docs/multitenancy/phase-03-revenue-share.md T3.5
 */
import type { Job, Queue, Worker } from 'bullmq'
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/db/client'
import { tenants } from '@/db/schema'
import { closeRevenueShare } from '@/services/revenue-share/closer'
import { logger } from '@/core/logger'
import { createQueue, createWorker } from '@/core/queue'

const QUEUE_NAME = 'close-revenue-share'
let queue: Queue | null = null
let worker: Worker | null = null

function previousPeriodSantiago(): string {
  // Compute "last month" in America/Santiago tz, formatted as YYYY-MM.
  const now = new Date()
  const sct = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  const y = Number(sct.find((p) => p.type === 'year')!.value)
  const m = Number(sct.find((p) => p.type === 'month')!.value)
  // Previous month
  const prevY = m === 1 ? y - 1 : y
  const prevM = m === 1 ? 12    : m - 1
  return `${prevY}-${String(prevM).padStart(2, '0')}`
}

async function processCloseAll(_job: Job): Promise<void> {
  const period = previousPeriodSantiago()
  logger.info({ period }, 'rs.cron_started')

  const activeTenants = await db
    .select({ id: tenants.id, slug: tenants.slug })
    .from(tenants)
    .where(inArray(tenants.status, ['active', 'past_due', 'trialing']))

  let success = 0
  let failed = 0
  for (const t of activeTenants) {
    try {
      const r = await closeRevenueShare(t.id, period)
      logger.info(
        { tenantId: t.id, slug: t.slug, period, runId: r.run_id, total: r.result.total_share_clp },
        'rs.cron_closed_tenant',
      )
      success += 1
    } catch (err) {
      logger.error({ err, tenantId: t.id, slug: t.slug, period }, 'rs.cron_close_failed')
      failed += 1
    }
  }
  logger.info({ period, success, failed, total: activeTenants.length }, 'rs.cron_completed')

  // Suppress eq unused
  void eq
}

export function startCloseRevenueShare(): { queue: Queue; worker: Worker } {
  if (queue && worker) return { queue, worker }
  queue = createQueue(QUEUE_NAME)
  worker = createWorker(QUEUE_NAME, processCloseAll)

  // Repeatable: 1st of every month, 04:00 CLT (= 07:00 UTC during CLT,
  // 08:00 UTC during CLST). Use a UTC cron and accept the ~1h drift.
  queue.add(
    'monthly-close',
    {},
    {
      repeat: { pattern: '0 7 1 * *' }, // 07:00 UTC on day 1
      jobId: 'rs-monthly-close',
    },
  ).catch((err) => logger.error({ err }, 'rs.cron_schedule_failed'))

  logger.info('✅ revenue-share monthly close cron scheduled')
  return { queue, worker }
}

export async function stopCloseRevenueShare(): Promise<void> {
  if (worker) await worker.close()
  if (queue)  await queue.close()
  worker = null
  queue = null
}

export function getCloseRevenueShareQueue(): Queue | null {
  return queue
}

/** Manual trigger for tests / admin dashboards. */
export async function triggerManualClose(period?: string): Promise<void> {
  const q = queue ?? createQueue(QUEUE_NAME)
  await q.add('manual-close', { period: period ?? previousPeriodSantiago() })
}
