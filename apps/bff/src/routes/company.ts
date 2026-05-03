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
import { getLocalCompanyId } from '@/core/company-resolver'
import { checkEmissionReadiness } from '@/core/company-readiness'
import { redis } from '@/adapters/redis.adapter'

const PREF_PREFIX = 'cuentax:pref:'

// Bootstrap a missing local companies row from JWT data so the user can edit it.
// Used when a user is logged into a company that exists in Odoo but was never inserted locally.
async function ensureLocalCompanyFromJwt(user: any) {
  const insertVals: Record<string, unknown> = {
    odoo_company_id: user.company_id,
    razon_social: user.company_name || 'Sin nombre',
    rut: user.company_rut && user.company_rut !== 'false' ? user.company_rut : null,
    country_code: user.country_code ?? 'CL',
    locale: user.locale ?? 'es-CL',
    currency: user.currency ?? 'CLP',
  }
  if (insertVals.rut) {
    insertVals.tax_id = insertVals.rut
    insertVals.tax_id_type = 'rut'
  }
  const [created] = await db.insert(companies)
    .values(insertVals as typeof companies.$inferInsert)
    .onConflictDoNothing()
    .returning()
  if (created) return created
  // Conflict (e.g. RUT or odoo_company_id already exists) — re-select
  const [existing] = await db.select().from(companies)
    .where(eq(companies.odoo_company_id, user.company_id)).limit(1)
  return existing
}

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

// ── EIN Validation (US) ─────────────────────────────────────
function validateEIN(ein: string): boolean {
  const cleaned = ein.replace(/[^0-9]/g, '')
  return cleaned.length === 9
}

function formatEIN(ein: string): string {
  const cleaned = ein.replace(/[^0-9]/g, '')
  return `${cleaned.slice(0, 2)}-${cleaned.slice(2)}`
}

// ── Schemas ──────────────────────────────────────────────────
const tipoContribuyenteValues = ['iva_afecto_1a', 'iva_afecto_2a', 'exento', 'pequeno_contribuyente'] as const

// Chilean company creation
const createChileanCompanySchema = z.object({
  country_code: z.literal('CL').default('CL'),
  rut: z.string().min(8, 'RUT requerido').refine(validateRut, { message: 'RUT inválido — dígito verificador no coincide' }),
  razon_social: z.string().min(2, 'Razón social requerida'),
  giro: z.string().min(2, 'Giro requerido'),
  actividad_economica: z.number().int().optional().default(620200),
  actividades_economicas: z.array(z.number().int()).optional(),
  tipo_contribuyente: z.enum(tipoContribuyenteValues).optional(),
  direccion: z.string().optional(),
  comuna: z.string().optional(),
  ciudad: z.string().optional().default('Santiago'),
  region: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  telefono: z.string().optional(),
  movil: z.string().optional(),
  sitio_web: z.string().optional().or(z.literal('')),
  // DTE / Resolución SII
  correo_dte: z.string().email().optional().or(z.literal('')),
  oficina_regional_sii: z.string().optional(),
  numero_resolucion_sii: z.number().int().optional(),
  fecha_resolucion_sii: z.string().optional(), // ISO date string
  ambiente_sii: z.enum(['certificacion', 'produccion']).optional(),
})

// US company creation
const createUSCompanySchema = z.object({
  country_code: z.literal('US'),
  ein: z.string().optional().refine(val => !val || validateEIN(val), { message: 'Invalid EIN format (XX-XXXXXXX)' }),
  razon_social: z.string().min(2, 'Company name required'),
  direccion: z.string().optional(),
  ciudad: z.string().optional(),
  state: z.string().max(2).optional(),
  zip_code: z.string().max(10).optional(),
  email: z.string().email().optional().or(z.literal('')),
  telefono: z.string().optional(),
})

