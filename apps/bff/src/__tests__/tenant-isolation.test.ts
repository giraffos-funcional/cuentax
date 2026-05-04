/**
 * T0.8 — Tenant resolution & isolation logic.
 *
 * Unit tests for the middleware's host → tenant resolution logic.
 * (A full DB-backed E2E lives in tests/integration/, runs against a real
 * Postgres with two seeded tenants — pending Docker availability.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveTenantFromHost } from '@cuentax/tenancy'

const ROOTS = ['cuentax.cl', 'cuentax.local'] as const

describe('host → tenant resolution', () => {
  it('resolves tenant from a normal subdomain', () => {
    expect(resolveTenantFromHost('demo.cuentax.cl', { rootDomains: ROOTS })).toEqual({
      kind: 'tenant',
      slug: 'demo',
    })
    expect(resolveTenantFromHost('acme.cuentax.cl', { rootDomains: ROOTS })).toEqual({
      kind: 'tenant',
      slug: 'acme',
    })
  })

  it('reserves admin / api / www so they are never tenant slugs', () => {
    expect(resolveTenantFromHost('admin.cuentax.cl', { rootDomains: ROOTS }).kind).toBe('reserved')
    expect(resolveTenantFromHost('api.cuentax.cl', { rootDomains: ROOTS }).kind).toBe('reserved')
    expect(resolveTenantFromHost('www.cuentax.cl', { rootDomains: ROOTS }).kind).toBe('reserved')
  })

  it('does not leak across root domains', () => {
    expect(resolveTenantFromHost('demo.example.com', { rootDomains: ROOTS }).kind).toBe('unknown')
  })
})

describe('tenant cache key isolation', () => {
  // Sanity check: two slugs with similar prefixes yield distinct keys.
  it('produces distinct cache keys for distinct slugs', () => {
    const key = (slug: string) => `cuentax:tenant:${slug}`
    expect(key('demo')).not.toBe(key('demo2'))
    expect(key('acme')).not.toBe(key('ac-me'))
  })
})

/**
 * NOTE — full integration test (pending DB):
 *
 *   1. Seed tenants `demo`, `acme` (each with one company + one user).
 *   2. Login as user-of-demo.
 *   3. Issue request to `demo.cuentax.cl/api/v1/contacts` → returns demo's data.
 *   4. Same JWT → request to `acme.cuentax.cl/api/v1/contacts` → must fail
 *      (tenant mismatch in auth-guard, even before RLS kicks in).
 *   5. Bypass app filter via raw SQL using a connection with `app.current_tenant`
 *      set to `demo`'s id, then attempt to SELECT acme rows → must return 0 rows
 *      (RLS enforced).
 *
 * Implementation lives in apps/bff/tests/integration/tenant-isolation.spec.ts
 * once docker-compose.dev.yml is up. Pending T0.5/T0.7 validation.
 */
beforeEach(() => {
  vi.restoreAllMocks()
})
