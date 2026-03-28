import type { FastifyInstance } from 'fastify'
import { sql, eq } from 'drizzle-orm'
import { z } from 'zod'
import { authGuard } from '@/middlewares/auth-guard'
import { authService } from '@/services/auth.service'
import { odooAccountingAdapter } from '@/adapters/odoo-accounting.adapter'
import { siiRutAdapter } from '@/adapters/sii-rut.adapter'
import { db } from '@/db/client'
import { companies } from '@/db/schema'
import { logger } from '@/core/logger'

// ── RUT Validation ───────────────────────────────────────────
function validateRut(rut: string): boolean {
  const cleaned = rut.replace(/\./g, '').replace(/-/g, '').toUpperCase()
  if (cleaned.length < 8 || cleaned.length > 9) return false

  const body = cleaned.slice(0, -1)
  const dv = cleaned.slice(-1)

  let sum = 0
  let multiplier = 2
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * multiplier
    multiplier = multiplier === 7 ? 2 : multiplier + 1
  }

  const remainder = 11 - (sum % 11)
  const expectedDv = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder)

  return dv === expectedDv
}

function formatRut(rut: string): string {
  const cleaned = rut.replace(/\./g, '').replace(/-/g, '').toUpperCase()
  const body = cleaned.slice(0, -1)
  const dv = cleaned.slice(-1)
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${formatted}-${dv}`
}

// ── Schema ───────────────────────────────────────────────────
const createCompanySchema = z.object({
  rut: z.string().min(8, 'RUT requerido').refine(validateRut, { message: 'RUT inválido — dígito verificador no coincide' }),
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

    // Get ALL companies from DB (user can access any they created)
    const allCompanies = await db.select().from(companies)
      .where(eq(companies.activo, true))

    return reply.send({
      companies: allCompanies.map(c => ({
        id: c.id,
        odoo_id: c.odoo_company_id,
        name: c.razon_social,
        rut: c.rut,
      })),
      active: user.company_id,
    })
  })

  // POST /switch — switch active company
  fastify.post('/switch', async (req, reply) => {
    const user = (req as any).user
    const { company_id } = req.body as { company_id: number }

    if (!company_id) return reply.status(400).send({ error: 'company_id required' })

    // Look up the company in local DB
    const [company] = await db.select().from(companies)
      .where(eq(companies.id, company_id)).limit(1)

    if (!company) return reply.status(404).send({ error: 'not_found', message: 'Empresa no encontrada' })

    // Generate new tokens with this company
    const odooCompanyId = company.odoo_company_id ?? company.id
    const tokens = await authService.switchCompany(
      { sub: user.uid, email: user.email, name: user.name, company_ids: user.company_ids ?? [] },
      odooCompanyId,
    )

    if (!tokens) {
      // If switchCompany fails (company not in Odoo company_ids), generate tokens directly
      const directTokens = await authService.generateTokensForCompany({
        uid: user.uid,
        name: user.name,
        email: user.email,
        company_id: company.id,
        company_name: company.razon_social,
        company_rut: company.rut,
      })

      reply.setCookie('cuentax_refresh', directTokens.refresh_token ?? '', {
        httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60,
      })

      return reply.send(directTokens)
    }

    reply.setCookie('cuentax_refresh', tokens.refresh_token ?? '', {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60,
    })

    return reply.send(tokens)
  })

  // POST / — create a new company (in Cuentax DB + Odoo)
  fastify.post('/', async (req, reply) => {
    const user = (req as any).user
    const parse = createCompanySchema.safeParse(req.body)
    if (!parse.success) return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten() })

    const formattedRut = formatRut(parse.data.rut)

    // Check RUT uniqueness in local DB
    const [existing] = await db.select().from(companies)
      .where(eq(companies.rut, formattedRut)).limit(1)
    if (existing) {
      return reply.status(409).send({ error: 'duplicate', message: 'Ya existe una empresa con ese RUT' })
    }

    // 1. Create in Odoo as res.company
    let odooCompanyId: number | null = null
    try {
      odooCompanyId = await odooAccountingAdapter.create('res.company', {
        name: parse.data.razon_social,
        vat: formattedRut,
        street: parse.data.direccion ?? '',
        city: parse.data.ciudad ?? 'Santiago',
        phone: parse.data.telefono ?? '',
        email: parse.data.email ?? '',
        country_id: 46, // Chile
      })
      logger.info({ odooCompanyId, rut: formattedRut }, 'Company created in Odoo')

      // 2. Assign company to the current user in Odoo
      if (odooCompanyId) {
        const currentCompanyIds = user.company_ids ?? [user.company_id]
        const newCompanyIds = [...new Set([...currentCompanyIds, odooCompanyId])]
        await odooAccountingAdapter.write('res.users', [Number(user.uid)], {
          company_ids: [[6, 0, newCompanyIds]],
        })
        logger.info({ uid: user.uid, companyIds: newCompanyIds }, 'User company_ids updated in Odoo')
      }
    } catch (err) {
      logger.warn({ err, rut: formattedRut }, 'Failed to create company in Odoo — creating locally only')
    }

    // 3. Create in local DB
    const [created] = await db.insert(companies).values({
      odoo_company_id: odooCompanyId,
      rut: formattedRut,
      razon_social: parse.data.razon_social,
      giro: parse.data.giro,
      actividad_economica: parse.data.actividad_economica,
      direccion: parse.data.direccion,
      comuna: parse.data.comuna,
      ciudad: parse.data.ciudad,
      email: parse.data.email || undefined,
      telefono: parse.data.telefono,
    }).returning()

    logger.info({ id: created.id, odooCompanyId, rut: created.rut }, 'Company created')

    // 4. Return new tokens so the user can switch to this company immediately
    return reply.status(201).send({
      ...created,
      odoo_company_id: odooCompanyId,
    })
  })

  // GET /lookup-rut/:rut — lookup RUT in SII
  fastify.get('/lookup-rut/:rut', async (req, reply) => {
    const { rut } = req.params as { rut: string }

    if (!validateRut(rut)) {
      return reply.status(400).send({ error: 'invalid_rut', message: 'RUT inválido' })
    }

    const data = await siiRutAdapter.lookup(rut)
    return reply.send(data)
  })

  // GET /validate-rut/:rut — validate a RUT
  fastify.get('/validate-rut/:rut', async (req, reply) => {
    const { rut } = req.params as { rut: string }
    const valid = validateRut(rut)
    const formatted = valid ? formatRut(rut) : null
    return reply.send({ rut, valid, formatted })
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
