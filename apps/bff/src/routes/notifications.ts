import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { listForTenant, unreadCount, markRead, markAllRead, archive } from '@/services/notifications.service'

export async function notificationsRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    const q = z.object({
      unread_only: z.enum(['true', 'false']).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).safeParse(request.query)
    if (!q.success) return reply.code(400).send({ error: 'validation_error' })
    const data = await listForTenant(request.tenantId, {
      unread_only: q.data.unread_only === 'true',
      limit: q.data.limit,
    })
    return reply.send({ data })
  })

  fastify.get('/unread-count', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    return reply.send({ count: await unreadCount(request.tenantId) })
  })

  fastify.post('/:id/read', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    const id = Number((request.params as { id: string }).id)
    const ok = await markRead(request.tenantId, id)
    if (!ok) return reply.code(404).send({ error: 'not_found' })
    return reply.send({ ok: true })
  })

  fastify.post('/read-all', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    const updated = await markAllRead(request.tenantId)
    return reply.send({ updated })
  })

  fastify.delete('/:id', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    const id = Number((request.params as { id: string }).id)
    const ok = await archive(request.tenantId, id)
    if (!ok) return reply.code(404).send({ error: 'not_found' })
    return reply.send({ ok: true })
  })
}
