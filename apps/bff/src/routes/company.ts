import type { FastifyInstance } from 'fastify'
import { sql, eq } from 'drizzle-orm'
import { authGuard } from '@/middlewares/auth-guard'
import { authService } from '@/services/auth.service'
import { db } from '@/db/client'
import { companies } from '@/db/schema'
import { logger } from '@/core/logger'

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
}
