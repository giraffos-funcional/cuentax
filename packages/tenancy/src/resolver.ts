import { isReservedSubdomain } from './reserved'

export interface ResolverOptions {
  rootDomains: readonly string[]
}

export type ResolveResult =
  | { kind: 'tenant'; slug: string }
  | { kind: 'reserved'; slug: string }
  | { kind: 'apex' }
  | { kind: 'unknown' }

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const IPV4_REGEX = /^\d{1,3}(\.\d{1,3}){3}$/

export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug)
}

function stripPort(host: string): string {
  if (host.startsWith('[')) {
    const close = host.indexOf(']')
    return close === -1 ? host : host.slice(0, close + 1)
  }
  const colon = host.indexOf(':')
  return colon === -1 ? host : host.slice(0, colon)
}

function isIpLiteral(host: string): boolean {
  if (host.startsWith('[') && host.endsWith(']')) return true
  return IPV4_REGEX.test(host)
}

export function resolveTenantFromHost(
  rawHost: string | undefined | null,
  options: ResolverOptions,
): ResolveResult {
  if (!rawHost) return { kind: 'unknown' }

  const host = stripPort(rawHost.trim().toLowerCase())
  if (!host || isIpLiteral(host)) return { kind: 'unknown' }

  for (const root of options.rootDomains) {
    const r = root.toLowerCase()
    if (host === r) return { kind: 'apex' }
    if (host.endsWith('.' + r)) {
      const sub = host.slice(0, host.length - r.length - 1)
      if (sub.includes('.')) {
        return { kind: 'unknown' }
      }
      if (!isValidSlug(sub)) return { kind: 'unknown' }
      if (isReservedSubdomain(sub)) return { kind: 'reserved', slug: sub }
      return { kind: 'tenant', slug: sub }
    }
  }

  return { kind: 'unknown' }
}
