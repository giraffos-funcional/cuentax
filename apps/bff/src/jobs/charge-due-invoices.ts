/**
 * Cron: charge invoices that are due today.
 *
 * Daily at 09:00 CLT. For each `issued` invoice with due_at <= now and
 * a tenant subscription with a saved `payment_method_token`, fire a
 * one-shot Mercado Pago payment for invoice.total_clp. On approved →
 * mark invoice paid; on failure → past_due + queue dunning attempt.
 *
 * Refs: docs/multitenancy/phase-02-billing.md T2.7
 */
import type { Job, Queue, Worker } from 'bullmq'
import { eq, and, lte } from 'drizzle-orm'
import { db } from '@/db/client'
import { invoices, subscriptions, tenants } from '@/db/schema'
import { getBillingProvider } from '@/services/billing.service'
import { logger } from '@/core/logger'
import { config } from '@/core/config'
import { createQueue, createWorker } from '@/core/queue'

const QUEUE_NAME = 'charge-due-invoices'
let queue: Queue | null = null
let worker: Worker | null = null

async function processChargeDue(_job: Job): Promise<void> {
  if (!config.MP_ACCESS_TOKEN) {
    logger.warn('charge-due skipped: MP_ACCESS_TOKEN not configured')
    return
  }
  const provider = getBillingProvider()
  const now = new Date()

  const due = await db
    .select({
      inv: invoices,
      sub: subscriptions,
      ten: tenants,
    })
    .from(invoices)
    .innerJoin(subscriptions, eq(subscriptions.id, invoices.subscription_id))
    .innerJoin(tenants,       eq(tenants.id, invoices.tenant_id))
    .where(
      and(
        eq(invoices.status, 'issued'),
        lte(invoices.due_at, now),
      ),
    )

  let charged = 0
  let failed  = 0

  for (const row of due) {
    if (!row.sub.payment_method_token) {
      logger.info({ invoiceId: row.inv.id, tenantId: row.ten.id }, 'charge.no_payment_method_skip')
      continue
    }
    try {
      const result = await provider.chargeOneTime({
        tenant: {
          id:    row.ten.id,
          slug:  row.ten.slug,
          name:  row.ten.name,
          email: row.ten.billing_email ?? `billing+${row.ten.slug}@cuentax.cl`,
        },
        amount_clp: row.inv.total_clp,
        description: `Cuentax — ${row.inv.period}`,
        idempotency_key: `inv-${row.inv.id}`,
        payment_method_token: row.sub.payment_method_token,
      })
      if (result.status === 'approved') {
        await db
          .update(invoices)
          .set({ status: 'paid', paid_at: now })
          .where(eq(invoices.id, row.inv.id))
        await db
          .update(tenants)
          .set({ status: 'active', updated_at: now })
          .where(and(eq(tenants.id, row.ten.id), eq(tenants.status, 'past_due')))
        charged += 1
        logger.info({ invoiceId: row.inv.id, providerTxn: result.provider_txn_id }, 'charge.approved')
      } else {
        await db
          .update(invoices)
          .set({ status: 'past_due', updated_at: now })
          .where(eq(invoices.id, row.inv.id))
        await db
          .update(tenants)
          .set({ status: 'past_due', updated_at: now })
          .where(eq(tenants.id, row.ten.id))
        failed += 1
        logger.warn({ invoiceId: row.inv.id, status: result.status, reason: result.failure_reason }, 'charge.declined')
      }
    } catch (err) {
      logger.error({ err, invoiceId: row.inv.id }, 'charge.exception')
      failed += 1
    }
  }
  logger.info({ total: due.length, charged, failed }, 'charge.cron_completed')
}

export function startChargeDue(): { queue: Queue; worker: Worker } {
  if (queue && worker) return { queue, worker }
  queue  = createQueue(QUEUE_NAME)
  worker = createWorker(QUEUE_NAME, processChargeDue)

  // Daily 09:00 CLT (= 12:00 UTC during CLT, 13:00 during CLST). Use UTC.
  queue.add(
    'daily-charge',
    {},
    { repeat: { pattern: '0 12 * * *' }, jobId: 'invoices-daily-charge' },
  ).catch((err) => logger.error({ err }, 'charge.cron_schedule_failed'))

  logger.info('✅ daily charge-due cron scheduled')
  return { queue, worker }
}

export async function stopChargeDue(): Promise<void> {
  if (worker) await worker.close()
  if (queue)  await queue.close()
  worker = null
  queue = null
}
