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
      company_ids: number[]
      jti: string
      country_code: string
      locale: string
      currency: string
    }
    // authenticate — registrado en server.ts
    authenticate?: () => Promise<void>
  }
}

export async function authGuard(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Internal service auth — bypass JWT for service-to-service or CLI calls
  const internalToken = request.headers['x-internal-token'] as string | undefined
  if (internalToken && internalToken === config.INTERNAL_SECRET) {
    const rut = (request.headers['x-company-rut'] as string) || ''
    const companyIdHeader = request.headers['x-company-id'] as string | undefined
    const companyId = companyIdHeader ? parseInt(companyIdHeader, 10) : 0
    request.user = {
      uid: 0,
      email: 'internal@cuentax.cl',
      name: 'Internal Service',
      company_id: companyId,
      company_name: 'Internal',
      company_rut: rut,
      company_ids: companyId ? [companyId] : [],
      jti: 'internal',
      country_code: 'CL',
      locale: 'es-CL',
      currency: 'CLP',
    }
    return
  }

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
      company_ids:  (payload.company_ids ?? [payload.company_id]) as number[],
      jti:          payload.jti as string,
      country_code: (payload.country_code as string) ?? 'CL',
      locale:       (payload.locale as string) ?? 'es-CL',
      currency:     (payload.currency as string) ?? 'CLP',
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
