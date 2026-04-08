/**
 * CUENTAX — RCV Sync Job (BullMQ)
 * =================================
 * Automated daily sync of the Registro de Compras y Ventas from SII.
 *
 * Schedule: daily at 01:00 Chile/Santiago time via BullMQ cron.
 * Syncs current month and previous month for all companies with auto-sync enabled.
 * Can also be triggered manually via POST /api/v1/contabilidad/rcv/sync.
 */

import type { Job, Queue, Worker } from 'bullmq'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { companies } from '@/db/schema'
import { syncRCVFull } from '@/services/rcv-sync.service'
import { logger } from '@/core/logger'
import { createQueue, createWorker } from '@/core/queue'

// ---------------------------------------------------------------------------
// Queue & constants
// ---------------------------------------------------------------------------

const QUEUE_NAME = 'rcv-sync'

let queue: Queue | null = null
let worker: Worker | null = null

// ---------------------------------------------------------------------------
// Job processor
// ---------------------------------------------------------------------------

async function processRCVSync(job: Job): Promise<void> {
  logger.info({ jobId: job.id, data: job.data }, 'Running RCV sync job')

  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()

  // Calculate previous month
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1
  const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear

  // If manual trigger with specific period, use that
  if (job.data?.companyId && job.data?.mes && job.data?.year) {
    const result = await syncRCVFull(job.data.companyId, job.data.mes, job.data.year)
    logger.info({ companyId: job.data.companyId, result }, 'Manual RCV sync completed')
    return
  }

  // Auto-sync: get all companies with auto-sync enabled
  const companiesWithSync = await db.select({
    id: companies.id,
    rut: companies.rut,
    razon_social: companies.razon_social,
  })
    .from(companies)
    .where(eq(companies.sii_rcv_auto_sync, true))

  if (companiesWithSync.length === 0) {
    logger.info('No companies with RCV auto-sync enabled — skipping')
    return
  }

  logger.info({ companyCount: companiesWithSync.length }, 'Starting RCV auto-sync for all enabled companies')

  for (const company of companiesWithSync) {
    try {
      // Sync current month
      const currentResult = await syncRCVFull(company.id, currentMonth, currentYear)
      logger.info({
        companyId: company.id,
        rut: company.rut,
        period: `${currentYear}-${currentMonth}`,
        compras: currentResult.compras.totalRegistros,
        ventas: currentResult.ventas.totalRegistros,
      }, 'RCV sync current month done')

      // Sync previous month (to catch late documents)
      const prevResult = await syncRCVFull(company.id, prevMonth, prevYear)
      logger.info({
        companyId: company.id,
        period: `${prevYear}-${prevMonth}`,
        compras: prevResult.compras.totalRegistros,
        ventas: prevResult.ventas.totalRegistros,
      }, 'RCV sync previous month done')
    } catch (err) {
      // Don't fail the entire job for one company
      logger.error({ err, companyId: company.id }, 'RCV sync failed for company — continuing with next')
    }
  }

  logger.info({ companyCount: companiesWithSync.length }, 'RCV auto-sync completed for all companies')
}

// ---------------------------------------------------------------------------
// Lifecycle: start / stop
// ---------------------------------------------------------------------------

/**
 * Initialize the RCV sync queue and worker.
 * Registers a repeatable job that fires daily at 01:00 Chile/Santiago time.
 */
export async function startRCVSync(): Promise<void> {
  queue = createQueue(QUEUE_NAME)
  worker = createWorker(QUEUE_NAME, processRCVSync)

  // Daily at 01:00 Chile time (off-peak)
  await queue.upsertJobScheduler(
    'rcv-daily',
    { pattern: '0 1 * * *', tz: 'America/Santiago' },
    {
      name: 'sync-rcv-daily',
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 120_000 },
      },
    },
  )

  logger.info('RCV Sync started (BullMQ, daily 01:00 CLT)')
}

/**
 * Gracefully shut down the worker and close the queue.
 */
export async function stopRCVSync(): Promise<void> {
  if (worker) {
    await worker.close()
    worker = null
  }
  if (queue) {
    await queue.close()
    queue = null
  }
  logger.info('RCV Sync stopped')
}

/**
 * Get the queue instance for admin/status endpoints.
 */
export function getRCVSyncQueue(): Queue | null {
  return queue
}

/**
 * Trigger a manual sync for a specific company/period.
 */
export async function triggerManualRCVSync(companyId: number, mes: number, year: number): Promise<string | undefined> {
  if (!queue) {
    throw new Error('RCV sync queue not initialized')
  }

  const job = await queue.add('sync-rcv-manual', { companyId, mes, year }, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 30_000 },
  })

  return job.id
}
