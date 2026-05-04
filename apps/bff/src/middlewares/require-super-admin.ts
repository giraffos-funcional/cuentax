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
