/**
 * CUENTAX BFF — Entry Point (actualizado)
 * =========================================
 * Registra todos los plugins y rutas.
 * Orden: security → auth → business routes
 */

import Fastify from 'fastify'
import type { FastifyRequest, FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import { config } from '@/core/config'
import { logger } from '@/core/logger'
import { redis } from '@/adapters/redis.adapter'

// Routes
import { authRoutes }     from '@/routes/auth'
import { companyRoutes }  from '@/routes/company'
import { dteRoutes }      from '@/routes/dte'
import { cafRoutes }      from '@/routes/caf'
import { siiRoutes }      from '@/routes/sii'
import { contactsRoutes } from '@/routes/contacts'
import { productsRoutes } from '@/routes/products'
import { reportesRoutes } from '@/routes/reportes'
import { contabilidadRoutes } from '@/routes/contabilidad'
import { remuneracionesRoutes } from '@/routes/remuneraciones'
import { indicatorsRoutes } from '@/routes/indicators'
import { certificationRoutes } from '@/routes/certification'

// Jobs
import { dteStatusPoller } from '@/jobs/dte-status-poller'
import { previredScheduler } from '@/jobs/previred-scraper'

// DB
import { pingDB, db } from '@/db/client'
import { sql } from 'drizzle-orm'

// Middleware
import { authGuard } from '@/middlewares/auth-guard'

// Extend Fastify types
declare module 'fastify' {
  interface FastifyRequest {
    companyId?: number
    companyRut?: string
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
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

  // ── Check DB ──────────────────────────────────────────────
  const dbAlive = await pingDB()
  logger.info(dbAlive ? '✅ PostgreSQL conectado' : '⚠️  PostgreSQL no disponible (usando mock DB)')

  // ── Auto-migration: ensure schema is up to date ──────────
  if (dbAlive) {
    try {
      // Auto-create enums and tables if they don't exist
      await db.execute(sql`DO $$ BEGIN CREATE TYPE dte_status AS ENUM('borrador','firmado','enviado','aceptado','rechazado','anulado'); EXCEPTION WHEN duplicate_object THEN null; END $$`)
      await db.execute(sql`DO $$ BEGIN CREATE TYPE cotizacion_status AS ENUM('borrador','enviada','aceptada','rechazada','expirada','convertida'); EXCEPTION WHEN duplicate_object THEN null; END $$`)
      await db.execute(sql`DO $$ BEGIN CREATE TYPE forma_pago AS ENUM('contado','credito','30dias','60dias'); EXCEPTION WHEN duplicate_object THEN null; END $$`)
      await db.execute(sql`DO $$ BEGIN CREATE TYPE ambiente_sii AS ENUM('certificacion','produccion'); EXCEPTION WHEN duplicate_object THEN null; END $$`)

      await db.execute(sql`CREATE TABLE IF NOT EXISTS "companies" (
        "id" serial PRIMARY KEY, "odoo_company_id" integer UNIQUE, "rut" varchar(15) NOT NULL UNIQUE,
        "razon_social" text NOT NULL, "giro" text NOT NULL, "actividad_economica" integer DEFAULT 620200,
        "direccion" text, "comuna" varchar(50), "ciudad" varchar(50) DEFAULT 'Santiago',
        "email" text, "telefono" varchar(20),
        "ambiente_sii" ambiente_sii DEFAULT 'certificacion', "cert_vence" timestamptz, "cert_cargado" boolean DEFAULT false,
        "plan" varchar(20) DEFAULT 'starter', "activo" boolean DEFAULT true,
        "created_at" timestamptz DEFAULT now(), "updated_at" timestamptz DEFAULT now()
      )`)

      await db.execute(sql`CREATE TABLE IF NOT EXISTS "dte_documents" (
        "id" serial PRIMARY KEY, "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "tipo_dte" integer NOT NULL, "folio" integer, "track_id" varchar(50),
        "estado" dte_status DEFAULT 'borrador',
        "rut_receptor" varchar(15) NOT NULL, "razon_social_receptor" text NOT NULL,
        "giro_receptor" text, "email_receptor" text,
        "monto_neto" bigint DEFAULT 0, "monto_exento" bigint DEFAULT 0, "monto_iva" bigint DEFAULT 0, "monto_total" bigint NOT NULL,
        "fecha_emision" text NOT NULL, "fecha_vencimiento" text,
        "xml_firmado_b64" text, "pdf_url" text,
        "ref_tipo_doc" integer, "ref_folio" integer, "ref_motivo" text,
        "items_json" jsonb, "observaciones" text, "odoo_move_id" integer,
        "cotizacion_id" integer, "created_by" integer,
        "created_at" timestamptz DEFAULT now(), "updated_at" timestamptz DEFAULT now()
      )`)

      await db.execute(sql`CREATE TABLE IF NOT EXISTS "contacts" (
        "id" serial PRIMARY KEY, "company_id" integer NOT NULL REFERENCES "companies"("id"),
        "rut" varchar(15) NOT NULL, "razon_social" text NOT NULL, "giro" text,
        "email" text, "telefono" varchar(20), "direccion" text, "comuna" varchar(50),
        "es_proveedor" boolean DEFAULT false, "es_cliente" boolean DEFAULT true,
        "activo" boolean DEFAULT true, "notas" text, "odoo_partner_id" integer,
        "created_at" timestamptz DEFAULT now()
      )`)

      await db.execute(sql`CREATE TABLE IF NOT EXISTS "products" (
        "id" serial PRIMARY KEY, "company_id" integer NOT NULL REFERENCES "companies"("id"),
        "codigo" varchar(50), "nombre" text NOT NULL, "descripcion" text,
        "precio" bigint NOT NULL, "precio_con_iva" bigint, "unidad" varchar(20) DEFAULT 'UN',
        "exento" boolean DEFAULT false, "activo" boolean DEFAULT true,
        "categoria" text, "odoo_product_id" integer,
        "created_at" timestamptz DEFAULT now()
      )`)

      await db.execute(sql`CREATE TABLE IF NOT EXISTS "quotations" (
        "id" serial PRIMARY KEY, "company_id" integer NOT NULL REFERENCES "companies"("id"),
        "numero" integer NOT NULL, "estado" cotizacion_status DEFAULT 'borrador',
        "rut_receptor" varchar(15) NOT NULL, "razon_social_receptor" text NOT NULL,
        "giro_receptor" text, "email_receptor" text,
        "fecha" text NOT NULL, "valida_hasta" text NOT NULL, "monto_total" bigint NOT NULL,
        "items_json" jsonb NOT NULL, "observaciones" text, "dte_id" integer,
        "created_at" timestamptz DEFAULT now(), "updated_at" timestamptz DEFAULT now()
      )`)

      await db.execute(sql`CREATE TABLE IF NOT EXISTS "caf_configs" (
        "id" serial PRIMARY KEY, "company_id" integer NOT NULL REFERENCES "companies"("id"),
        "tipo_dte" integer NOT NULL, "folio_desde" integer NOT NULL,
        "folio_hasta" integer NOT NULL, "folio_actual" integer NOT NULL,
        "fecha_autorizacion" text, "activo" boolean DEFAULT true,
        "created_at" timestamptz DEFAULT now()
      )`)

      await db.execute(sql`CREATE TABLE IF NOT EXISTS "audit_log" (
        "id" serial PRIMARY KEY, "company_id" integer, "user_id" integer,
        "action" text NOT NULL, "resource" text, "resource_id" integer,
        "ip" text, "user_agent" text, "payload_json" jsonb,
        "created_at" timestamptz DEFAULT now()
      )`)

      // Cleanup disabled — was causing issues. Companies managed via UI only.

      logger.info('✅ Schema auto-migration complete')
    } catch (migErr) {
      logger.warn({ migErr }, 'Schema migration failed — non-critical')
    }
  }

  // ── API Routes ────────────────────────────────────────────
  await fastify.register(authRoutes,     { prefix: '/api/v1/auth' })
  await fastify.register(companyRoutes,  { prefix: '/api/v1/companies' })
  await fastify.register(dteRoutes,      { prefix: '/api/v1/dte' })
  await fastify.register(cafRoutes,      { prefix: '/api/v1/caf' })
  await fastify.register(siiRoutes,      { prefix: '/api/v1/sii' })
  await fastify.register(contactsRoutes, { prefix: '/api/v1/contacts' })
  await fastify.register(productsRoutes, { prefix: '/api/v1/products' })
  await fastify.register(reportesRoutes,      { prefix: '/api/v1/reportes' })
  await fastify.register(contabilidadRoutes,  { prefix: '/api/v1/contabilidad' })
  await fastify.register(remuneracionesRoutes, { prefix: '/api/v1/remuneraciones' })
  await fastify.register(indicatorsRoutes, { prefix: '/api/v1/indicators' })
  await fastify.register(certificationRoutes, { prefix: '/api/v1/certification' })

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

    // ── Background Jobs ───────────────────────────────────────
    previredScheduler.start()
  } catch (err) {
    logger.error(err, 'Error al iniciar BFF')
    process.exit(1)
  }
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info(`${signal} recibido — cerrando servidor...`)
  previredScheduler.stop()
  await fastify.close()
  await redis.quit()
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))

bootstrap()
