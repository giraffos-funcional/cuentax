/**
 * Self-serve signup — Phase 04.
 *
 * Endpoints:
 *   POST /api/v1/signup
 *     Body: { name, email, slug, password, primary_rut?, plan_code? }
 *     Creates a tenant + first super-admin scoped account... ah no:
 *     creates a tenant in trialing (14d) + a Cuentax local user record
 *     for the contador owner. Authentication still goes through Odoo
 *     for the tenant's own staff (existing flow); the slug becomes the
 *     subdomain (`<slug>.cuentax.cl`).
 *
 * Mitigations:
 *   - Rate-limit on this endpoint (3/min per IP) to deter scripted
 *     squatting on slugs.
 *   - Reserved subdomains list rejects slugs like `admin`, `api`, etc.
 *
 * Refs: docs/multitenancy/phase-04-self-serve.md
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { isReservedSubdomain, isValidSlug } from '@cuentax/tenancy'
import { db } from '@/db/client'
import { tenants } from '@/db/schema'
import { provisionTenant, ProvisioningError } from '@/services/tenant-provisioning.service'
import { sendWelcomeMagicLink, consumeMagicLink } from '@/services/magic-link.service'
import { logger } from '@/core/logger'

const signupSchema = z.object({
  name:         z.string().min(2).max(120),
  email:        z.string().email(),
  slug:         z.string().min(2).max(63),
  primary_rut:  z.string().min(8).max(15).optional(),
  plan_code:    z.string().optional(),
})

export async function signupRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/',
    {
      config: {
        // Configured globally elsewhere; here we just lock the route to a
        // tighter limit. fastify-rate-limit reads `routeOptions.config`.
        rateLimit: { max: 3, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const parsed = signupSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'validation_error', details: parsed.error.flatten().fieldErrors })
      }
      const body = parsed.data

      try {
        const tenant = await provisionTenant({
          slug:          body.slug,
          name:          body.name,
          billing_email: body.email,
          primary_rut:   body.primary_rut,
          plan_code:     body.plan_code,
          status:        'trialing',
        })
        logger.info({ tenantId: tenant.id, slug: tenant.slug, source: 'self-serve' }, 'signup.completed')

        // Fire-and-forget welcome email with magic-link first-login token.
        sendWelcomeMagicLink({
          tenantId:   tenant.id,
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          email:      body.email,
        }).catch((err) => logger.error({ err, tenantId: tenant.id }, 'signup.welcome_email_failed'))

        return reply.code(201).send({
          tenant_slug:    tenant.slug,
          tenant_url:     `https://${tenant.slug}.cuentax.cl`,
          trial_ends_at:  tenant.trial_ends_at,
          next:           'check_email',
        })
      } catch (err) {
        if (err instanceof ProvisioningError) {
          return reply.code(409).send({ error: err.code, message: err.message })
        }
        logger.error({ err }, 'signup.failed')
        return reply.code(500).send({ error: 'signup_failed' })
      }
    },
  )

  // Consume a magic-link token (first-login). Returns tenant info; the
  // frontend should redirect the user to the tenant subdomain login.
  fastify.post('/magic-link/consume', async (request, reply) => {
    const body = z.object({ token: z.string().min(1) }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'validation_error' })
    const result = await consumeMagicLink(body.data.token)
    if (!result.ok) return reply.code(401).send({ error: result.reason })
    return reply.send({
      tenant_id: result.tenant_id,
      email:     result.email,
      purpose:   result.purpose,
    })
  })

  // Public slug availability check (used by the signup form)
  fastify.get('/slug-available', async (request, reply) => {
    const slug = String((request.query as { slug?: string }).slug ?? '').trim().toLowerCase()
    if (!slug) return reply.code(400).send({ error: 'slug_required' })
    try {
      if (!isValidSlug(slug))        return reply.send({ available: false, reason: 'invalid' })
      if (isReservedSubdomain(slug)) return reply.send({ available: false, reason: 'reserved' })
      const existing = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1)
      if (existing.length > 0)       return reply.send({ available: false, reason: 'taken' })
      return reply.send({ available: true })
    } catch (err) {
      logger.error({ err }, 'signup.slug_check_failed')
      return reply.code(500).send({ error: 'check_failed' })
    }
  })
}
