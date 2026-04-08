/**
 * Auth Routes — CUENTAX BFF
 * POST /api/v1/auth/login
 * POST /api/v1/auth/refresh
 * POST /api/v1/auth/logout
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authService } from '@/services/auth.service'
import { logger } from '@/core/logger'

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
  company_rut: z.string().optional(),
})

const refreshSchema = z.object({
  refresh_token: z.string().min(1),
})

export async function authRoutes(fastify: FastifyInstance) {
  // ── POST /login ────────────────────────────────────────────
  fastify.post('/login', async (request, reply) => {
    const result = loginSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({
        error: 'validation_error',
        message: 'Datos de login inválidos',
        details: result.error.flatten().fieldErrors,
      })
    }

    const { email, password, company_rut } = result.data

    const tokens = await authService.login(email, password, company_rut)

    if (!tokens) {
      return reply.status(401).send({
        error: 'invalid_credentials',
        message: 'Email o contraseña incorrectos',
      })
    }

    // Guardar refresh token en cookie HttpOnly segura
    reply.setCookie('cuentax_refresh', tokens.refresh_token, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60, // 7 días en segundos
      path: '/api/v1/auth',
    })

    return reply.status(200).send({
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
      user: tokens.user,
    })
  })

  // ── POST /refresh ──────────────────────────────────────────
  fastify.post('/refresh', async (request, reply) => {
    // Leer desde cookie HttpOnly o body (fallback para apps móviles)
    const refreshToken =
      (request.cookies?.['cuentax_refresh']) ??
      (refreshSchema.safeParse(request.body).data?.refresh_token)

    if (!refreshToken) {
      return reply.status(401).send({
        error: 'no_refresh_token',
        message: 'No se encontró refresh token',
      })
    }

    const tokens = await authService.refresh(refreshToken)

    if (!tokens) {
      reply.clearCookie('cuentax_refresh', { path: '/api/v1/auth' })
      return reply.status(401).send({
        error: 'invalid_refresh_token',
        message: 'Refresh token inválido o expirado. Inicia sesión nuevamente.',
      })
    }

    // Rotar cookie
    reply.setCookie('cuentax_refresh', tokens.refresh_token, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60,
      path: '/api/v1/auth',
    })

    return reply.status(200).send({
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
      user: tokens.user,
    })
  })

  // ── POST /logout ───────────────────────────────────────────
  fastify.post('/logout', async (request, reply) => {
    const refreshToken = request.cookies?.['cuentax_refresh'] ?? ''
    const accessJti = (request as any).user?.jti as string | undefined

    await authService.logout(refreshToken, accessJti)
    reply.clearCookie('cuentax_refresh', { path: '/api/v1/auth' })

    logger.info('User logged out')
    return reply.status(200).send({ message: 'Sesión cerrada correctamente' })
  })

  // ── POST /switch-company ────────────────────────────────────
  fastify.post('/switch-company', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = z.object({ company_id: z.number().int().positive() }).parse(request.body)
    const user = (request as any).user

    const tokens = await authService.switchCompany(
      { sub: user.sub, email: user.email, name: user.name, company_ids: user.company_ids },
      body.company_id,
    )

    if (!tokens) {
      return reply.status(403).send({ error: 'forbidden', message: 'No tienes acceso a esa empresa' })
    }

    return reply.send({
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
      user: tokens.user,
    })
  })

  // ── GET /me ────────────────────────────────────────────────
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    return reply.send({ user: (request as any).user })
  })
}
