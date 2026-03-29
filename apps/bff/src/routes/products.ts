/**
 * CUENTAX — Products Routes (BFF)
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authGuard } from '@/middlewares/auth-guard'
import { productsRepository } from '@/repositories/products.repository'
import { odooSyncService } from '@/services/odoo-sync.service'
import { odooAccountingAdapter } from '@/adapters/odoo-accounting.adapter'
import { logger } from '@/core/logger'
import { getLocalCompanyId } from '@/core/company-resolver'

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
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const q = req.query as any
    const result = await productsRepository.findMany(localCompanyId, {
      search: q.search,
      exento: q.exento === 'true' ? true : q.exento === 'false' ? false : undefined,
      page:   q.page  ? Number(q.page)  : 1,
      limit:  q.limit ? Number(q.limit) : 50,
    })
    return reply.send(result)
  })

  fastify.get('/:id', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }
    const product = await productsRepository.findById(Number(id), localCompanyId)
    if (!product) return reply.status(404).send({ error: 'not_found' })
    return reply.send(product)
  })

  fastify.post('/', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const parse = productSchema.safeParse(req.body)
    if (!parse.success) return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten() })
    const p = await productsRepository.create({
      ...parse.data,
      company_id: localCompanyId,
      precio_con_iva: parse.data.exento ? parse.data.precio : Math.round(parse.data.precio * 1.19),
    })

    // Sync to Odoo (non-blocking) — persist odoo_product_id on success
    odooSyncService.syncProductToOdoo({
      codigo: parse.data.codigo,
      nombre: parse.data.nombre,
      precio: parse.data.precio,
      exento: parse.data.exento,
    }, user.company_id).then(productId => {
      if (productId) {
        productsRepository.update(p.id, localCompanyId, { odoo_product_id: productId } as any).catch(err => {
          logger.warn({ err, productLocalId: p.id, productId }, 'Failed to persist odoo_product_id')
        })
      }
    }).catch(err => {
      logger.warn({ err, nombre: parse.data.nombre }, 'Odoo product sync failed')
    })

    return reply.status(201).send(p)
  })

  fastify.put('/:id', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }
    const parse = productSchema.partial().safeParse(req.body)
    if (!parse.success) return reply.status(400).send({ error: 'validation_error' })
    const p = await productsRepository.update(Number(id), localCompanyId, parse.data as any)
    if (!p) return reply.status(404).send({ error: 'not_found' })

    // Sync update to Odoo (non-blocking) — if we have odoo_product_id
    if (p.odoo_product_id) {
      const odooValues: Record<string, unknown> = {}
      if (parse.data.nombre) odooValues['name'] = parse.data.nombre
      if (parse.data.codigo !== undefined) odooValues['default_code'] = parse.data.codigo
      if (parse.data.precio !== undefined) odooValues['list_price'] = parse.data.precio

      if (Object.keys(odooValues).length > 0) {
        odooAccountingAdapter.write('product.product', [p.odoo_product_id], odooValues).catch(err => {
          logger.warn({ err, odooProductId: p.odoo_product_id }, 'Odoo product update sync failed')
        })
      }
    }

    return reply.send(p)
  })

  fastify.delete('/:id', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    // Get product first for odoo_product_id
    const product = await productsRepository.findById(Number(id), localCompanyId)

    await productsRepository.softDelete(Number(id), localCompanyId)

    // Deactivate in Odoo (non-blocking)
    if (product?.odoo_product_id) {
      odooAccountingAdapter.write('product.product', [product.odoo_product_id], { active: false }).catch(err => {
        logger.warn({ err, odooProductId: product.odoo_product_id }, 'Odoo product deactivation failed')
      })
    }

    return reply.status(204).send()
  })
}
