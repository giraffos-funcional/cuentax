/**
 * CUENTAX BFF — Entry Point (actualizado)
 * =========================================
 * Registra todos los plugins y rutas.
 * Orden: security → auth → business routes
 */

import { initSentry, captureException } from '@/core/sentry'
import { randomUUID } from 'node:crypto'
import Fastify from 'fastify'
import type { FastifyRequest, FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client'
import { config } from '@/core/config'
import { logger } from '@/core/logger'
import { redis, isRedisReady } from '@/adapters/redis.adapter'
import { siiBridgeCircuit } from '@/adapters/sii-bridge.adapter'
import { CircuitOpenError } from '@/core/circuit-breaker'
import { odooAccountingCircuit } from '@/adapters/odoo-accounting.adapter'
import { odooAuthCircuit } from '@/adapters/odoo-auth.adapter'

// Routes
import { authRoutes }     from '@/routes/auth'
import { companyRoutes }  from '@/routes/company'
import { dteRecibidosRoutes } from '@/routes/dte-recibidos'
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
import { portalRoutes } from '@/routes/portal'
import { rcvRoutes } from '@/routes/rcv'
import { jobsRoutes } from '@/routes/jobs'
import { cotizacionesRoutes } from '@/routes/cotizaciones'
import { comprasRoutes } from '@/routes/compras'
import { bankRoutes } from '@/routes/bank'
import { gastosRoutes } from '@/routes/gastos'
import { pushTokenRoutes } from '@/routes/push-tokens'
import { ocrRoutes } from '@/routes/ocr'
import { aiChatRoutes } from '@/routes/ai-chat'

// Jobs (BullMQ)
import { startDTEStatusPoller, stopDTEStatusPoller, getDTEStatusQueue } from '@/jobs/dte-status-poller'
import { startDTEMailboxPoller, stopDTEMailboxPoller, getDTEMailboxQueue } from '@/jobs/dte-mailbox-poller'
import { startPreviredScraper, stopPreviredScraper, getPreviredQueue } from '@/jobs/previred-scraper'
import { startRCVSync, stopRCVSync, getRCVSyncQueue } from '@/jobs/rcv-sync'

// DB
import { pingDB, db } from '@/db/client'
import { sql } from 'drizzle-orm'

// Middleware
import { authGuard } from '@/middlewares/auth-guard'

// Request context (AsyncLocalStorage for correlation IDs)
import { requestContext } from '@/core/request-context'

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

// ── Prometheus Metrics ────────────────────────────────────
const metricsRegistry = new Registry()
collectDefaultMetrics({ register: metricsRegistry })

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [metricsRegistry],
})

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
})

const circuitBreakerState = new Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
  labelNames: ['name'] as const,
  registers: [metricsRegistry],
})

const CIRCUIT_STATE_MAP: Record<string, number> = {
  closed: 0,
  open: 1,
  'half-open': 2,
}

// Initialize Sentry before anything else (no-op if SENTRY_DSN is not set)
initSentry()

