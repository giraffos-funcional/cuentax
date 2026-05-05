import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { companies } from '@/db/schema'
import { issueApiKey, listApiKeysForTenant, revokeApiKey, rotateApiKey } from '@/services/api-keys.service'
import { audit } from '@/services/audit.service'

export async function apiKeysRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    return reply.send({ data: await listApiKeysForTenant(request.tenantId) })
  })

  fastify.post('/', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    const body = z.object({
      name:       z.string().min(1).max(120),
      company_id: z.number().int().positive(),
      scopes:     z.array(z.string()).default([]),
      expires_at: z.string().datetime().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'validation_error', details: body.error.flatten().fieldErrors })

    // Verify the company belongs to this tenant.
    const co = await db.select().from(companies).where(eq(companies.id, body.data.company_id)).limit(1)
    if (!co[0] || co[0].tenant_id !== request.tenantId) {
      return reply.code(403).send({ error: 'company_not_in_tenant' })
    }

    const issued = await issueApiKey({
      companyId: body.data.company_id,
      name:      body.data.name,
      scopes:    body.data.scopes,
      expiresAt: body.data.expires_at ? new Date(body.data.expires_at) : null,
    })
    await audit({
      action: 'tenant.api_key_issued',
      tenant_id: request.tenantId,
      company_id: body.data.company_id,
      resource: 'api_key', resource_id: issued.id,
      payload: { name: body.data.name, scopes: body.data.scopes },
    })
    return reply.code(201).send(issued)
  })

  fastify.post('/:id/rotate', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    const id = Number((request.params as { id: string }).id)
    const result = await rotateApiKey({ id, tenantId: request.tenantId })
    if (!result) return reply.code(404).send({ error: 'not_found' })
    await audit({
      action: 'tenant.api_key_rotated',
      tenant_id: request.tenantId,
      resource: 'api_key', resource_id: id,
      payload: { new_key_id: result.id },
    })
    return reply.send(result)
  })

  fastify.delete('/:id', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    const id = Number((request.params as { id: string }).id)
    const ok = await revokeApiKey({ id, tenantId: request.tenantId })
    if (!ok) return reply.code(404).send({ error: 'not_found' })
    await audit({
      action: 'tenant.api_key_revoked',
      tenant_id: request.tenantId,
      resource: 'api_key', resource_id: id,
    })
    return reply.send({ ok: true })
  })
}
