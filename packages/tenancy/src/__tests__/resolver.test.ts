import { describe, it, expect } from 'vitest'
import { resolveTenantFromHost, isValidSlug } from '../resolver'

const opts = { rootDomains: ['cuentax.cl', 'cuentax.local'] as const }

describe('resolveTenantFromHost', () => {
  it('returns apex for the root domain', () => {
    expect(resolveTenantFromHost('cuentax.cl', opts)).toEqual({ kind: 'apex' })
  })

  it('returns tenant for a normal subdomain', () => {
    expect(resolveTenantFromHost('demo.cuentax.cl', opts)).toEqual({
      kind: 'tenant',
      slug: 'demo',
    })
  })

  it('strips port and is case-insensitive', () => {
    expect(resolveTenantFromHost('Demo.Cuentax.CL:443', opts)).toEqual({
      kind: 'tenant',
      slug: 'demo',
    })
  })

  it('flags reserved subdomains', () => {
    expect(resolveTenantFromHost('admin.cuentax.cl', opts)).toEqual({
      kind: 'reserved',
      slug: 'admin',
    })
    expect(resolveTenantFromHost('api.cuentax.cl', opts)).toEqual({
      kind: 'reserved',
      slug: 'api',
    })
  })

  it('rejects multi-level subdomains (no nested tenants)', () => {
    expect(resolveTenantFromHost('foo.bar.cuentax.cl', opts)).toEqual({
      kind: 'unknown',
    })
  })

  it('rejects IP literals', () => {
    expect(resolveTenantFromHost('127.0.0.1', opts)).toEqual({ kind: 'unknown' })
    expect(resolveTenantFromHost('10.0.0.1:4000', opts)).toEqual({
      kind: 'unknown',
    })
    expect(resolveTenantFromHost('[::1]:4000', opts)).toEqual({ kind: 'unknown' })
  })

  it('rejects unrelated domains', () => {
    expect(resolveTenantFromHost('demo.example.com', opts)).toEqual({
      kind: 'unknown',
    })
  })

  it('rejects invalid slugs', () => {
    expect(resolveTenantFromHost('-bad.cuentax.cl', opts)).toEqual({
      kind: 'unknown',
    })
    expect(resolveTenantFromHost('bad-.cuentax.cl', opts)).toEqual({
      kind: 'unknown',
    })
    expect(resolveTenantFromHost('UPPER.cuentax.cl', opts).kind).toBe('tenant') // lowercased
  })

  it('handles missing/empty host', () => {
    expect(resolveTenantFromHost(undefined, opts)).toEqual({ kind: 'unknown' })
    expect(resolveTenantFromHost('', opts)).toEqual({ kind: 'unknown' })
    expect(resolveTenantFromHost('   ', opts)).toEqual({ kind: 'unknown' })
  })

  it('matches against any configured root domain', () => {
    expect(resolveTenantFromHost('demo.cuentax.local', opts)).toEqual({
      kind: 'tenant',
      slug: 'demo',
    })
  })
})

describe('isValidSlug', () => {
  it('accepts valid slugs', () => {
    expect(isValidSlug('demo')).toBe(true)
    expect(isValidSlug('a')).toBe(true)
    expect(isValidSlug('a-b-c')).toBe(true)
    expect(isValidSlug('tenant-123')).toBe(true)
  })

  it('rejects invalid slugs', () => {
    expect(isValidSlug('')).toBe(false)
    expect(isValidSlug('-leading')).toBe(false)
    expect(isValidSlug('trailing-')).toBe(false)
    expect(isValidSlug('UPPER')).toBe(false)
    expect(isValidSlug('with.dot')).toBe(false)
    expect(isValidSlug('with_underscore')).toBe(false)
  })
})
