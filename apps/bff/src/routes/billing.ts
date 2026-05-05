/**
 * Billing routes — tenant-scoped customer portal endpoints.
 *
 * Today: setup-intent (create MP preapproval, return init_point).
 * Next: list invoices, change plan, cancel, update card.
 *
 * Refs: docs/multitenancy/phase-02-billing.md T2.4
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { db } from '@/db/client'
import { subscriptions, invoices, plans } from '@/db/schema'
import { createSetupIntent, getBillingProvider } from '@/services/billing.service'
import { generateInvoicePdf } from '@/services/billing/invoice-pdf.service'
import { audit } from '@/services/audit.service'
import { exportTenant } from '@/services/tenant-export.service'
import { logger } from '@/core/logger'

const setupSchema = z.object({
  plan_code: z.string().min(1),
})

export async function billingRoutes(fastify: FastifyInstance) {
  // ── POST /api/v1/billing/setup-intent ─────────────────────────
  fastify.post('/setup-intent', async (request, reply) => {
    if (!request.tenantId) {
      return reply.code(400).send({ error: 'tenant_required' })
    }
    const parsed = setupSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', details: parsed.error.flatten().fieldErrors })
    }
    try {
      const result = await createSetupIntent(request.tenantId, parsed.data.plan_code)
      return reply.send(result)
    } catch (err) {
      logger.error({ err, tenantId: request.tenantId }, 'billing.setup_intent_failed')
      return reply.code(500).send({ error: 'setup_intent_failed', message: (err as Error).message })
    }
  })

  // ── GET /api/v1/billing/subscription ──────────────────────────
  fastify.get('/subscription', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    const rows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenant_id, request.tenantId))
      .orderBy(desc(subscriptions.created_at))
      .limit(1)
    return reply.send(rows[0] ?? null)
  })

  // ── GET /api/v1/billing/invoices ──────────────────────────────
  fastify.get('/invoices', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    const rows = await db
      .select()
      .from(invoices)
      .where(eq(invoices.tenant_id, request.tenantId))
      .orderBy(desc(invoices.period))
      .limit(50)
    return reply.send({ data: rows })
  })

  // ── POST /api/v1/billing/change-plan ──────────────────────────
  // Cambio de plan (efectivo en próximo período): updates subscription.plan_id.
  // Si el upgrade lo justifica, podríamos prorratear con un payment one-shot;
  // por ahora dejamos esa decisión manual al admin (POST admin/billing/invoices/generate).
  fastify.post('/change-plan', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    const body = z.object({ plan_code: z.string().min(1) }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'validation_error', details: body.error.flatten().fieldErrors })

    const planRows = await db.select().from(plans).where(eq(plans.code, body.data.plan_code)).limit(1)
    const plan = planRows[0]
    if (!plan) return reply.code(404).send({ error: 'plan_not_found' })

    const subRows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenant_id, request.tenantId))
      .orderBy(desc(subscriptions.created_at))
      .limit(1)
    const sub = subRows[0]
    if (!sub) return reply.code(404).send({ error: 'no_subscription' })

    await db
      .update(subscriptions)
      .set({ plan_id: plan.id, updated_at: new Date() })
      .where(eq(subscriptions.id, sub.id))

    await audit({
      action: 'tenant.plan_changed',
      tenant_id: request.tenantId,
      resource: 'subscription', resource_id: sub.id,
      payload: { from_plan_id: sub.plan_id, to_plan_id: plan.id, to_plan_code: plan.code },
    })
    logger.info({ tenantId: request.tenantId, fromPlan: sub.plan_id, toPlan: plan.id }, 'subscription.plan_changed')
    return reply.send({ ok: true, plan_id: plan.id, plan_code: plan.code })
  })

  // ── POST /api/v1/billing/cancel ───────────────────────────────
  // Cancela la suscripción (default: efectivo a fin de período).
  fastify.post('/cancel', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    const body = z.object({
      immediate: z.boolean().default(false),
      reason: z.string().max(500).optional(),
    }).safeParse(request.body ?? {})
    if (!body.success) return reply.code(400).send({ error: 'validation_error' })

    const subRows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenant_id, request.tenantId))
      .orderBy(desc(subscriptions.created_at))
      .limit(1)
    const sub = subRows[0]
    if (!sub) return reply.code(404).send({ error: 'no_subscription' })

    if (body.data.immediate) {
      // Try to cancel at provider as well; ignore failure (idempotent on our side).
      if (sub.provider_subscription_id) {
        try {
          const provider = getBillingProvider()
          await provider.cancelSubscription({ provider_subscription_id: sub.provider_subscription_id })
        } catch (err) {
          logger.warn({ err, subId: sub.id }, 'subscription.provider_cancel_failed')
        }
      }
      await db.update(subscriptions)
        .set({ status: 'cancelled', cancelled_at: new Date(), updated_at: new Date() })
        .where(eq(subscriptions.id, sub.id))
    } else {
      await db.update(subscriptions)
        .set({ cancel_at_period_end: true, updated_at: new Date() })
        .where(eq(subscriptions.id, sub.id))
    }

    await audit({
      action: body.data.immediate ? 'tenant.subscription_cancelled_now' : 'tenant.subscription_cancel_scheduled',
      tenant_id: request.tenantId,
      resource: 'subscription', resource_id: sub.id,
      payload: { reason: body.data.reason },
    })
    logger.info({ tenantId: request.tenantId, immediate: body.data.immediate }, 'subscription.cancelled')
    return reply.send({ ok: true, cancel_at_period_end: !body.data.immediate, immediate: body.data.immediate })
  })

  // ── GET /api/v1/billing/export ────────────────────────────────
  fastify.get('/export', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    const data = await exportTenant(request.tenantId)
    await audit({ action: 'tenant.data_exported', tenant_id: request.tenantId })
    return reply
      .header('Content-Disposition', `attachment; filename="cuentax-export-tenant-${request.tenantId}.json"`)
      .header('Content-Type', 'application/json')
      .send(data)
  })

  // ── GET /api/v1/billing/invoices/:id/pdf ──────────────────────
  fastify.get('/invoices/:id/pdf', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    const id = Number((request.params as { id: string }).id)
    // Verify the invoice belongs to the active tenant before serving.
    const owned = await db.select().from(invoices)
      .where(eq(invoices.id, id))
      .limit(1)
    if (!owned[0] || owned[0].tenant_id !== request.tenantId) {
      return reply.code(404).send({ error: 'not_found' })
    }
    try {
      const pdf = await generateInvoicePdf(id)
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="cuentax-invoice-${owned[0].period}-${id}.pdf"`)
        .send(pdf)
    } catch (err) {
      logger.error({ err, id }, 'invoice_pdf_failed')
      return reply.code(500).send({ error: 'pdf_generation_failed' })
    }
  })
}
