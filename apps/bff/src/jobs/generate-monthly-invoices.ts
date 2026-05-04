/**
 * Cron: generate monthly invoices for every active tenant.
 *
 * Schedule: 1st of each month at 02:00 America/Santiago. Idempotent
 * thanks to (tenant_id, period) UNIQUE on invoices and the generator's
 * "skip when not draft" guard.
 *
 * Refs: docs/multitenancy/phase-02-billing.md T2.6
 */
import type { Job, Queue, Worker } from 'bullmq'
import { inArray } from 'drizzle-orm'
import { db } from '@/db/client'
import { tenants } from '@/db/schema'
import { generateMonthlyInvoice } from '@/services/billing/invoice-generator'
import { logger } from '@/core/logger'
import { createQueue, createWorker } from '@/core/queue'

const QUEUE_NAME = 'generate-monthly-invoices'
let queue: Queue | null = null
let worker: Worker | null = null

function previousPeriodSantiago(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  const y = Number(parts.find((p) => p.type === 'year')!.value)
  const m = Number(parts.find((p) => p.type === 'month')!.value)
  const prevY = m === 1 ? y - 1 : y
  const prevM = m === 1 ? 12    : m - 1
  return `${prevY}-${String(prevM).padStart(2, '0')}`
}

async function processGenerateAll(_job: Job): Promise<void> {
  const period = previousPeriodSantiago()
  logger.info({ period }, 'invoices.cron_started')

  const activeTenants = await db
    .select({ id: tenants.id, slug: tenants.slug })
    .from(tenants)
    .where(inArray(tenants.status, ['active', 'past_due']))

  let success = 0
  let skipped = 0
  let failed = 0

  for (const t of activeTenants) {
    try {
      const r = await generateMonthlyInvoice({ tenantId: t.id, period })
      if (r.created) success += 1
      else           skipped += 1
      logger.info(
        { tenantId: t.id, slug: t.slug, period, invoiceId: r.invoice_id, total: r.total_clp, created: r.created },
        'invoices.cron_tenant_done',
      )
    } catch (err) {
      logger.error({ err, tenantId: t.id, slug: t.slug, period }, 'invoices.cron_tenant_failed')
      failed += 1
    }
  }
  logger.info({ period, success, skipped, failed, total: activeTenants.length }, 'invoices.cron_completed')
}

export function startGenerateMonthlyInvoices(): { queue: Queue; worker: Worker } {
  if (queue && worker) return { queue, worker }
  queue = createQueue(QUEUE_NAME)
  worker = createWorker(QUEUE_NAME, processGenerateAll)

  // 1st of each month at 02:00 CLT (~05:00 UTC during CLT, 06:00 during CLST).
  queue
    .add(
      'monthly-generate',
      {},
      { repeat: { pattern: '0 5 1 * *' }, jobId: 'invoices-monthly-generate' },
    )
    .catch((err) => logger.error({ err }, 'invoices.cron_schedule_failed'))

  logger.info('✅ monthly invoice generator cron scheduled')
  return { queue, worker }
}

export async function stopGenerateMonthlyInvoices(): Promise<void> {
  if (worker) await worker.close()
  if (queue)  await queue.close()
  worker = null
  queue = null
}

export async function triggerManualGenerate(period?: string): Promise<void> {
  const q = queue ?? createQueue(QUEUE_NAME)
  await q.add('manual-generate', { period: period ?? previousPeriodSantiago() })
}
