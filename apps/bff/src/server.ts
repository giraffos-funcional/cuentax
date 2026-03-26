/**
 * CUENTAX BFF — Entry Point (actualizado)
 * =========================================
 * Registra todos los plugins y rutas.
 * Orden: security → auth → business routes
 */

import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import { config } from '@/core/config'
import { logger } from '@/core/logger'
import { redis } from '@/adapters/redis.adapter'

// Routes
import { authRoutes }  from '@/routes/auth'
import { dteRoutes }   from '@/routes/dte'
import { cafRoutes }   from '@/routes/caf'
import { siiRoutes }   from '@/routes/sii'

// Middleware
import { authGuard }   from '@/middlewares/auth-guard'

// Extend Fastify types
declare module 'fastify' {
  interface FastifyRequest {
    companyId?: number
    companyRut?: string
    authenticate?: () => Promise<void>
  }
}

const fastify = Fastify({
  logger: false, // Usamos Pino directo
  trustProxy: true,
})

async function bootstrap() {
  // ── Security ─────────────────────────────────────────────
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // CSP lo maneja Next.js
  })

  await fastify.register(cors, {
    origin: config.ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Company-ID', 'X-API-Key'],
  })

  // ── Plugins ───────────────────────────────────────────────
  await fastify.register(cookie, {
    secret: config.JWT_SECRET,
    hook: 'onRequest',
  })

  await fastify.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB max (certificados y CAF son pequeños)
      files: 1,
    },
  })

  // ── Auth decorator ────────────────────────────────────────
  fastify.decorate('authenticate', authGuard)

  // ── Connect Redis ─────────────────────────────────────────
  await redis.connect()
  logger.info('Redis conectado')

  // ── Health ────────────────────────────────────────────────
  fastify.get('/health', async (_, reply) => {
    const redisAlive = redis.status === 'ready'
    return reply.send({
      status: 'ok',
      service: 'cuentax-bff',
      version: '0.1.0',
      redis: redisAlive ? 'ok' : 'down',
      timestamp: new Date().toISOString(),
    })
  })

  // ── API Routes ────────────────────────────────────────────
  await fastify.register(authRoutes, { prefix: '/api/v1/auth' })
  await fastify.register(dteRoutes,  { prefix: '/api/v1/dte' })
  await fastify.register(cafRoutes,  { prefix: '/api/v1/caf' })
  await fastify.register(siiRoutes,  { prefix: '/api/v1/sii' })

  // ── Global error handler ──────────────────────────────────
  fastify.setErrorHandler((error, request, reply) => {
    logger.error({ error, url: request.url, method: request.method }, 'Unhandled error')

    const statusCode = error.statusCode ?? 500
    reply.status(statusCode).send({
      error: error.code ?? 'internal_error',
      message: config.NODE_ENV === 'production'
        ? 'Error interno del servidor'
        : error.message,
      ...(config.NODE_ENV !== 'production' && { stack: error.stack }),
    })
  })

  // ── 404 handler ───────────────────────────────────────────
  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: 'not_found',
      message: `Ruta no encontrada: ${request.method} ${request.url}`,
    })
  })

  // ── Start ─────────────────────────────────────────────────
  try {
    await fastify.listen({ port: config.PORT, host: '0.0.0.0' })
    logger.info(`🚀 CUENTAX BFF corriendo en http://0.0.0.0:${config.PORT}`)
    logger.info(`   Ambiente: ${config.NODE_ENV}`)
    logger.info(`   SII Bridge: ${config.SII_BRIDGE_URL}`)
    logger.info(`   Odoo: ${config.ODOO_URL}`)
  } catch (err) {
    logger.error(err, 'Error al iniciar BFF')
    process.exit(1)
  }
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info(`${signal} recibido — cerrando servidor...`)
  await fastify.close()
  await redis.quit()
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))

bootstrap()
