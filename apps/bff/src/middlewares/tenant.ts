/**
 * Middleware Multi-tenant
 * =======================
 * Resuelve dos cosas independientes en cada request:
 *
 *   1. **Tenant** (contador / despacho): viene del subdomain del Host.
 *      `demo.cuentax.cl` → tenant.slug=`demo` → tenant.id (cacheado en Redis).
 *      También se acepta el query param `?tenant=slug` y el header
 *      `X-Tenant-Slug` (útil en dev / tests). Subdominio reservado o
 *      tenant suspendido devuelve 404 / 402.
 *
 *   2. **Company** (PYME concreta dentro del tenant): viene del header
 *      `X-Company-ID` o del payload del JWT (`company_id`). Validado
 *      contra el tenant en `auth-guard`.
 *
 * Las rutas públicas (`/health`, `/api/v1/auth/login`, `/api/v1/auth/refresh`)
 * se saltan la resolución de tenant.
 *
 * Refs: docs/multitenancy/phase-00-foundation.md T0.5
 */

import type { FastifyRequest, FastifyReply } from 'fastify'
import { resolveTenantFromHost } from '@cuentax/tenancy'
import { tenantsRepository } from '@/repositories/tenants.repository'
import { safeGet, safeSet } from '@/adapters/redis.adapter'
import { config } from '@/core/config'
import { logger } from '@/core/logger'

const PUBLIC_ROUTES = [
  '/health',
  '/metrics',
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
]

const TENANT_OPTIONAL_ROUTES = [
  '/api/v1/webhooks/', // webhooks externos validan firma, no tenant
]

const ROOT_DOMAINS: readonly string[] = (
  config.TENANT_ROOT_DOMAINS ?? 'cuentax.cl,cuentax.local'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const CACHE_TTL_SECONDS = Number(config.TENANT_RESOLVER_CACHE_TTL ?? 60)
const CACHE_KEY = (slug: string): string => `cuentax:tenant:${slug}`
const NEGATIVE_CACHE_VALUE = '__missing__'

interface CachedTenant {
  id: number
  slug: string
  status: string
}

async function lookupTenantBySlug(slug: string): Promise<CachedTenant | null> {
  // 1. Cache hit
  const cached = await safeGet(CACHE_KEY(slug))
  if (cached === NEGATIVE_CACHE_VALUE) return null
  if (cached) {
    try {
      return JSON.parse(cached) as CachedTenant
    } catch {
      // fall through to DB
    }
  }

  // 2. DB
  const row = await tenantsRepository.findBySlug(slug)
  if (!row) {
    await safeSet(CACHE_KEY(slug), NEGATIVE_CACHE_VALUE, CACHE_TTL_SECONDS)
    return null
  }
  const value: CachedTenant = { id: row.id, slug: row.slug, status: row.status }
  await safeSet(CACHE_KEY(slug), JSON.stringify(value), CACHE_TTL_SECONDS)
  return value
}

function pickTenantSlug(request: FastifyRequest): string | null {
  // Prioridad 1: query param (útil en dev / tests)
  const q = (request.query as Record<string, unknown> | undefined)?.tenant
  if (typeof q === 'string' && q.trim()) return q.trim().toLowerCase()

  // Prioridad 2: header explícito (útil cuando nginx no rewrite)
  const h = request.headers['x-tenant-slug']
  if (typeof h === 'string' && h.trim()) return h.trim().toLowerCase()

  // Prioridad 3: Host header
  const host = request.headers.host ?? ''
  const result = resolveTenantFromHost(host, { rootDomains: ROOT_DOMAINS })
  if (result.kind === 'tenant') return result.slug
  return null
}

function isPublicRoute(url: string): boolean {
  if (PUBLIC_ROUTES.some((r) => url.startsWith(r))) return true
  if (TENANT_OPTIONAL_ROUTES.some((r) => url.startsWith(r))) return true
  return false
}

export async function tenantMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  request.companyId = undefined
  request.companyRut = undefined
  request.tenantId = undefined
  request.tenantSlug = undefined

  // ── 1. Resolver Company (legacy: JWT / header) ──────────────
  const companyHeader = request.headers['x-company-id']
  if (companyHeader && typeof companyHeader === 'string') {
    const cid = parseInt(companyHeader, 10)
    if (!isNaN(cid)) request.companyId = cid
  }

  if (request.companyId === undefined) {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '')
      if (token) {
        const payload = (request.server as any).jwt.decode(token) as
          | { company_id?: number; company_rut?: string }
          | null
        if (payload?.company_id) {
          request.companyId = payload.company_id
          request.companyRut = payload.company_rut ?? undefined
        }
      }
    } catch {
      /* token inválido — auth-guard responderá 401 */
    }
  }

  // ── 2. Resolver Tenant (subdomain) ──────────────────────────
  if (isPublicRoute(request.url)) return

  const slug = pickTenantSlug(request)
  if (!slug) {
    // Sin slug y ruta no pública. Para mantener compat durante rollout
    // (Fase 00 → 01), no fallamos: dejamos tenantId undefined y permitimos
    // que el auth-guard valide en base a companyId. Una vez completada
    // la migración, se puede endurecer aquí a 400.
    return
  }

  const tenant = await lookupTenantBySlug(slug)
  if (!tenant) {
    logger.info({ slug, host: request.headers.host }, 'tenant.not_found')
    return reply.code(404).send({ error: 'tenant_not_found', slug })
  }

  if (tenant.status === 'suspended' || tenant.status === 'cancelled') {
    logger.info({ slug, status: tenant.status }, 'tenant.blocked')
    return reply.code(402).send({ error: 'tenant_blocked', status: tenant.status })
  }

  request.tenantId = tenant.id
  request.tenantSlug = tenant.slug
}
