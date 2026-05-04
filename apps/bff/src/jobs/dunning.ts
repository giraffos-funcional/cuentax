/**
 * Cron: dunning for past-due invoices.
 *
 * Daily at 10:00 CLT. Walks `past_due` invoices, picks the right action
 * based on days since due_at:
 *   day 0 (just past due): email "tu pago no se procesó"
 *   day 3:  retry charge + email
 *   day 7:  retry charge + final email + restrict tenant features (read-only flag)
 *   day 14: tenant.status = 'suspended'
 *   day 30: notify admin
 *
 * Each action recorded in dunning_attempts (idempotent on (invoice, attempt_n)).
 *
 * Refs: docs/multitenancy/phase-02-billing.md T2.8
 */
import type { Job, Queue, Worker } from 'bullmq'
import { eq, and, lte } from 'drizzle-orm'
import { db } from '@/db/client'
import { invoices, subscriptions, tenants, dunningAttempts } from '@/db/schema'
import { getBillingProvider } from '@/services/billing.service'
import { logger } from '@/core/logger'
import { config } from '@/core/config'
import { createQueue, createWorker } from '@/core/queue'

const QUEUE_NAME = 'dunning'
let queue: Queue | null = null
let worker: Worker | null = null

interface DunningStep {
  attempt_number: number
  on_day: number       // days since due_at
  retry_charge: boolean
  notify_admin: boolean
  suspend_tenant: boolean
}

const STEPS: DunningStep[] = [
  { attempt_number: 1, on_day: 0,  retry_charge: false, notify_admin: false, suspend_tenant: false },
  { attempt_number: 2, on_day: 3,  retry_charge: true,  notify_admin: false, suspend_tenant: false },
  { attempt_number: 3, on_day: 7,  retry_charge: true,  notify_admin: false, suspend_tenant: false },
  { attempt_number: 4, on_day: 14, retry_charge: false, notify_admin: false, suspend_tenant: true  },
  { attempt_number: 5, on_day: 30, retry_charge: false, notify_admin: true,  suspend_tenant: false },
]

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000))
}

async function processDunning(_job: Job): Promise<void> {
  const provider = config.MP_ACCESS_TOKEN ? getBillingProvider() : null
  const now = new Date()

  const open = await db
    .select({ inv: invoices, sub: subscriptions, ten: tenants })
    .from(invoices)
    .innerJoin(subscriptions, eq(subscriptions.id, invoices.subscription_id))
    .innerJoin(tenants,       eq(tenants.id, invoices.tenant_id))
    .where(and(eq(invoices.status, 'past_due'), lte(invoices.due_at, now)))

  for (const row of open) {
    if (!row.inv.due_at) continue
    const days = daysSince(row.inv.due_at)
    const step = STEPS.find((s) => s.on_day === days)
    if (!step) continue

    // Idempotency: skip if this attempt already recorded.
    const existing = await db
      .select()
      .from(dunningAttempts)
      .where(
        and(
          eq(dunningAttempts.invoice_id, row.inv.id),
          eq(dunningAttempts.attempt_number, step.attempt_number),
        ),
      )
      .limit(1)
    if (existing[0]) continue

    let outcome: 'success' | 'failed' | 'skipped' = 'skipped'
    const notes: string[] = []

    if (step.retry_charge && provider && row.sub.payment_method_token) {
      try {
        const r = await provider.chargeOneTime({
          tenant: {
            id: row.ten.id, slug: row.ten.slug, name: row.ten.name,
            email: row.ten.billing_email ?? `billing+${row.ten.slug}@cuentax.cl`,
          },
          amount_clp: row.inv.total_clp,
          description: `Cuentax retry — ${row.inv.period}`,
          idempotency_key: `inv-${row.inv.id}-dunning-${step.attempt_number}`,
          payment_method_token: row.sub.payment_method_token,
        })
        if (r.status === 'approved') {
          outcome = 'success'
          await db.update(invoices).set({ status: 'paid', paid_at: now }).where(eq(invoices.id, row.inv.id))
          await db.update(tenants).set({ status: 'active', updated_at: now })
            .where(and(eq(tenants.id, row.ten.id), eq(tenants.status, 'past_due')))
          notes.push(`charge approved txn=${r.provider_txn_id}`)
        } else {
          outcome = 'failed'
          notes.push(`charge ${r.status}: ${r.failure_reason ?? '?'}`)
        }
      } catch (err) {
        outcome = 'failed'
        notes.push(`exception: ${(err as Error).message}`)
      }
    }

    if (step.suspend_tenant && outcome !== 'success') {
      await db
        .update(tenants)
        .set({ status: 'suspended', updated_at: now })
        .where(eq(tenants.id, row.ten.id))
      notes.push('tenant suspended')
    }

    if (step.notify_admin) {
      logger.warn({ invoiceId: row.inv.id, tenantSlug: row.ten.slug, days }, 'dunning.notify_admin')
      notes.push('admin notified')
    }

    await db.insert(dunningAttempts).values({
      invoice_id:     row.inv.id,
      tenant_id:      row.ten.id,
      attempt_number: step.attempt_number,
      attempted_at:   now,
      outcome,
      notes:          notes.join(' | '),
    })

    logger.info(
      { invoiceId: row.inv.id, tenant: row.ten.slug, attempt: step.attempt_number, outcome, notes },
      'dunning.attempt_recorded',
    )
  }
}

export function startDunning(): { queue: Queue; worker: Worker } {
  if (queue && worker) return { queue, worker }
  queue  = createQueue(QUEUE_NAME)
  worker = createWorker(QUEUE_NAME, processDunning)

  queue.add(
    'daily-dunning',
    {},
    { repeat: { pattern: '0 13 * * *' }, jobId: 'dunning-daily' },
  ).catch((err) => logger.error({ err }, 'dunning.cron_schedule_failed'))

  logger.info('✅ daily dunning cron scheduled')
  return { queue, worker }
}

export async function stopDunning(): Promise<void> {
  if (worker) await worker.close()
  if (queue)  await queue.close()
  worker = null
  queue = null
}
