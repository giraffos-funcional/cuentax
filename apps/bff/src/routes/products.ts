/**
 * CUENTAX — Products Routes (BFF)
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authGuard } from '@/middlewares/auth-guard'
import { productsRepository } from '@/repositories/products.repository'
import { odooSyncService } from '@/services/odoo-sync.service'
import { logger } from '@/core/logger'

const productSchema = z.object({
  codigo: z.string().optional(),
  nombre: z.string().min(2),
  descripcion: z.string().optional(),
  precio: z.number().positive(),
  unidad: z.string().default('UN'),
  exento: z.boolean().default(false),
  categoria: z.string().optional(),
})

export async function productsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  fastify.get('/', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as any
    const result = await productsRepository.findMany(user.company_id, {
      search: q.search,
      exento: q.exento === 'true' ? true : q.exento === 'false' ? false : undefined,
      page:   q.page  ? Number(q.page)  : 1,
      limit:  q.limit ? Number(q.limit) : 50,
    })
    return reply.send(result)
  })

  fastify.post('/', async (req, reply) => {
    const user = (req as any).user
    const parse = productSchema.safeParse(req.body)
    if (!parse.success) return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten() })
    const p = await productsRepository.create({
      ...parse.data,
      company_id: user.company_id,
      precio_con_iva: parse.data.exento ? parse.data.precio : Math.round(parse.data.precio * 1.19),
    })

    // Sync to Odoo (non-blocking)
    odooSyncService.syncProductToOdoo({
      codigo: parse.data.codigo,
      nombre: parse.data.nombre,
      precio: parse.data.precio,
      exento: parse.data.exento,
    }, user.company_id).catch(err => {
      logger.warn({ err, nombre: parse.data.nombre }, 'Odoo product sync failed')
    })

    return reply.status(201).send(p)
  })

  fastify.put('/:id', async (req, reply) => {
    const user = (req as any).user
    const { id } = req.params as { id: string }
    const parse = productSchema.partial().safeParse(req.body)
    if (!parse.success) return reply.status(400).send({ error: 'validation_error' })
    const p = await productsRepository.update(Number(id), user.company_id, parse.data as any)
    if (!p) return reply.status(404).send({ error: 'not_found' })
    return reply.send(p)
  })

  fastify.delete('/:id', async (req, reply) => {
    const user = (req as any).user
    const { id } = req.params as { id: string }
    await productsRepository.softDelete(Number(id), user.company_id)
    return reply.status(204).send()
  })
}
