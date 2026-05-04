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
import { subscriptions, invoices } from '@/db/schema'
import { createSetupIntent } from '@/services/billing.service'
import { generateInvoicePdf } from '@/services/billing/invoice-pdf.service'
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
