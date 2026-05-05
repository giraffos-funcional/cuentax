/**
 * Tenant-managed webhook subscriptions (outbound).
 * Path: /api/v1/webhook-endpoints
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { companies } from '@/db/schema'
import { createWebhook, listWebhooksForTenant, revokeWebhook } from '@/services/webhooks.service'
import { audit } from '@/services/audit.service'

const KNOWN_EVENTS = [
  'dte.emitted',
  'dte.accepted',
  'dte.rejected',
  'invoice.issued',
  'invoice.paid',
  'subscription.cancelled',
] as const

export async function webhooksConfigRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    return reply.send({
      data: await listWebhooksForTenant(request.tenantId),
      known_events: KNOWN_EVENTS,
    })
  })

  fastify.post('/', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    const body = z.object({
      company_id: z.number().int().positive(),
      url:        z.string().url().refine((u) => u.startsWith('https://'), 'must be https'),
      events:     z.array(z.enum(KNOWN_EVENTS)).min(1),
    }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'validation_error', details: body.error.flatten().fieldErrors })

    const co = await db.select().from(companies).where(eq(companies.id, body.data.company_id)).limit(1)
    if (!co[0] || co[0].tenant_id !== request.tenantId) {
      return reply.code(403).send({ error: 'company_not_in_tenant' })
    }

    try {
      const result = await createWebhook({
        companyId: body.data.company_id,
        url:       body.data.url,
        events:    body.data.events,
      })
      await audit({
        action: 'tenant.webhook_created',
        tenant_id: request.tenantId,
        company_id: body.data.company_id,
        resource: 'webhook_endpoint', resource_id: result.endpoint.id,
        payload: { url: body.data.url, events: body.data.events },
      })
      return reply.code(201).send(result)
    } catch (err) {
      return reply.code(400).send({ error: 'invalid_input', message: (err as Error).message })
    }
  })

  fastify.delete('/:id', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    const id = Number((request.params as { id: string }).id)
    const ok = await revokeWebhook({ id, tenantId: request.tenantId })
    if (!ok) return reply.code(404).send({ error: 'not_found' })
    await audit({
      action: 'tenant.webhook_revoked',
      tenant_id: request.tenantId,
      resource: 'webhook_endpoint', resource_id: id,
    })
    return reply.send({ ok: true })
  })
}