const fastify = Fastify({
  logger: false, // Usamos Pino directo
  trustProxy: true,
  genReqId: (req) => (req.headers['x-request-id'] as string) || randomUUID(),
  requestIdHeader: 'x-request-id',
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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Company-ID', 'X-API-Key', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID', 'Content-Disposition'],
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

  // ── Request correlation ID ────────────────────────────────
  fastify.addHook('onRequest', (request, reply, done) => {
    const reqId = request.id as string
    request.log = logger.child({ reqId })
    reply.header('x-request-id', reqId)
    // Store in AsyncLocalStorage so adapters can read it without explicit threading
    requestContext.enterWith({ requestId: reqId })
    done()
  })

  // ── Prometheus request tracking ────────────────────────────
  fastify.addHook('onResponse', (request, reply, done) => {
    // Normalize route to avoid high-cardinality label explosion
    const route = request.routeOptions?.url ?? request.url
    const method = request.method
    const statusCode = String(reply.statusCode)

    httpRequestsTotal.inc({ method, route, status_code: statusCode })
    // reply.elapsedTime is in milliseconds (Fastify built-in)
    httpRequestDuration.observe({ method, route }, reply.elapsedTime / 1000)
    done()
  })

  // ── Prometheus /metrics endpoint ──────────────────────────
  fastify.get('/metrics', async (_, reply) => {
    // Update circuit breaker gauges on each scrape
    for (const circuit of [siiBridgeCircuit, odooAccountingCircuit, odooAuthCircuit]) {
      const info = circuit.getState()
      circuitBreakerState.set(
        { name: info.name },
        CIRCUIT_STATE_MAP[info.state] ?? 0,
      )
    }

    reply.header('Content-Type', metricsRegistry.contentType)
    return metricsRegistry.metrics()
  })

  // ── Connect Redis ─────────────────────────────────────────
  await redis.connect()
  logger.info('Redis conectado')

  // ── Health ────────────────────────────────────────────────

  // Liveness probe — confirms process is running, no dependency checks
  fastify.get('/health/live', async (_, reply) => {
    return reply.status(200).send({
      status: 'ok',
      service: 'cuentax-bff',
      timestamp: new Date().toISOString(),
    })
  })

  // Readiness probe — checks all dependencies, returns 503 if any are down
  fastify.get('/health/ready', async (_, reply) => {
    const redisAlive = isRedisReady()

    let pgAlive = false
    try {
      pgAlive = await pingDB()
    } catch {
      pgAlive = false
    }

    const allHealthy = redisAlive && pgAlive
    const statusCode = allHealthy ? 200 : 503

    return reply.status(statusCode).send({
      status: allHealthy ? 'ok' : 'degraded',
      service: 'cuentax-bff',
      version: '0.1.0',
      dependencies: {
        redis: redisAlive ? 'ok' : 'down',
        postgresql: pgAlive ? 'ok' : 'down',
      },
      circuits: {
        sii_bridge: siiBridgeCircuit.getState(),
        odoo_accounting: odooAccountingCircuit.getState(),
        odoo_auth: odooAuthCircuit.getState(),
      },
      timestamp: new Date().toISOString(),
    })
  })

  // Legacy health endpoint — now checks all dependencies properly
  fastify.get('/health', async (_, reply) => {
    const redisAlive = isRedisReady()

    let pgAlive = false
    try {
      pgAlive = await pingDB()
    } catch {
      pgAlive = false
    }

    const allHealthy = redisAlive && pgAlive
    const statusCode = allHealthy ? 200 : 503

    return reply.status(statusCode).send({
      status: allHealthy ? 'ok' : 'degraded',
      service: 'cuentax-bff',
      version: '0.1.0',
      dependencies: {
        redis: redisAlive ? 'ok' : 'down',
        postgresql: pgAlive ? 'ok' : 'down',
      },
      circuits: {
        sii_bridge: siiBridgeCircuit.getState(),
        odoo_accounting: odooAccountingCircuit.getState(),
        odoo_auth: odooAuthCircuit.getState(),
      },
      timestamp: new Date().toISOString(),
    })
  })

  // ── Check DB ──────────────────────────────────────────────
  const dbAlive = await pingDB()
  logger.info(dbAlive ? '✅ PostgreSQL conectado' : '⚠️  PostgreSQL no disponible (usando mock DB)')

  // ── Auto-migration: ensure schema is up to date ──────────
  // TODO: Remove after Drizzle Kit migrations are verified in production
  // This inline DDL block is a legacy safety net. The canonical schema lives in
  // src/db/schema.ts and migrations are managed by Drizzle Kit (see src/db/migrations/README.md).
  // Once `drizzle-kit migrate` has been validated in staging and production,
  // delete this entire block (lines through "Schema auto-migration complete").
  if (dbAlive) {
    try {
      // TODO: Remove after Drizzle Kit migrations are verified in production
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

      // Migration 0006: Company DTE / SII Resolution fields (idempotent)
      await db.execute(sql`DO $$ BEGIN CREATE TYPE tipo_contribuyente AS ENUM('iva_afecto_1a','iva_afecto_2a','exento','pequeno_contribuyente'); EXCEPTION WHEN duplicate_object THEN null; END $$`)
      await db.execute(sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "region" varchar(60)`)
      await db.execute(sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "movil" varchar(20)`)
      await db.execute(sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "sitio_web" text`)
      await db.execute(sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "tipo_contribuyente" tipo_contribuyente`)
      await db.execute(sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "actividades_economicas" integer[]`)
      await db.execute(sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "correo_dte" text`)
      await db.execute(sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "oficina_regional_sii" varchar(60)`)
      await db.execute(sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "numero_resolucion_sii" integer`)
      await db.execute(sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "fecha_resolucion_sii" date`)

      // Migration 0007a: IMAP credentials for DTE inbox listener
      await db.execute(sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "dte_imap_host" varchar(100)`)
      await db.execute(sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "dte_imap_port" integer DEFAULT 993`)
      await db.execute(sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "dte_imap_user" varchar(100)`)
      await db.execute(sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "dte_imap_password_enc" text`)
      await db.execute(sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "dte_imap_auto_sync" boolean DEFAULT false`)
      await db.execute(sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "dte_imap_last_sync" timestamptz`)

      // Migration 0007: DTEs Recibidos (idempotent)
      await db.execute(sql`CREATE TABLE IF NOT EXISTS "dtes_recibidos" (
        "id" serial PRIMARY KEY,
        "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "tipo_dte" integer NOT NULL,
        "folio" integer NOT NULL,
        "rut_emisor" varchar(15) NOT NULL,
        "razon_social_emisor" text,
        "fecha_emision" text NOT NULL,
        "monto_total" bigint NOT NULL,
        "estado_respuesta" varchar(30) DEFAULT 'pendiente',
        "fecha_recibido" timestamptz DEFAULT now(),
        "fecha_respuesta" timestamptz,
        "glosa_respuesta" text,
        "envio_xml_b64" text,
        "recepcion_xml_b64" text,
        "resultado_xml_b64" text,
        "envio_recibos_xml_b64" text,
        "fuente" varchar(20) DEFAULT 'manual',
        "email_origen" text,
        "created_at" timestamptz DEFAULT now(),
        "updated_at" timestamptz DEFAULT now()
      )`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "dr_company_idx" ON "dtes_recibidos" ("company_id")`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "dr_estado_idx" ON "dtes_recibidos" ("company_id", "estado_respuesta")`)
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "dr_unique_idx" ON "dtes_recibidos" ("company_id", "tipo_dte", "folio", "rut_emisor")`)

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

      await db.execute(sql`DO $$ BEGIN CREATE TYPE purchase_order_status AS ENUM('solicitud','enviada','confirmada','recibida','cancelada'); EXCEPTION WHEN duplicate_object THEN null; END $$`)

      await db.execute(sql`CREATE TABLE IF NOT EXISTS "purchase_orders" (
        "id" serial PRIMARY KEY, "company_id" integer NOT NULL REFERENCES "companies"("id"),
        "numero" integer NOT NULL, "estado" purchase_order_status DEFAULT 'solicitud',
        "rut_proveedor" varchar(15) NOT NULL, "razon_social_proveedor" text NOT NULL,
        "email_proveedor" text,
        "fecha" text NOT NULL, "fecha_entrega" text,
        "monto_neto" bigint DEFAULT 0, "monto_iva" bigint DEFAULT 0, "monto_total" bigint NOT NULL,
        "items_json" jsonb NOT NULL, "observaciones" text,
        "dte_document_id" integer,
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

      // ── Bank module enums & tables ────────────────────────────
      await db.execute(sql`DO $$ BEGIN CREATE TYPE bank_account_type AS ENUM('corriente','vista','ahorro','rut'); EXCEPTION WHEN duplicate_object THEN null; END $$`)
      await db.execute(sql`DO $$ BEGIN CREATE TYPE bank_sync_status AS ENUM('pendiente','sincronizado','error'); EXCEPTION WHEN duplicate_object THEN null; END $$`)
      await db.execute(sql`DO $$ BEGIN CREATE TYPE bank_reconcile_status AS ENUM('sin_conciliar','conciliado','descartado'); EXCEPTION WHEN duplicate_object THEN null; END $$`)

      await db.execute(sql`CREATE TABLE IF NOT EXISTS "bank_accounts" (
        "id" serial PRIMARY KEY, "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "nombre" text NOT NULL, "banco" varchar(50) NOT NULL,
        "tipo_cuenta" bank_account_type DEFAULT 'corriente',
        "numero_cuenta" varchar(30) NOT NULL, "moneda" varchar(5) DEFAULT 'CLP',
        "saldo" bigint DEFAULT 0, "saldo_fecha" text,
        "bank_user" varchar(100), "bank_password_enc" text,
        "scraping_enabled" boolean DEFAULT false,
        "last_sync" timestamptz, "sync_status" bank_sync_status DEFAULT 'pendiente',
        "sync_error" text, "activo" boolean DEFAULT true,
        "created_at" timestamptz DEFAULT now(), "updated_at" timestamptz DEFAULT now()
      )`)

      await db.execute(sql`CREATE TABLE IF NOT EXISTS "bank_transactions" (
        "id" serial PRIMARY KEY,
        "bank_account_id" integer NOT NULL REFERENCES "bank_accounts"("id") ON DELETE CASCADE,
        "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "fecha" text NOT NULL, "descripcion" text NOT NULL,
        "referencia" varchar(100), "monto" bigint NOT NULL,
        "tipo" varchar(10) NOT NULL, "saldo" bigint,
        "source" varchar(20) DEFAULT 'manual', "external_id" varchar(100),
        "reconcile_status" bank_reconcile_status DEFAULT 'sin_conciliar',
        "dte_document_id" integer, "reconcile_note" text,
        "reconciled_at" timestamptz,
        "created_at" timestamptz DEFAULT now()
      )`)

      // ── Gastos module ────────────────────────────────────────
      await db.execute(sql`DO $$ BEGIN CREATE TYPE gasto_tipo_documento AS ENUM('boleta','factura','nota_credito','nota_debito','guia_despacho','sin_documento'); EXCEPTION WHEN duplicate_object THEN null; END $$`)

      await db.execute(sql`CREATE TABLE IF NOT EXISTS "gastos" (
        "id" serial PRIMARY KEY,
        "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "tipo_documento" gasto_tipo_documento DEFAULT 'sin_documento',
        "numero_documento" varchar(20),
        "fecha_documento" text,
        "emisor_rut" varchar(12),
        "emisor_razon_social" varchar(200),
        "monto_neto" bigint DEFAULT 0,
        "monto_iva" bigint DEFAULT 0,
        "monto_total" bigint NOT NULL,
        "monto_exento" bigint DEFAULT 0,
        "categoria" varchar(50) NOT NULL,
        "descripcion" text,
        "foto_url" text,
        "datos_ocr" jsonb,
        "confianza_ocr" real,
        "verificado" boolean DEFAULT false,
        "created_by" integer,
        "created_at" timestamptz DEFAULT now(),
        "updated_at" timestamptz DEFAULT now()
      )`)

      await db.execute(sql`CREATE INDEX IF NOT EXISTS "gastos_company_idx" ON "gastos"("company_id")`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "gastos_categoria_idx" ON "gastos"("company_id","categoria")`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "gastos_fecha_idx" ON "gastos"("fecha_documento")`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "gastos_verificado_idx" ON "gastos"("company_id","verificado")`)

      // ── Push tokens table ────────────────────────────────────────
      await db.execute(sql`CREATE TABLE IF NOT EXISTS "push_tokens" (
        "id" serial PRIMARY KEY,
        "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "user_id" integer NOT NULL,
        "expo_push_token" varchar(255) NOT NULL,
        "device_id" varchar(255) NOT NULL,
        "platform" varchar(20) NOT NULL,
        "active" boolean DEFAULT true,
        "created_at" timestamptz DEFAULT now(),
        "updated_at" timestamptz DEFAULT now()
      )`)
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "push_tokens_company_user_device_idx" ON "push_tokens"("company_id","user_id","device_id")`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "push_tokens_company_active_idx" ON "push_tokens"("company_id","active")`)

      // Indexes for bank tables
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "bank_acc_company_idx" ON "bank_accounts"("company_id")`)
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "bank_acc_company_num_idx" ON "bank_accounts"("company_id","banco","numero_cuenta")`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "bank_tx_account_idx" ON "bank_transactions"("bank_account_id")`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "bank_tx_company_idx" ON "bank_transactions"("company_id")`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "bank_tx_fecha_idx" ON "bank_transactions"("fecha")`)
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "bank_tx_external_idx" ON "bank_transactions"("bank_account_id","external_id")`)

      logger.info('✅ Schema auto-migration complete')
    } catch (migErr) {
      logger.warn({ migErr }, 'Schema migration failed — non-critical')
    }
  }

  // ── API Routes ────────────────────────────────────────────
  await fastify.register(authRoutes,     { prefix: '/api/v1/auth' })
  await fastify.register(companyRoutes,  { prefix: '/api/v1/companies' })
  await fastify.register(dteRoutes,      { prefix: '/api/v1/dte' })
  await fastify.register(dteRecibidosRoutes, { prefix: '/api/v1/dte-recibidos' })
  await fastify.register(cafRoutes,      { prefix: '/api/v1/caf' })
  await fastify.register(siiRoutes,      { prefix: '/api/v1/sii' })
  await fastify.register(contactsRoutes, { prefix: '/api/v1/contacts' })
  await fastify.register(productsRoutes, { prefix: '/api/v1/products' })
  await fastify.register(reportesRoutes,      { prefix: '/api/v1/reportes' })
  await fastify.register(contabilidadRoutes,  { prefix: '/api/v1/contabilidad' })
  await fastify.register(remuneracionesRoutes, { prefix: '/api/v1/remuneraciones' })
  await fastify.register(indicatorsRoutes, { prefix: '/api/v1/indicators' })
  await fastify.register(certificationRoutes, { prefix: '/api/v1/certification' })
  await fastify.register(portalRoutes, { prefix: '/api/v1/portal' })
  await fastify.register(rcvRoutes, { prefix: '/api/v1/rcv' })
  await fastify.register(jobsRoutes, { prefix: '/api/v1/jobs' })
  await fastify.register(cotizacionesRoutes, { prefix: '/api/v1/cotizaciones' })
  await fastify.register(comprasRoutes, { prefix: '/api/v1/compras/pedidos' })
  await fastify.register(bankRoutes, { prefix: '/api/v1/bank' })
  await fastify.register(gastosRoutes, { prefix: '/api/v1/gastos' })
  await fastify.register(pushTokenRoutes, { prefix: '/api/v1/push-tokens' })
  await fastify.register(ocrRoutes, { prefix: '/api/v1/ocr' })
  await fastify.register(aiChatRoutes, { prefix: '/api/v1/ai/chat' })

  // ── USA Accounting (feature-flagged) ──────────────────────
  const { usaAccountingRoutes } = await import('./routes/usa-accounting.js')
  await fastify.register(usaAccountingRoutes, { prefix: '/api/v1/usa' })

  // ── Shared Accounting (works for CL + US, country from JWT) ──
  const { accountingRoutes } = await import('./routes/accounting.js')
  await fastify.register(accountingRoutes, { prefix: '/api/v1/accounting' })

  // ── Admin: Job queue status ───────────────────────────────
  fastify.get('/api/v1/admin/jobs', async (_, reply) => {
    const queues = [
      { name: 'dte-status-polling', queue: getDTEStatusQueue() },
      { name: 'previred-sync', queue: getPreviredQueue() },
      { name: 'rcv-sync', queue: getRCVSyncQueue() },
    ]

    const status = await Promise.all(
      queues.map(async ({ name, queue }) => {
        if (!queue) {
          return { name, status: 'not_initialized' }
        }
        try {
          const counts = await queue.getJobCounts(
            'active', 'completed', 'failed', 'delayed', 'waiting',
          )
          return { name, status: 'ok', counts }
        } catch (err) {
          return { name, status: 'error', error: String(err) }
        }
      }),
    )

    return reply.send({
      service: 'cuentax-bff',
      queues: status,
      timestamp: new Date().toISOString(),
    })
  })

  // ── Global error handler ──────────────────────────────────
  fastify.setErrorHandler((error, request, reply) => {
    // Circuit breaker open → 503 Service Unavailable (not a bug, just downstream down)
    if (error instanceof CircuitOpenError) {
      logger.warn({ circuit: error.message, url: request.url, reqId: request.id }, 'Request rejected by circuit breaker')
      return reply.status(503).send({
        error: 'service_unavailable',
        message: 'Servicio temporalmente no disponible. Intente nuevamente en unos segundos.',
      })
    }

    logger.error({ error, url: request.url, method: request.method, reqId: request.id }, 'Unhandled error')

    // Report to Sentry (no-op if SENTRY_DSN is not configured)
    captureException(error, {
      url: request.url,
      method: request.method,
      reqId: request.id,
    })

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

    // ── Background Jobs (BullMQ) ────────────────────────────────
    await startDTEStatusPoller()
    await startDTEMailboxPoller()
    await startPreviredScraper()
    await startRCVSync()

    // Bank import async worker (for large CSVs)
    const { startBankImportWorker } = await import('./jobs/bank-import.js')
    startBankImportWorker()
    logger.info('🔄 Bank import worker started')
  } catch (err) {
    logger.error(err, 'Error al iniciar BFF')
    process.exit(1)
  }
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info(`${signal} recibido — cerrando servidor...`)
  // Shut down BullMQ workers first (stop accepting new jobs)
  await Promise.all([
    stopDTEStatusPoller(),
    stopDTEMailboxPoller(),
    stopPreviredScraper(),
    stopRCVSync(),
  ])
  await fastify.close()
  await redis.quit()
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))

bootstrap()
