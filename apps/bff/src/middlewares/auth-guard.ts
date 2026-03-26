/**
 * Auth Guard — CUENTAX BFF
 * Middleware que valida el JWT access token en cada request protegido.
 * Verifica blacklist en Redis para tokens revocados.
 */

import type { FastifyRequest, FastifyReply } from 'fastify'
import { createVerifier } from 'fast-jwt'
import { config } from '@/core/config'
import { logger } from '@/core/logger'
import { redis } from '@/adapters/redis.adapter'

const verifyAccess = createVerifier({ key: config.JWT_SECRET })
const BLACKLIST_PREFIX = 'cuentax:blacklist:'

// Extender el tipo de request
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      uid: number
      email: string
      name: string
      company_id: number
      company_name: string
      company_rut: string
      jti: string
    }
    // authenticate — registrado en server.ts
    authenticate?: () => Promise<void>
  }
}

export async function authGuard(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({
      error: 'unauthorized',
      message: 'Token de acceso requerido',
    })
  }

  const token = authHeader.slice(7)

  try {
    const payload = verifyAccess(token)

    if (payload.type !== 'access') {
      return reply.status(401).send({ error: 'invalid_token_type' })
    }

    // Verificar blacklist (tokens revocados por logout)
    const isBlacklisted = await redis.get(`${BLACKLIST_PREFIX}${payload.jti}`)
    if (isBlacklisted) {
      logger.warn({ jti: payload.jti }, 'Blacklisted token used')
      return reply.status(401).send({
        error: 'token_revoked',
        message: 'Token revocado. Inicia sesión nuevamente.',
      })
    }

    // Inyectar user en el request
    request.user = {
      uid:          Number(payload.sub),
      email:        payload.email as string,
      name:         payload.name as string,
      company_id:   payload.company_id as number,
      company_name: payload.company_name as string,
      company_rut:  payload.company_rut as string,
      jti:          payload.jti as string,
    }

    // Actualizar companyId en el multi-tenant context
    request.companyId = payload.company_id as number
    request.companyRut = payload.company_rut as string

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Token inválido'
    if (msg.includes('expired')) {
      return reply.status(401).send({
        error: 'token_expired',
        message: 'Token expirado. Usa el refresh token para renovar.',
      })
    }
    return reply.status(401).send({ error: 'invalid_token', message: msg })
  }
}
