import type { FastifyInstance } from 'fastify'
import { sql, eq } from 'drizzle-orm'
import { z } from 'zod'
import { authGuard } from '@/middlewares/auth-guard'
import { authService } from '@/services/auth.service'
import { db } from '@/db/client'
import { companies } from '@/db/schema'
import { logger } from '@/core/logger'

const createCompanySchema = z.object({
  rut: z.string().min(9, 'RUT requerido'),
  razon_social: z.string().min(2, 'Razón social requerida'),
  giro: z.string().min(2, 'Giro requerido'),
  actividad_economica: z.number().int().optional().default(620200),
  direccion: z.string().optional(),
  comuna: z.string().optional(),
  ciudad: z.string().optional().default('Santiago'),
  email: z.string().email().optional().or(z.literal('')),
  telefono: z.string().optional(),
})

export async function companyRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  // GET /me — active company details
  fastify.get('/me', async (req, reply) => {
    const user = (req as any).user
    const [company] = await db.select().from(companies)
      .where(eq(companies.odoo_company_id, user.company_id)).limit(1)
    if (!company) {
      return reply.send({
        id: user.company_id,
        name: user.company_name,
        rut: user.company_rut,
        source: 'jwt',
      })
    }
    return reply.send({ ...company, source: 'db' })
  })

  // GET / — list user's accessible companies
  fastify.get('/', async (req, reply) => {
    const user = (req as any).user
    const companyIds: number[] = user.company_ids ?? [user.company_id]

    const existing = await db.select().from(companies)
      .where(sql`${companies.odoo_company_id} = ANY(${companyIds})`)

    const result = companyIds.map((id: number) => {
      const fromDb = existing.find(c => c.odoo_company_id === id)
      if (fromDb) return { id: fromDb.id, odoo_id: id, name: fromDb.razon_social, rut: fromDb.rut, source: 'db' }
      return { id: null, odoo_id: id, name: `Empresa ${id}`, rut: '', source: 'pending' }
    })

    return reply.send({ companies: result, active: user.company_id })
  })

  // POST /switch — switch active company
  fastify.post('/switch', async (req, reply) => {
    const user = (req as any).user
    const { company_id } = req.body as { company_id: number }

    if (!company_id) return reply.status(400).send({ error: 'company_id required' })

    const tokens = await authService.switchCompany(
      { sub: user.uid, email: user.email, name: user.name, company_ids: user.company_ids ?? [] },
      company_id,
    )

    if (!tokens) return reply.status(403).send({ error: 'forbidden', message: 'No tienes acceso a esta empresa' })

    // Set refresh cookie
    reply.setCookie('cuentax_refresh', tokens.refresh_token ?? '', {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60,
    })

    return reply.send(tokens)
  })

  // POST / — create a new company
  fastify.post('/', async (req, reply) => {
    const parse = createCompanySchema.safeParse(req.body)
    if (!parse.success) return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten() })

    // Check RUT uniqueness
    const [existing] = await db.select().from(companies)
      .where(eq(companies.rut, parse.data.rut)).limit(1)
    if (existing) {
      return reply.status(409).send({ error: 'duplicate', message: 'Ya existe una empresa con ese RUT' })
    }

    const [created] = await db.insert(companies).values({
      rut: parse.data.rut,
      razon_social: parse.data.razon_social,
      giro: parse.data.giro,
      actividad_economica: parse.data.actividad_economica,
      direccion: parse.data.direccion,
      comuna: parse.data.comuna,
      ciudad: parse.data.ciudad,
      email: parse.data.email || undefined,
      telefono: parse.data.telefono,
    }).returning()

    logger.info({ id: created.id, rut: created.rut }, 'Company created')
    return reply.status(201).send(created)
  })

  // PUT /me — update active company
  fastify.put('/me', async (req, reply) => {
    const user = (req as any).user
    const parse = createCompanySchema.partial().safeParse(req.body)
    if (!parse.success) return reply.status(400).send({ error: 'validation_error' })

    const [updated] = await db.update(companies)
      .set({ ...parse.data, updated_at: new Date() })
      .where(eq(companies.id, user.company_id))
      .returning()

    if (!updated) return reply.status(404).send({ error: 'not_found' })
    return reply.send(updated)
  })
}
