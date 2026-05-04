/**
 * Tenant impersonation: emit a tenant-scoped JWT carrying the
 * `impersonating_admin_id` claim so the tenant frontend can render a
 * red banner and every audit_log entry can attribute the action.
 *
 * Refs: docs/multitenancy/phase-01-admin.md T1.6
 */
import { randomUUID } from 'crypto'
import { createSigner } from 'fast-jwt'
import { eq } from 'drizzle-orm'
import { config } from '@/core/config'
import { db } from '@/db/client'
import { tenants, companies } from '@/db/schema'
import { logger } from '@/core/logger'

const ACCESS_TTL_SECONDS = 30 * 60 // 30 min — impersonation tokens are short-lived
const signImpersonation = createSigner({
  key: config.JWT_SECRET,
  expiresIn: ACCESS_TTL_SECONDS * 1000,
})

export interface ImpersonationToken {
  access_token: string
  expires_in: number
  tenant: { id: number; slug: string; name: string }
  company: { id: number; rut: string | null; razon_social: string } | null
}

export async function impersonateTenant(
  adminId: number,
  tenantSlug: string,
): Promise<ImpersonationToken | null> {
  const tenantRows = await db.select().from(tenants).where(eq(tenants.slug, tenantSlug)).limit(1)
  const tenant = tenantRows[0]
  if (!tenant) return null

  // Pick the first company under this tenant for the company context.
  const companyRows = await db.select().from(companies).where(eq(companies.tenant_id, tenant.id)).limit(1)
  const company = companyRows[0] ?? null

  const jti = randomUUID()
  const token = signImpersonation({
    sub: `admin:${adminId}`,
    scope: 'tenant',
    tenant_id: tenant.id,
    tenant_slug: tenant.slug,
    company_id: company?.id ?? null,
    company_rut: company?.rut ?? null,
    impersonating_admin_id: adminId,
    jti,
    type: 'access',
  })

  logger.warn(
    { adminId, tenantSlug, jti },
    'admin.impersonation_started',
  )

  return {
    access_token: token,
    expires_in: ACCESS_TTL_SECONDS,
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    company: company
      ? { id: company.id, rut: company.rut, razon_social: company.razon_social }
      : null,
  }
}
