/**
 * CUENTAX — Contacts Routes (BFF)
 * GET  /api/v1/contacts
 * GET  /api/v1/contacts/:id
 * POST /api/v1/contacts
 * PUT  /api/v1/contacts/:id
 * DELETE /api/v1/contacts/:id
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authGuard } from '@/middlewares/auth-guard'
import { contactsRepository } from '@/repositories/contacts.repository'
import { odooSyncService } from '@/services/odoo-sync.service'
import { logger } from '@/core/logger'

const contactSchema = z.object({
  rut: z.string().min(9),
  razon_social: z.string().min(2),
  giro: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  telefono: z.string().optional(),
  direccion: z.string().optional(),
  comuna: z.string().optional(),
  es_cliente: z.boolean().default(true),
  es_proveedor: z.boolean().default(false),
  notas: z.string().optional(),
})

export async function contactsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  fastify.get('/', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as any
    const result = await contactsRepository.findMany(user.company_id, {
      search:      q.search,
      es_cliente:  q.tipo === 'clientes'    ? true : q.tipo === 'proveedores' ? undefined : undefined,
      es_proveedor: q.tipo === 'proveedores' ? true : undefined,
      page:   q.page  ? Number(q.page)  : 1,
      limit:  q.limit ? Number(q.limit) : 50,
    })
    return reply.send(result)
  })

  fastify.get('/:id', async (req, reply) => {
    const user = (req as any).user
    const { id } = req.params as { id: string }
    const contact = await contactsRepository.findById(Number(id), user.company_id)
    if (!contact) return reply.status(404).send({ error: 'not_found' })
    return reply.send(contact)
  })

  fastify.post('/', async (req, reply) => {
    const user = (req as any).user
    const parse = contactSchema.safeParse(req.body)
    if (!parse.success) return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten() })
    const contact = await contactsRepository.create({ ...parse.data, company_id: user.company_id })

    // Sync to Odoo (non-blocking)
    odooSyncService.syncContactToOdoo(parse.data, user.company_id).catch(err => {
      logger.warn({ err, rut: parse.data.rut }, 'Odoo contact sync failed')
    })

    return reply.status(201).send(contact)
  })

  fastify.put('/:id', async (req, reply) => {
    const user = (req as any).user
    const { id } = req.params as { id: string }
    const parse = contactSchema.partial().safeParse(req.body)
    if (!parse.success) return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten() })
    const contact = await contactsRepository.update(Number(id), user.company_id, parse.data)
    if (!contact) return reply.status(404).send({ error: 'not_found' })
    return reply.send(contact)
  })

  fastify.delete('/:id', async (req, reply) => {
    const user = (req as any).user
    const { id } = req.params as { id: string }
    await contactsRepository.softDelete(Number(id), user.company_id)
    return reply.status(204).send()
  })
}
