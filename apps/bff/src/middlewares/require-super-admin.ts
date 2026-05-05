/**
 * Middleware: enforce a valid super-admin JWT for /api/admin/* routes.
 *
 * Issues `401 unauthorized` if no/invalid token, `403 forbidden` if the
 * scope claim isn't `admin` (a tenant-user JWT must NOT pass).
 *
 * Refs: docs/multitenancy/phase-01-admin.md T1.4
 */
import type { FastifyRequest, FastifyReply } from 'fastify'
import { createVerifier } from 'fast-jwt'
import { config } from '@/core/config'

const verify = createVerifier({ key: config.JWT_SECRET })

const ALLOWED_IPS = (config.ADMIN_ALLOW_IPS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

function isIpAllowed(ip: string | undefined): boolean {
  if (ALLOWED_IPS.length === 0) return true  // no allowlist → permit all
  if (!ip) return false
  // Strip ::ffff: prefix if present (IPv4-mapped IPv6)
  const normalized = ip.replace(/^::ffff:/, '')
  return ALLOWED_IPS.includes(normalized) || ALLOWED_IPS.includes(ip)
}

export interface AdminTokenPayload {
  sub: string
  scope: 'admin'
  admin_id: number
  email: string
  role: 'owner' | 'support' | 'finance'
  jti: string
}

declare module 'fastify' {
  interface FastifyRequest {
    superAdmin?: AdminTokenPayload
  }
}

export async function requireSuperAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // IP allowlist (optional, controlled by ADMIN_ALLOW_IPS env). Applies
  // before token validation so unauthorized IPs don't even get a 401.
  if (!isIpAllowed(request.ip)) {
    return reply.code(403).send({ error: 'ip_not_allowed' })
  }
  const auth = request.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Bearer token required' })
  }
  const token = auth.slice(7)
  let payload: AdminTokenPayload
  try {
    payload = verify(token) as AdminTokenPayload
  } catch {
    return reply.code(401).send({ error: 'unauthorized', message: 'invalid token' })
  }
  if (payload.scope !== 'admin' || !payload.admin_id) {
    return reply.code(403).send({ error: 'forbidden', message: 'admin scope required' })
  }
  request.superAdmin = payload
}

export function requireRole(...roles: ReadonlyArray<AdminTokenPayload['role']>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.superAdmin) {
      return reply.code(401).send({ error: 'unauthorized' })
    }
    if (!roles.includes(request.superAdmin.role)) {
      return reply.code(403).send({ error: 'forbidden', message: `role ${request.superAdmin.role} not permitted` })
    }
  }
}
