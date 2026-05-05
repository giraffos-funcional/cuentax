/**
 * Admin Routes — /api/admin/*
 *
 * Cross-tenant operator endpoints. ALL routes (except /admin/auth/login)
 * require a super-admin JWT (scope=admin) via the requireSuperAdmin guard.
 *
 * Refs: docs/multitenancy/phase-01-admin.md T1.4
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { createSigner } from 'fast-jwt'
import { sql, desc, eq, ilike, or } from 'drizzle-orm'
import { config } from '@/core/config'
import { db } from '@/db/client'
import { tenants, plans, companies, dteDocuments, auditLog, invoices, revenueShareRuns } from '@/db/schema'
import { logger } from '@/core/logger'
import {
  findByEmail,
  findById,
  recordLogin,
  verifyPassword,
  createSuperAdmin,
  setTotpSecret,
  enableTotp,
  disableTotp,
} from '@/services/super-admin.service'
import {
  generateSecret as generateTotpSecret,
  encryptSecret as encryptTotpSecret,
  decryptSecret as decryptTotpSecret,
  otpauthUrl,
  verifyTotp,
} from '@/services/totp.service'
import {
  provisionTenant,
  setStatus,
  updateRevenueShareRates,
  ProvisioningError,
} from '@/services/tenant-provisioning.service'
import { impersonateTenant } from '@/services/impersonation.service'
import { requireSuperAdmin, requireRole } from '@/middlewares/require-super-admin'
import { closeRevenueShare, lockRun } from '@/services/revenue-share/closer'
import { injectIntoInvoice } from '@/services/revenue-share/injector'
import { generateMonthlyInvoice } from '@/services/billing/invoice-generator'
import { auditFromRequest } from '@/services/audit.service'
import { issueMagicLink, consumeMagicLink } from '@/services/magic-link.service'
import { setPassword } from '@/services/super-admin.service'
import { createEmailProvider } from '@cuentax/email'
import { getCronHealth } from '@/services/cron-health.service'

const ADMIN_ACCESS_TTL_SECONDS = 60 * 60 // 1h
const signAdminAccess = createSigner({
  key: config.JWT_SECRET,
  expiresIn: ADMIN_ACCESS_TTL_SECONDS * 1000,
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp_code: z.string().regex(/^\d{6}$/).optional(),
})

const createTenantSchema = z.object({
  slug: z.string().min(1).max(63),
  name: z.string().min(1),
  primary_rut: z.string().optional(),
  billing_email: z.string().email().optional(),
  plan_code: z.string().optional(),
  status: z.enum(['trialing', 'active']).optional(),
})

const patchTenantSchema = z.object({
  name: z.string().min(1).optional(),
  primary_rut: z.string().optional(),
  billing_email: z.string().email().optional(),
  plan_code: z.string().optional(),
  revenue_share_rate_contabilidad: z.number().min(0).max(1).optional(),
  revenue_share_rate_remuneraciones: z.number().min(0).max(1).optional(),
})

const listQuerySchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export async function adminRoutes(fastify: FastifyInstance) {
  // ════════════════════════════════════════════════════════════
  // PUBLIC: password reset request + completion via magic link
  // ════════════════════════════════════════════════════════════
  fastify.post('/auth/forgot-password', async (request, reply) => {
    const body = z.object({ email: z.string().email() }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'validation_error' })
    // Always return 200 to avoid email enumeration; only actually send if account exists.
    const admin = await findByEmail(body.data.email)
    if (admin && admin.active) {
      const { token } = await issueMagicLink({
        email:   admin.email,
        purpose: 'password_reset',
      })
      const link = `${config.PUBLIC_BASE_URL}/admin-reset?token=${encodeURIComponent(token)}`
      const ep = createEmailProvider({
        EMAIL_PROVIDER: config.EMAIL_PROVIDER,
        POSTMARK_TOKEN: config.POSTMARK_TOKEN,
        RESEND_API_KEY: config.RESEND_API_KEY,
      })
      ep.send({
        to:      admin.email,
        from:    config.EMAIL_FROM,
        subject: 'Cuentax Admin — restablecer contraseña',
        html: `<p>Hola, hicimos un link para restablecer tu contraseña de Cuentax Admin.</p>
               <p><a href="${link}">Restablecer ahora</a></p>
               <p>Expira en 24h. Si no fuiste vos, ignorá este mensaje.</p>`,
      }).catch((err) => logger.error({ err }, 'admin.forgot_email_failed'))
    }
    return reply.send({ ok: true })
  })

  fastify.post('/auth/reset-password', async (request, reply) => {
    const body = z.object({
      token:    z.string().min(1),
      password: z.string().min(12),
    }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'validation_error', details: body.error.flatten().fieldErrors })

    const claim = await consumeMagicLink(body.data.token)
    if (!claim.ok) return reply.code(401).send({ error: claim.reason })
    if (claim.purpose !== 'password_reset') return reply.code(400).send({ error: 'wrong_purpose' })

    const admin = await findByEmail(claim.email)
    if (!admin) return reply.code(404).send({ error: 'admin_not_found' })

    await setPassword(admin.id, body.data.password)
    logger.info({ adminId: admin.id }, 'admin.password_reset')
    return reply.send({ ok: true })
  })

  // ════════════════════════════════════════════════════════════
  // PUBLIC: login
  // ════════════════════════════════════════════════════════════
  fastify.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', details: parsed.error.flatten().fieldErrors })
    }
    const { email, password } = parsed.data

    const admin = await findByEmail(email)
    if (!admin || !admin.active) {
      logger.warn({ email }, 'admin.login_failed')
      return reply.code(401).send({ error: 'invalid_credentials' })
    }
    const ok = await verifyPassword(password, admin.password_hash)
    if (!ok) {
      logger.warn({ email }, 'admin.login_failed')
      return reply.code(401).send({ error: 'invalid_credentials' })
    }

    // Enforce TOTP when enabled.
    if (admin.totp_enabled) {
      if (!parsed.data.totp_code) {
        return reply.code(401).send({ error: 'totp_required' })
      }
      if (!admin.totp_secret_enc) {
        logger.error({ email }, 'admin.totp_enabled_but_no_secret')
        return reply.code(500).send({ error: 'totp_misconfigured' })
      }
      const secret = decryptTotpSecret(admin.totp_secret_enc)
      if (!verifyTotp(secret, parsed.data.totp_code)) {
        logger.warn({ email }, 'admin.totp_failed')
        return reply.code(401).send({ error: 'invalid_totp' })
      }
    }

    const jti = randomUUID()
    const token = signAdminAccess({
      sub: `admin:${admin.id}`,
      scope: 'admin',
      admin_id: admin.id,
      email: admin.email,
      role: admin.role,
      jti,
      type: 'access',
    })
    await recordLogin(admin.id)
    return reply.send({
      access_token: token,
      expires_in: ADMIN_ACCESS_TTL_SECONDS,
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    })
  })

  // ════════════════════════════════════════════════════════════
  // PROTECTED routes
  // ════════════════════════════════════════════════════════════
  fastify.register(async (instance) => {
    instance.addHook('preHandler', requireSuperAdmin)

    // ── /me ────────────────────────────────────────────────
    instance.get('/me', async (request, reply) => {
      const id = request.superAdmin!.admin_id
      const me = await findById(id)
      if (!me) return reply.code(404).send({ error: 'not_found' })
      return reply.send(me)
    })

    // ── Tenants ────────────────────────────────────────────
    instance.get('/tenants', async (request, reply) => {
      const parsed = listQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'validation_error', details: parsed.error.flatten().fieldErrors })
      }
      const { q, status, page, limit } = parsed.data
      const offset = (page - 1) * limit

      const where = []
      if (q) {
        where.push(or(ilike(tenants.name, `%${q}%`), ilike(tenants.slug, `%${q}%`)))
      }
      if (status) {
        where.push(eq(tenants.status, status as 'trialing' | 'active' | 'past_due' | 'suspended' | 'cancelled'))
      }
      const cond = where.length > 0 ? sql.join(where, sql` AND `) : undefined

      const rows = await db
        .select()
        .from(tenants)
        .where(cond as never)
        .orderBy(desc(tenants.created_at))
        .limit(limit)
        .offset(offset)

      const totalRow = await db.execute(sql`SELECT count(*)::int AS c FROM tenants ${cond ?? sql``}`)
      const total = (totalRow as unknown as { rows: Array<{ c: number }> }).rows?.[0]?.c
        ?? (totalRow as unknown as Array<{ c: number }>)[0]?.c
        ?? 0

      return reply.send({ data: rows, total, page, limit })
    })

    instance.get('/tenants/:slug', async (request, reply) => {
      const { slug } = request.params as { slug: string }
      const rows = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1)
      const t = rows[0]
      if (!t) return reply.code(404).send({ error: 'not_found' })

      // Resumen: companies + DTEs del último mes
      const companyRows = await db.select().from(companies).where(eq(companies.tenant_id, t.id))
      const dteCountRow = await db.execute(sql`
        SELECT count(*)::int AS dtes_30d
        FROM dte_documents d
        JOIN companies c ON c.id = d.company_id
        WHERE c.tenant_id = ${t.id}
          AND d.created_at > now() - interval '30 days'
      `)
      const dtes30d = (dteCountRow as any).rows?.[0]?.dtes_30d ?? (dteCountRow as any)[0]?.dtes_30d ?? 0

      // Plan
      let plan: typeof plans.$inferSelect | null = null
      if (t.plan_id) {
        const planRows = await db.select().from(plans).where(eq(plans.id, t.plan_id)).limit(1)
        plan = planRows[0] ?? null
      }

      return reply.send({
        ...t,
        plan,
        usage: {
          companies: companyRows.length,
          dtes_last_30d: dtes30d,
        },
      })
    })

    instance.post('/tenants', { preHandler: requireRole('owner', 'support') }, async (request, reply) => {
      const parsed = createTenantSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'validation_error', details: parsed.error.flatten().fieldErrors })
      }
      try {
        const tenant = await provisionTenant(parsed.data)
        await auditFromRequest(request, {
          action: 'admin.tenant.created',
          tenant_id: tenant.id,
          actor_admin_id: request.superAdmin!.admin_id,
          resource: 'tenant', resource_id: tenant.id,
          payload: { slug: tenant.slug, plan_code: parsed.data.plan_code },
        })
        return reply.code(201).send(tenant)
      } catch (err) {
        if (err instanceof ProvisioningError) {
          return reply.code(409).send({ error: err.code, message: err.message })
        }
        throw err
      }
    })

    instance.patch('/tenants/:slug', { preHandler: requireRole('owner', 'support') }, async (request, reply) => {
      const { slug } = request.params as { slug: string }
      const parsed = patchTenantSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'validation_error', details: parsed.error.flatten().fieldErrors })
      }
      const body = parsed.data

      const updates: Record<string, unknown> = { updated_at: new Date() }
      if (body.name !== undefined) updates.name = body.name
      if (body.primary_rut !== undefined) updates.primary_rut = body.primary_rut
      if (body.billing_email !== undefined) updates.billing_email = body.billing_email
      if (body.plan_code !== undefined) {
        const planRows = await db.select().from(plans).where(eq(plans.code, body.plan_code)).limit(1)
        if (planRows.length === 0) return reply.code(400).send({ error: 'plan_not_found' })
        updates.plan_id = planRows[0]!.id
      }
      if (body.revenue_share_rate_contabilidad !== undefined) {
        updates.revenue_share_rate_contabilidad = body.revenue_share_rate_contabilidad.toFixed(4)
      }
      if (body.revenue_share_rate_remuneraciones !== undefined) {
        updates.revenue_share_rate_remuneraciones = body.revenue_share_rate_remuneraciones.toFixed(4)
      }

      if (Object.keys(updates).length === 1) {
        // sólo updated_at
        return reply.code(400).send({ error: 'no_fields_to_update' })
      }

      const [row] = await db.update(tenants).set(updates).where(eq(tenants.slug, slug)).returning()
      if (!row) return reply.code(404).send({ error: 'not_found' })
      logger.info({ adminId: request.superAdmin!.admin_id, slug, updates: Object.keys(updates) }, 'admin.tenant_patched')
      return reply.send(row)
    })

    instance.post('/tenants/:slug/suspend', { preHandler: requireRole('owner') }, async (request, reply) => {
      const { slug } = request.params as { slug: string }
      const result = await setStatus(slug, 'suspended')
      if (!result) return reply.code(404).send({ error: 'not_found' })
      logger.warn({ adminId: request.superAdmin!.admin_id, slug }, 'admin.tenant_suspended')
      await auditFromRequest(request, {
        action: 'admin.tenant.suspended',
        tenant_id: result.id,
        actor_admin_id: request.superAdmin!.admin_id,
        resource: 'tenant', resource_id: result.id,
      })
      return reply.send(result)
    })

    instance.post('/tenants/:slug/reactivate', { preHandler: requireRole('owner') }, async (request, reply) => {
      const { slug } = request.params as { slug: string }
      const result = await setStatus(slug, 'active')
      if (!result) return reply.code(404).send({ error: 'not_found' })
      logger.info({ adminId: request.superAdmin!.admin_id, slug }, 'admin.tenant_reactivated')
      await auditFromRequest(request, {
        action: 'admin.tenant.reactivated',
        tenant_id: result.id,
        actor_admin_id: request.superAdmin!.admin_id,
        resource: 'tenant', resource_id: result.id,
      })
      return reply.send(result)
    })

    instance.patch('/tenants/:slug/revenue-share', { preHandler: requireRole('owner', 'finance') }, async (request, reply) => {
      const { slug } = request.params as { slug: string }
      const body = z.object({
        contabilidad: z.number().min(0).max(1).optional(),
        remuneraciones: z.number().min(0).max(1).optional(),
      }).safeParse(request.body)
      if (!body.success) return reply.code(400).send({ error: 'validation_error', details: body.error.flatten().fieldErrors })
      try {
        const result = await updateRevenueShareRates(slug, body.data)
        if (!result) return reply.code(404).send({ error: 'not_found' })
        return reply.send(result)
      } catch (err) {
        if (err instanceof ProvisioningError) {
          return reply.code(400).send({ error: err.code, message: err.message })
        }
        throw err
      }
    })

    instance.post('/tenants/:slug/impersonate', { preHandler: requireRole('owner', 'support') }, async (request, reply) => {
      const { slug } = request.params as { slug: string }
      const result = await impersonateTenant(request.superAdmin!.admin_id, slug)
      if (!result) return reply.code(404).send({ error: 'not_found' })
      await auditFromRequest(request, {
        action: 'admin.tenant.impersonate_started',
        tenant_id: result.tenant.id,
        actor_admin_id: request.superAdmin!.admin_id,
        resource: 'tenant', resource_id: result.tenant.id,
        payload: { tenant_slug: slug },
      })
      return reply.send(result)
    })

    // ── Plans ──────────────────────────────────────────────
    instance.get('/plans', async (_request, reply) => {
      const rows = await db.select().from(plans).orderBy(plans.id)
      return reply.send({ data: rows })
    })

    // ── Metrics ────────────────────────────────────────────
    instance.get('/metrics/overview', async (_request, reply) => {
      const result = await db.execute(sql`
        WITH t AS (SELECT * FROM tenants),
             active AS (SELECT count(*)::int AS c FROM t WHERE status = 'active'),
             trialing AS (SELECT count(*)::int AS c FROM t WHERE status = 'trialing'),
             suspended AS (SELECT count(*)::int AS c FROM t WHERE status = 'suspended'),
             total AS (SELECT count(*)::int AS c FROM t),
             companies_total AS (SELECT count(*)::int AS c FROM companies),
             mrr AS (
               SELECT COALESCE(SUM(p.base_price_clp), 0)::int AS clp
               FROM tenants t
               LEFT JOIN plans p ON p.id = t.plan_id
               WHERE t.status IN ('active', 'past_due')
             )
        SELECT
          (SELECT c FROM total) AS tenants_total,
          (SELECT c FROM active) AS tenants_active,
          (SELECT c FROM trialing) AS tenants_trialing,
          (SELECT c FROM suspended) AS tenants_suspended,
          (SELECT c FROM companies_total) AS companies_total,
          (SELECT clp FROM mrr) AS mrr_clp
      `)
      const row = (result as any).rows?.[0] ?? (result as any)[0]
      return reply.send({
        tenants: {
          total: Number(row.tenants_total),
          active: Number(row.tenants_active),
          trialing: Number(row.tenants_trialing),
          suspended: Number(row.tenants_suspended),
        },
        companies_total: Number(row.companies_total),
        mrr_clp: Number(row.mrr_clp),
        arr_clp: Number(row.mrr_clp) * 12,
      })
    })

    // ── Global search ──────────────────────────────────────
    instance.get('/search', async (request, reply) => {
      const q = z.object({ q: z.string().min(2).max(100) }).safeParse(request.query)
      if (!q.success) return reply.code(400).send({ error: 'validation_error' })
      const term = `%${q.data.q.replace(/%/g, '\\%')}%`

      const tenantsRes = await db.execute(sql`
        SELECT id, slug, name, status, primary_rut FROM tenants
        WHERE name ILIKE ${term} OR slug ILIKE ${term} OR primary_rut ILIKE ${term}
        ORDER BY created_at DESC LIMIT 20
      `)
      const companiesRes = await db.execute(sql`
        SELECT id, tenant_id, razon_social, rut FROM companies
        WHERE razon_social ILIKE ${term} OR rut ILIKE ${term}
        LIMIT 20
      `)
      const adminsRes = await db.execute(sql`
        SELECT id, email, role, active FROM super_admins
        WHERE email ILIKE ${term} OR name ILIKE ${term}
        LIMIT 10
      `)
      return reply.send({
        tenants:   ((tenantsRes   as any).rows ?? tenantsRes)   as Array<unknown>,
        companies: ((companiesRes as any).rows ?? companiesRes) as Array<unknown>,
        admins:    ((adminsRes    as any).rows ?? adminsRes)    as Array<unknown>,
      })
    })

    // ── Cron health ────────────────────────────────────────
    instance.get('/crons/health', async (_request, reply) => {
      return reply.send({ data: await getCronHealth() })
    })

    // ── Trend metrics (last 12 months) ─────────────────────
    instance.get('/metrics/trends', async (_request, reply) => {
      // Returns 12 monthly buckets ending at the current Santiago month.
      // For each: tenants_created, signups (alias), invoices_total_clp, invoices_paid_clp, dtes_emitted.
      const result = await db.execute(sql`
        WITH months AS (
          SELECT to_char(date_trunc('month', now() - (n * interval '1 month')) AT TIME ZONE 'America/Santiago', 'YYYY-MM') AS period
          FROM generate_series(0, 11) AS n
        )
        SELECT
          m.period,
          (SELECT count(*)::int FROM tenants
            WHERE to_char(created_at AT TIME ZONE 'America/Santiago', 'YYYY-MM') = m.period
          ) AS tenants_created,
          (SELECT COALESCE(sum(total_clp), 0)::bigint FROM invoices
            WHERE period = m.period
          ) AS invoices_total_clp,
          (SELECT COALESCE(sum(total_clp), 0)::bigint FROM invoices
            WHERE period = m.period AND status = 'paid'
          ) AS invoices_paid_clp,
          (SELECT count(*)::int FROM dte_documents d
            WHERE to_char(d.created_at AT TIME ZONE 'America/Santiago', 'YYYY-MM') = m.period
          ) AS dtes_emitted
        FROM months m
        ORDER BY m.period
      `)
      const rows = ((result as any).rows ?? (result as any)) as Array<{
        period: string
        tenants_created: number | string
        invoices_total_clp: number | string
        invoices_paid_clp: number | string
        dtes_emitted: number | string
      }>
      return reply.send({
        data: rows.map((r) => ({
          period:             r.period,
          tenants_created:    Number(r.tenants_created),
          invoices_total_clp: Number(r.invoices_total_clp),
          invoices_paid_clp:  Number(r.invoices_paid_clp),
          dtes_emitted:       Number(r.dtes_emitted),
        })),
      })
    })

    // ── Audit log ──────────────────────────────────────────
    instance.get('/audit', async (request, reply) => {
      const q = z.object({
        tenant_id: z.coerce.number().int().optional(),
        action: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }).safeParse(request.query)
      if (!q.success) return reply.code(400).send({ error: 'validation_error', details: q.error.flatten().fieldErrors })
      const { tenant_id, action, page, limit } = q.data
      const offset = (page - 1) * limit

      const where = []
      if (tenant_id !== undefined) where.push(eq(auditLog.tenant_id, tenant_id))
      if (action) where.push(ilike(auditLog.action, `%${action}%`))
      const cond = where.length > 0 ? sql.join(where, sql` AND `) : undefined

      const rows = await db
        .select()
        .from(auditLog)
        .where(cond as never)
        .orderBy(desc(auditLog.created_at))
        .limit(limit)
        .offset(offset)

      return reply.send({ data: rows, page, limit })
    })

    // ── First-time bootstrap: only owner can create more admins ──
    instance.post('/admins', { preHandler: requireRole('owner') }, async (request, reply) => {
      const body = z.object({
        email: z.string().email(),
        password: z.string().min(12, 'Mínimo 12 caracteres'),
        name: z.string().optional(),
        role: z.enum(['owner', 'support', 'finance']).default('support'),
      }).safeParse(request.body)
      if (!body.success) return reply.code(400).send({ error: 'validation_error', details: body.error.flatten().fieldErrors })
      try {
        const created = await createSuperAdmin(body.data)
        return reply.code(201).send(created)
      } catch (err) {
        // Likely unique constraint violation
        return reply.code(409).send({ error: 'email_taken' })
      }
    })

    // ── 2FA TOTP enrollment ────────────────────────────────
    instance.post('/auth/totp/enroll', async (request, reply) => {
      const adminId = request.superAdmin!.admin_id
      const me = await findById(adminId)
      if (!me) return reply.code(404).send({ error: 'not_found' })
      if (me.totp_enabled) return reply.code(400).send({ error: 'totp_already_enabled' })

      const secret = generateTotpSecret()
      await setTotpSecret(adminId, encryptTotpSecret(secret))
      const url = otpauthUrl(secret, me.email)
      return reply.send({ secret, otpauth_url: url })
    })

    instance.post('/auth/totp/verify', async (request, reply) => {
      const adminId = request.superAdmin!.admin_id
      const body = z.object({ code: z.string().regex(/^\d{6}$/) }).safeParse(request.body)
      if (!body.success) return reply.code(400).send({ error: 'validation_error' })

      const fresh = await findByEmail(request.superAdmin!.email)
      if (!fresh?.totp_secret_enc) return reply.code(400).send({ error: 'no_pending_secret' })
      const secret = decryptTotpSecret(fresh.totp_secret_enc)
      if (!verifyTotp(secret, body.data.code)) {
        return reply.code(401).send({ error: 'invalid_code' })
      }
      await enableTotp(adminId)
      return reply.send({ ok: true })
    })

    instance.post('/auth/totp/disable', async (request, reply) => {
      const adminId = request.superAdmin!.admin_id
      const body = z.object({ password: z.string().min(1) }).safeParse(request.body)
      if (!body.success) return reply.code(400).send({ error: 'validation_error' })
      const fresh = await findByEmail(request.superAdmin!.email)
      if (!fresh) return reply.code(404).send({ error: 'not_found' })
      const ok = await verifyPassword(body.data.password, fresh.password_hash)
      if (!ok) return reply.code(401).send({ error: 'invalid_password' })
      await disableTotp(adminId)
      return reply.send({ ok: true })
    })

    // ── Billing: cross-tenant invoices view ────────────────
    instance.get('/invoices', async (request, reply) => {
      const q = z.object({
        status: z.enum(['draft','issued','paid','past_due','void']).optional(),
        period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        page:   z.coerce.number().int().min(1).default(1),
        limit:  z.coerce.number().int().min(1).max(200).default(50),
      }).safeParse(request.query)
      if (!q.success) return reply.code(400).send({ error: 'validation_error', details: q.error.flatten().fieldErrors })
      const { status, period, page, limit } = q.data
      const offset = (page - 1) * limit
      const conds = []
      if (status) conds.push(eq(invoices.status, status))
      if (period) conds.push(eq(invoices.period, period))
      const cond = conds.length > 0 ? sql.join(conds, sql` AND `) : undefined
      const rows = await db
        .select()
        .from(invoices)
        .where(cond as never)
        .orderBy(desc(invoices.created_at))
        .limit(limit)
        .offset(offset)
      return reply.send({ data: rows, page, limit })
    })

    // Trigger manual invoice generation for one tenant + period (idempotent).
    instance.post('/billing/invoices/generate', { preHandler: requireRole('owner', 'finance') }, async (request, reply) => {
      const body = z.object({
        tenant_id: z.number().int().positive(),
        period:    z.string().regex(/^\d{4}-\d{2}$/),
      }).safeParse(request.body)
      if (!body.success) return reply.code(400).send({ error: 'validation_error', details: body.error.flatten().fieldErrors })
      try {
        const result = await generateMonthlyInvoice({ tenantId: body.data.tenant_id, period: body.data.period })
        return reply.code(201).send(result)
      } catch (err) {
        return reply.code(400).send({ error: 'generation_failed', message: (err as Error).message })
      }
    })

    // ── Revenue share: cross-tenant runs ────────────────────
    instance.get('/revenue-share/runs', async (request, reply) => {
      const q = z.object({
        period:    z.string().regex(/^\d{4}-\d{2}$/).optional(),
        tenant_id: z.coerce.number().int().positive().optional(),
      }).safeParse(request.query)
      if (!q.success) return reply.code(400).send({ error: 'validation_error', details: q.error.flatten().fieldErrors })
      const conds = []
      if (q.data.period)    conds.push(eq(revenueShareRuns.period, q.data.period))
      if (q.data.tenant_id) conds.push(eq(revenueShareRuns.tenant_id, q.data.tenant_id))
      const cond = conds.length > 0 ? sql.join(conds, sql` AND `) : undefined
      const rows = await db
        .select()
        .from(revenueShareRuns)
        .where(cond as never)
        .orderBy(desc(revenueShareRuns.period), desc(revenueShareRuns.tenant_id))
        .limit(500)
      return reply.send({ data: rows })
    })

    // Trigger close (calculate + persist) for one tenant + period
    instance.post('/revenue-share/close', { preHandler: requireRole('owner', 'finance') }, async (request, reply) => {
      const body = z.object({
        tenant_id: z.number().int().positive(),
        period:    z.string().regex(/^\d{4}-\d{2}$/),
      }).safeParse(request.body)
      if (!body.success) return reply.code(400).send({ error: 'validation_error', details: body.error.flatten().fieldErrors })
      const result = await closeRevenueShare(body.data.tenant_id, body.data.period)
      return reply.send(result)
    })

    // Lock a run (no further recalculation allowed).
    instance.post('/revenue-share/runs/:id/lock', { preHandler: requireRole('owner') }, async (request, reply) => {
      const id = Number((request.params as { id: string }).id)
      await lockRun(id)
      await auditFromRequest(request, {
        action: 'admin.revenue_share.locked',
        actor_admin_id: request.superAdmin!.admin_id,
        resource: 'revenue_share_run', resource_id: id,
      })
      return reply.send({ ok: true })
    })

    // Inject a run's totals into a given invoice (admin manual workflow).
    instance.post('/revenue-share/runs/:id/inject', { preHandler: requireRole('owner', 'finance') }, async (request, reply) => {
      const id = Number((request.params as { id: string }).id)
      const body = z.object({ invoice_id: z.number().int().positive() }).safeParse(request.body)
      if (!body.success) return reply.code(400).send({ error: 'validation_error', details: body.error.flatten().fieldErrors })
      try {
        await injectIntoInvoice(id, body.data.invoice_id)
        return reply.send({ ok: true })
      } catch (err) {
        return reply.code(400).send({ error: 'inject_failed', message: (err as Error).message })
      }
    })
  })
}