// Union schema — detects country_code to validate accordingly
const createCompanySchema = z.discriminatedUnion('country_code', [
  createChileanCompanySchema,
  createUSCompanySchema,
]).or(
  // Backward compatibility: if no country_code provided, assume Chile
  createChileanCompanySchema.extend({ country_code: z.literal('CL').default('CL') })
)

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
        country_code: user.country_code ?? 'CL',
        locale: user.locale ?? 'es-CL',
        currency: user.currency ?? 'CLP',
        source: 'jwt',
      })
    }
    return reply.send({
      ...company,
      country_code: company.country_code ?? 'CL',
      locale: company.locale ?? 'es-CL',
      currency: company.currency ?? 'CLP',
      source: 'db',
    })
  })

  // GET /me/readiness — check si la empresa está completa para emitir DTE
  fastify.get('/me/readiness', async (req, reply) => {
    const user = (req as any).user
    // Try by odoo_company_id first (same as GET /me), then by local id, then upsert from JWT
    let [company] = await db.select().from(companies)
      .where(eq(companies.odoo_company_id, user.company_id)).limit(1)
    if (!company) {
      const localId = await getLocalCompanyId(user.company_id)
      ;[company] = await db.select().from(companies).where(eq(companies.id, localId)).limit(1)
    }
    if (!company) {
      // Bootstrap: create the row from JWT data so the user can edit it
      const created = await ensureLocalCompanyFromJwt(user)
      company = created
    }
    return reply.send(checkEmissionReadiness(company ?? null))
  })

  // GET / — list user's accessible companies
  fastify.get('/', async (req, reply) => {
    const user = (req as any).user

    // Get ALL companies from DB (user can access any they created)
    const allCompanies = await db.select().from(companies)
      .where(eq(companies.activo, true))

    return reply.send({
      companies: allCompanies.map(c => ({
        id: c.odoo_company_id || c.id,
        local_id: c.id,
        odoo_id: c.odoo_company_id,
        name: c.razon_social,
        rut: c.rut ?? '',
        country_code: c.country_code ?? 'CL',
        locale: c.locale ?? 'es-CL',
        currency: c.currency ?? 'CLP',
      })),
      active: user.company_id,
    })
  })

  // ── POST /favorite — set preferred company for login ────────
  fastify.post('/favorite', async (req, reply) => {
    const user = (req as any).user
    const body = req.body as Record<string, unknown> | undefined
    const companyId = Number(body?.company_id)
    if (!companyId || isNaN(companyId)) {
      return reply.status(400).send({ error: 'company_id required' })
    }

    // Verify company exists
    let [company] = await db.select().from(companies)
      .where(eq(companies.odoo_company_id, companyId)).limit(1)
    if (!company) {
      [company] = await db.select().from(companies)
        .where(eq(companies.id, companyId)).limit(1)
    }
    if (!company) {
      return reply.status(404).send({ error: 'not_found', message: 'Empresa no encontrada' })
    }

    const odooId = company.odoo_company_id || company.id
    await redis.set(`${PREF_PREFIX}${user.uid}:company`, String(odooId))
    logger.info({ uid: user.uid, companyId: odooId, name: company.razon_social }, 'Favorite company set')
    return reply.send({ success: true, favorite_company_id: odooId, company_name: company.razon_social })
  })

  // ── DELETE /favorite — remove preferred company ─────────────
  fastify.delete('/favorite', async (req, reply) => {
    const user = (req as any).user
    await redis.del(`${PREF_PREFIX}${user.uid}:company`)
    logger.info({ uid: user.uid }, 'Favorite company removed')
    return reply.send({ success: true, favorite_company_id: null })
  })

  // ── GET /favorite — get preferred company ───────────────────
  fastify.get('/favorite', async (req, reply) => {
    const user = (req as any).user
    const val = await redis.get(`${PREF_PREFIX}${user.uid}:company`)
    return reply.send({ favorite_company_id: val ? Number(val) : null })
  })

  // POST /switch — switch active company
  fastify.post('/switch', async (req, reply) => {
    const user = (req as any).user
    const body = req.body as Record<string, unknown> | undefined

    logger.info({ body, userId: user?.uid }, 'Switch company request received')

    // Robust extraction: body could be undefined if content-type isn't parsed
    const rawCompanyId = body?.company_id
    const companyId = typeof rawCompanyId === 'number' ? rawCompanyId
      : typeof rawCompanyId === 'string' ? parseInt(rawCompanyId, 10)
      : NaN

    if (!companyId || isNaN(companyId)) {
      logger.warn({ body, rawCompanyId }, 'Switch: company_id missing or invalid')
      return reply.status(400).send({ error: 'company_id required', received: rawCompanyId })
    }

    // Look up the company in local DB — try by odoo_company_id first (frontend sends Odoo ID), then by local id
    let [company] = await db.select().from(companies)
      .where(eq(companies.odoo_company_id, companyId)).limit(1)
    if (!company) {
      [company] = await db.select().from(companies)
        .where(eq(companies.id, companyId)).limit(1)
    }

    if (!company) {
      logger.warn({ companyId }, 'Switch: company not found in DB')
      return reply.status(404).send({ error: 'not_found', message: 'Empresa no encontrada' })
    }

    logger.info({ companyId, companyName: company.razon_social, odooId: company.odoo_company_id }, 'Switch: company found')

    // Generate new tokens with this company
    const odooCompanyId = company.odoo_company_id || company.id
    // Local DB rut is the source of truth (Odoo may have 'false' or empty)
    const companyRut = (company.rut && company.rut !== 'false' && company.rut !== 'False') ? company.rut : ''

    // Fetch all companies so the new token includes the full list for subsequent switches
    const allCompanies = await db.select().from(companies).where(eq(companies.activo, true))
    const companyIds = allCompanies.map(c => c.odoo_company_id ?? c.id)
    const companiesList = allCompanies.map(c => ({
      id: c.odoo_company_id ?? c.id,
      name: c.razon_social,
      rut: (c.rut && c.rut !== 'false' && c.rut !== 'False') ? c.rut : '',
    }))

    // Always use direct path with local DB data — most reliable
    const resultTokens = await authService.generateTokensForCompany({
      uid: user.uid,
      name: user.name,
      email: user.email,
      company_id: odooCompanyId,
      company_name: company.razon_social,
      company_rut: companyRut,
      country_code: company.country_code ?? 'CL',
      locale: company.locale ?? 'es-CL',
      currency: company.currency ?? 'CLP',
    })

    // Patch the user response to include all companies + guaranteed rut
    if (resultTokens.user) {
      resultTokens.user.company_ids = companyIds
      resultTokens.user.companies = companiesList
      resultTokens.user.company_rut = companyRut
    }

    reply.setCookie('cuentax_refresh', resultTokens.refresh_token ?? '', {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60,
    })

    logger.info({ companyId: odooCompanyId, companyRut, userId: user.uid }, 'Switch: tokens generated')
    return reply.send(resultTokens)
  })

  // POST / — create a new company (in Cuentax DB + Odoo)
  fastify.post('/', async (req, reply) => {
    const user = (req as any).user

    // Determine country from body (default CL for backward compat)
    const body = req.body as Record<string, unknown> | undefined
    const countryCode = (body?.country_code as string) || 'CL'

    // Parse with appropriate schema based on country
    const parse = createCompanySchema.safeParse({ ...body, country_code: countryCode })
    if (!parse.success) return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten() })

    const isUS = countryCode === 'US'
    const data = parse.data

    // For Chile: validate and format RUT
    let formattedRut: string | null = null
    if (!isUS && 'rut' in data) {
      formattedRut = formatRut(data.rut)
      const [existing] = await db.select().from(companies)
        .where(eq(companies.rut, formattedRut)).limit(1)
      if (existing) {
        return reply.status(409).send({ error: 'duplicate', message: 'Ya existe una empresa con ese RUT' })
      }
    }

    // For US: validate EIN uniqueness if provided
    let formattedEIN: string | null = null
    if (isUS && 'ein' in data && data.ein) {
      formattedEIN = formatEIN(data.ein)
      const [existing] = await db.select().from(companies)
        .where(eq(companies.tax_id, formattedEIN)).limit(1)
      if (existing) {
        return reply.status(409).send({ error: 'duplicate', message: 'A company with that EIN already exists' })
      }
    }

    // 1. Create in Odoo as res.company
    let odooCompanyId: number | null = null
    try {
      const odooVals: Record<string, unknown> = {
        name: data.razon_social,
        street: data.direccion ?? '',
        city: data.ciudad ?? (isUS ? '' : 'Santiago'),
        phone: data.telefono ?? '',
        email: data.email ?? '',
        country_id: isUS ? 233 : 46, // 233 = USA, 46 = Chile
      }

      if (!isUS && formattedRut) {
        odooVals.vat = formattedRut
      } else if (isUS && formattedEIN) {
        odooVals.vat = formattedEIN
      }

      if (isUS && 'state' in data && data.state) {
        // Odoo state_id would need mapping, skip for now — just store in street2
        odooVals.street2 = `${data.state} ${('zip_code' in data ? data.zip_code : '') ?? ''}`
      }

      odooCompanyId = await odooAccountingAdapter.create('res.company', odooVals)
      logger.info({ odooCompanyId, country: countryCode }, 'Company created in Odoo')

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
      logger.warn({ err, country: countryCode }, 'Failed to create company in Odoo — creating locally only')
    }

    // 3. Create in local DB
    const dbValues: Record<string, unknown> = {
      odoo_company_id: odooCompanyId,
      country_code: countryCode,
      locale: isUS ? 'en-US' : 'es-CL',
      currency: isUS ? 'USD' : 'CLP',
      timezone: isUS ? 'America/New_York' : 'America/Santiago',
      razon_social: data.razon_social,
      direccion: data.direccion,
      ciudad: data.ciudad,
      email: data.email || undefined,
      telefono: data.telefono,
    }

    if (!isUS && formattedRut) {
      dbValues.rut = formattedRut
      dbValues.tax_id = formattedRut
      dbValues.tax_id_type = 'rut'
      dbValues.giro = 'giro' in data ? data.giro : undefined
      dbValues.actividad_economica = 'actividad_economica' in data ? data.actividad_economica : undefined
      dbValues.comuna = 'comuna' in data ? data.comuna : undefined
    } else if (isUS) {
      dbValues.tax_id = formattedEIN
      dbValues.tax_id_type = formattedEIN ? 'ein' : undefined
      dbValues.state = 'state' in data ? data.state : undefined
      dbValues.zip_code = 'zip_code' in data ? data.zip_code : undefined
    }

    const [created] = await db.insert(companies).values(dbValues as typeof companies.$inferInsert).returning()

    logger.info({ id: created.id, odooCompanyId, country: countryCode }, 'Company created')

    // 4. Return new company data
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

  // PUT /me — update active company (upserts row if missing)
  fastify.put('/me', async (req, reply) => {
    const user = (req as any).user
    // Use a simple partial schema for updates (shared fields only)
    const updateSchema = z.object({
      razon_social: z.string().min(2).optional(),
      giro: z.string().optional(),
      actividad_economica: z.number().int().optional(),
      actividades_economicas: z.array(z.number().int()).optional(),
      tipo_contribuyente: z.enum(tipoContribuyenteValues).optional(),
      direccion: z.string().optional(),
      comuna: z.string().optional(),
      ciudad: z.string().optional(),
      region: z.string().optional(),
      state: z.string().max(2).optional(),
      zip_code: z.string().max(10).optional(),
      email: z.string().email().optional().or(z.literal('')),
      telefono: z.string().optional(),
      movil: z.string().optional(),
      sitio_web: z.string().optional().or(z.literal('')),
      correo_dte: z.string().email().optional().or(z.literal('')),
      oficina_regional_sii: z.string().optional(),
      numero_resolucion_sii: z.number().int().optional(),
      fecha_resolucion_sii: z.string().optional(),
      ambiente_sii: z.enum(['certificacion', 'produccion']).optional(),
    })
    const parse = updateSchema.safeParse(req.body)
    if (!parse.success) return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten() })

    // Coerce date string to Date for fecha_resolucion_sii
    const dataToWrite: Record<string, unknown> = { ...parse.data, updated_at: new Date() }
    if (parse.data.fecha_resolucion_sii) {
      dataToWrite.fecha_resolucion_sii = new Date(parse.data.fecha_resolucion_sii)
    }

    // Resolve target row: by odoo_company_id, then by local id; create if missing
    let [target] = await db.select().from(companies)
      .where(eq(companies.odoo_company_id, user.company_id)).limit(1)
    if (!target) {
      const localId = await getLocalCompanyId(user.company_id)
      ;[target] = await db.select().from(companies).where(eq(companies.id, localId)).limit(1)
    }
    if (!target) {
      target = await ensureLocalCompanyFromJwt(user)
    }

    const [updated] = await db.update(companies)
      .set(dataToWrite as typeof companies.$inferInsert)
      .where(eq(companies.id, target.id))
      .returning()

    if (!updated) return reply.status(404).send({ error: 'not_found' })

    // Sync update to Odoo (non-blocking) — if linked to Odoo
    if (updated.odoo_company_id) {
      const odooValues: Record<string, unknown> = {}
      if (parse.data.razon_social) odooValues['name'] = parse.data.razon_social
      if (parse.data.direccion) odooValues['street'] = parse.data.direccion
      if (parse.data.ciudad) odooValues['city'] = parse.data.ciudad
      if (parse.data.telefono) odooValues['phone'] = parse.data.telefono
      if (parse.data.email) odooValues['email'] = parse.data.email

      if (Object.keys(odooValues).length > 0) {
        odooAccountingAdapter.write('res.company', [updated.odoo_company_id], odooValues).catch(err => {
          logger.warn({ err, odooCompanyId: updated.odoo_company_id }, 'Odoo company update sync failed')
        })
        logger.info({ odooCompanyId: updated.odoo_company_id, fields: Object.keys(odooValues) }, 'Company update synced to Odoo')
      }
    }

    return reply.send(updated)
  })

  // PATCH /:id/link-odoo — link local company to existing Odoo company
  fastify.patch('/:id/link-odoo', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { odoo_company_id } = req.body as { odoo_company_id: number }

    if (!odoo_company_id) return reply.status(400).send({ error: 'odoo_company_id required' })

    const [updated] = await db.update(companies)
      .set({ odoo_company_id, updated_at: new Date() })
      .where(eq(companies.id, Number(id)))
      .returning()

    if (!updated) return reply.status(404).send({ error: 'not_found' })

    logger.info({ id, odoo_company_id }, 'Company linked to Odoo')
    return reply.send(updated)
  })
}
