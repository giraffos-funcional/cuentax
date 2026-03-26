/**
 * Giraffos SII BFF — Entry Point
 * ================================
 * Backend For Frontend: API Gateway + Auth + Multi-tenant + Rate Limiting
 *
 * Arquitectura: Hexagonal (Ports & Adapters)
 *   - /routes     → Controllers (HTTP adapters)
 *   - /services   → Domain use cases
 *   - /adapters   → External adapters (Odoo, SII Bridge, Redis)
 *   - /middlewares → Cross-cutting concerns
 */

import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyHelmet from '@fastify/helmet'
import fastifyJwt from '@fastify/jwt'
import fastifyRateLimit from '@fastify/rate-limit'
import { config } from './core/config'
import { logger } from './core/logger'
import { healthRoutes } from './routes/health'
import { authRoutes } from './routes/auth'
import { dteRoutes } from './routes/dte'
import { companyRoutes } from './routes/company'
import { tenantMiddleware } from './middlewares/tenant'

// ── Crear servidor ────────────────────────────────────────────
const server = Fastify({
  logger: false, // Usamos nuestro propio logger pino
  trustProxy: true,
})

// ── Plugins de seguridad (Victor) ──────────────────────────────
await server.register(fastifyHelmet, {
  contentSecurityPolicy: config.NODE_ENV === 'production',
})

await server.register(fastifyCors, {
  origin:
    config.NODE_ENV === 'development'
      ? true
      : [config.WEB_URL],
  credentials: true,
})

await server.register(fastifyRateLimit, {
  global: true,
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (req) =>
    (req.headers['x-api-key'] as string) ||
    req.headers['x-forwarded-for'] as string ||
    req.ip,
})

// ── JWT ───────────────────────────────────────────────────────
await server.register(fastifyJwt, {
  secret: config.JWT_SECRET,
})

// ── Middleware Multi-tenant (ejecuta en cada request) ──────────
server.addHook('preHandler', tenantMiddleware)

// ── Rutas ─────────────────────────────────────────────────────
await server.register(healthRoutes, { prefix: '/health' })
await server.register(authRoutes, { prefix: '/api/v1/auth' })
await server.register(dteRoutes, { prefix: '/api/v1/dte' })
await server.register(companyRoutes, { prefix: '/api/v1/company' })

// ── Global Error Handler ───────────────────────────────────────
server.setErrorHandler((error, request, reply) => {
  logger.error({ err: error, url: request.url }, 'Request error')

  if (error.statusCode === 429) {
    return reply.status(429).send({
      error: 'rate_limit_exceeded',
      message: 'Demasiadas solicitudes. Intenta en 1 minuto.',
    })
  }

  return reply.status(error.statusCode ?? 500).send({
    error: error.code ?? 'internal_error',
    message: config.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message,
  })
})

// ── Start ─────────────────────────────────────────────────────
const start = async () => {
  try {
    await server.listen({ port: config.PORT, host: '0.0.0.0' })
    logger.info(`🚀 Giraffos SII BFF corriendo en puerto ${config.PORT}`)
    logger.info(`   Ambiente: ${config.NODE_ENV}`)
    logger.info(`   SII Bridge: ${config.SII_BRIDGE_URL}`)
    logger.info(`   Odoo: ${config.ODOO_URL}`)
  } catch (err) {
    logger.error(err, '❌ Error arrancando BFF')
    process.exit(1)
  }
}

start()

export { server }
