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
import { odooAccountingAdapter } from '@/adapters/odoo-accounting.adapter'
import { logger } from '@/core/logger'
import { getLocalCompanyId } from '@/core/company-resolver'

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
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const q = req.query as any
    const result = await contactsRepository.findMany(localCompanyId, {
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
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }
    const contact = await contactsRepository.findById(Number(id), localCompanyId)
    if (!contact) return reply.status(404).send({ error: 'not_found' })
    return reply.send(contact)
  })

  fastify.post('/', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const parse = contactSchema.safeParse(req.body)
    if (!parse.success) return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten() })
    const contact = await contactsRepository.create({ ...parse.data, company_id: localCompanyId })

    // Sync to Odoo (non-blocking) — persist odoo_partner_id on success
    odooSyncService.syncContactToOdoo(parse.data, user.company_id).then(partnerId => {
      if (partnerId) {
        contactsRepository.update(contact.id, localCompanyId, { odoo_partner_id: partnerId } as any).catch(err => {
          logger.warn({ err, contactId: contact.id, partnerId }, 'Failed to persist odoo_partner_id')
        })
      }
    }).catch(err => {
      logger.warn({ err, rut: parse.data.rut }, 'Odoo contact sync failed')
    })

    return reply.status(201).send(contact)
  })

  fastify.put('/:id', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }
    const parse = contactSchema.partial().safeParse(req.body)
    if (!parse.success) return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten() })
    const contact = await contactsRepository.update(Number(id), localCompanyId, parse.data)
    if (!contact) return reply.status(404).send({ error: 'not_found' })

    // Sync update to Odoo (non-blocking) — if we have the odoo_partner_id
    if (contact.odoo_partner_id) {
      const odooValues: Record<string, unknown> = {}
      if (parse.data.razon_social) odooValues['name'] = parse.data.razon_social
      if (parse.data.email) odooValues['email'] = parse.data.email
      if (parse.data.telefono) odooValues['phone'] = parse.data.telefono
      if (parse.data.direccion) odooValues['street'] = parse.data.direccion
      if (parse.data.es_cliente !== undefined) odooValues['customer_rank'] = parse.data.es_cliente ? 1 : 0
      if (parse.data.es_proveedor !== undefined) odooValues['supplier_rank'] = parse.data.es_proveedor ? 1 : 0

      if (Object.keys(odooValues).length > 0) {
        odooAccountingAdapter.write('res.partner', [contact.odoo_partner_id], odooValues).catch(err => {
          logger.warn({ err, partnerId: contact.odoo_partner_id }, 'Odoo contact update sync failed')
        })
      }
    }

    return reply.send(contact)
  })

  fastify.delete('/:id', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    // Get contact first to check for odoo_partner_id
    const contact = await contactsRepository.findById(Number(id), localCompanyId)

    await contactsRepository.softDelete(Number(id), localCompanyId)

    // Deactivate in Odoo (non-blocking)
    if (contact?.odoo_partner_id) {
      odooAccountingAdapter.write('res.partner', [contact.odoo_partner_id], { active: false }).catch(err => {
        logger.warn({ err, partnerId: contact.odoo_partner_id }, 'Odoo contact deactivation failed')
      })
    }

    return reply.status(204).send()
  })
}
