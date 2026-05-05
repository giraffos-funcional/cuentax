/**
 * Onboarding status — devuelve checklist completado / pendiente
 * para que el tenant vea progreso desde la primera vez que entra.
 */
import type { FastifyInstance } from 'fastify'
import { pool } from '@/db/client'

export async function onboardingRoutes(fastify: FastifyInstance) {
  fastify.get('/status', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })

    const r = await pool.query<{
      companies:   string | number
      cert_loaded: string | number
      caf_loaded:  string | number
      first_dte:   string | number
      contacts:    string | number
      sub_active:  string | number
    }>(
      `SELECT
        (SELECT count(*)::int FROM companies      WHERE tenant_id = $1 AND activo)                      AS companies,
        (SELECT count(*)::int FROM companies      WHERE tenant_id = $1 AND cert_cargado)                AS cert_loaded,
        (SELECT count(*)::int FROM caf_configs    c JOIN companies co ON co.id = c.company_id WHERE co.tenant_id = $1) AS caf_loaded,
        (SELECT count(*)::int FROM dte_documents  d JOIN companies co ON co.id = d.company_id WHERE co.tenant_id = $1 AND d.estado IN ('aceptado','enviado','firmado')) AS first_dte,
        (SELECT count(*)::int FROM contacts       c JOIN companies co ON co.id = c.company_id WHERE co.tenant_id = $1) AS contacts,
        (SELECT count(*)::int FROM subscriptions  WHERE tenant_id = $1 AND status IN ('active','trialing')) AS sub_active
      `,
      [request.tenantId],
    )
    const counts = r.rows[0]!
    const n = (v: string | number) => Number(v)
    const steps = [
      { id: 'company',  label: 'Crear primera empresa',               done: n(counts.companies)   > 0, href: '/dashboard/empresa' },
      { id: 'cert',     label: 'Subir certificado SII',               done: n(counts.cert_loaded) > 0, href: '/dashboard/empresa' },
      { id: 'caf',      label: 'Cargar primer CAF',                   done: n(counts.caf_loaded)  > 0, href: '/dashboard/folios' },
      { id: 'contacts', label: 'Cargar al menos un contacto',         done: n(counts.contacts)    > 0, href: '/dashboard/contactos' },
      { id: 'dte',      label: 'Emitir primer DTE',                   done: n(counts.first_dte)   > 0, href: '/dashboard/emitir' },
      { id: 'plan',     label: 'Activar suscripción / plan',          done: n(counts.sub_active)  > 0, href: '/dashboard/billing' },
    ]
    const completed = steps.filter((s) => s.done).length
    return reply.send({
      tenant_id: request.tenantId,
      completed,
      total: steps.length,
      progress_pct: Math.round((completed / steps.length) * 100),
      steps,
    })
  })
}
