import { describe, it, expect } from 'vitest'
import { isReservedSubdomain, RESERVED_SUBDOMAINS } from '../reserved'

describe('isReservedSubdomain', () => {
  it('flags known reserved names', () => {
    expect(isReservedSubdomain('admin')).toBe(true)
    expect(isReservedSubdomain('api')).toBe(true)
    expect(isReservedSubdomain('www')).toBe(true)
    expect(isReservedSubdomain('webhooks')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isReservedSubdomain('ADMIN')).toBe(true)
  })

  it('does not flag tenant-shaped names', () => {
    expect(isReservedSubdomain('demo')).toBe(false)
    expect(isReservedSubdomain('acme')).toBe(false)
  })

  it('exposes the full set for callers that need to validate slugs', () => {
    expect(RESERVED_SUBDOMAINS.has('admin')).toBe(true)
  })
})
