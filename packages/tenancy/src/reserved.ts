export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'app',
  'assets',
  'auth',
  'billing',
  'cdn',
  'dashboard',
  'docs',
  'help',
  'mail',
  'mx',
  'ns',
  'ns1',
  'ns2',
  'public',
  'sii',
  'smtp',
  'static',
  'status',
  'support',
  'webhooks',
  'www',
])

export function isReservedSubdomain(slug: string): boolean {
  return RESERVED_SUBDOMAINS.has(slug.toLowerCase())
}
