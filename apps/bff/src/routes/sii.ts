/**
 * CUENTAX — SII Config Routes (BFF)
 * POST /api/v1/sii/certificate/load      → Cargar certificado digital
 * GET  /api/v1/sii/certificate/status    → Estado del certificado (per-company)
 * POST /api/v1/sii/certificate/associate → Asociar cert existente a empresa actual
 * GET  /api/v1/sii/certificate/list      → Listar certificados y empresas asociadas
 * GET  /api/v1/sii/connectivity
 */

import type { FastifyInstance } from 'fastify'
import { authGuard } from '@/middlewares/auth-guard'
import { siiBridgeAdapter } from '@/adapters/sii-bridge.adapter'
import { CircuitOpenError } from '@/core/circuit-breaker'

export async function siiRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  /** Extract company RUT as string, or null if not configured */
  const getRut = (request: any): string | null => {
    const rut = request.user?.company_rut
    if (!rut || rut === false || rut === 'false' || rut === 'False') return null
    return String(rut)
  }

  /** Safely extract error message from bridge responses (handles Pydantic arrays) */
  const extractError = (err: any, fallback: string): string => {
    const detail = err.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) return detail.map((d: any) => d.msg ?? JSON.stringify(d)).join('; ')
    return fallback
  }

  // ── POST /certificate/load ─────────────────────────────────
  fastify.post('/certificate/load', async (request, reply) => {
    const rut = getRut(request)
    if (!rut) {
      return reply.status(400).send({ error: 'no_rut', message: 'Empresa sin RUT configurado. Configúralo en Mi Empresa.' })
    }

    const parts = (request as any).parts()

    let fileBuffer: Buffer | null = null
    let password = ''

    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer()
      } else if (part.fieldname === 'password') {
        password = part.value
      }
    }

    if (!fileBuffer) {
      return reply.status(400).send({ error: 'no_file', message: 'Archivo .pfx o .p12 requerido' })
    }
    if (!password) {
      return reply.status(400).send({ error: 'no_password', message: 'Contraseña del certificado requerida' })
    }

    try {
      const result = await siiBridgeAdapter.loadCertificate(fileBuffer, password, rut)
      return reply.status(result.success ? 200 : 422).send(result)
    } catch (err: any) {
      if (err instanceof CircuitOpenError) {
        return reply.status(503).send({ error: 'service_unavailable', message: 'SII Bridge no disponible, intente en unos momentos' })
      }
      const status = err.response?.status ?? 502
      return reply.status(status).send({ error: 'cert_error', message: extractError(err, 'Error cargando certificado') })
    }
  })

  // ── GET /certificate/status ────────────────────────────────
  fastify.get('/certificate/status', async (request, reply) => {
    const rut = getRut(request)
    if (!rut) return reply.send({ cargado: false })

    try {
      const status = await siiBridgeAdapter.getCertificateStatus(rut)
      return reply.send(status)
    } catch {
      return reply.send({ cargado: false })
    }
  })

  // ── POST /certificate/associate ──────────────────────────────
  fastify.post('/certificate/associate', async (request, reply) => {
    const rut = getRut(request)
    if (!rut) return reply.status(400).send({ error: 'no_rut', message: 'Empresa sin RUT configurado' })

    try {
      const result = await siiBridgeAdapter.associateCertificate(rut)
      return reply.status(result.success ? 200 : 422).send(result)
    } catch (err: any) {
      if (err instanceof CircuitOpenError) {
        return reply.status(503).send({ error: 'service_unavailable', message: 'SII Bridge no disponible, intente en unos momentos' })
      }
      return reply.status(422).send({ error: 'associate_error', message: extractError(err, 'Error asociando certificado') })
    }
  })

  // ── GET /certificate/list ────────────────────────────────────
  fastify.get('/certificate/list', async (request, reply) => {
    try {
      const result = await siiBridgeAdapter.listCertificates()
      return reply.send(result)
    } catch (err: any) {
      if (err instanceof CircuitOpenError) {
        return reply.status(503).send({ error: 'service_unavailable', message: 'SII Bridge no disponible, intente en unos momentos' })
      }
      return reply.status(500).send({ error: 'list_error', message: extractError(err, 'Error listando certificados') })
    }
  })

  // ── GET /connectivity ──────────────────────────────────────
  fastify.get('/connectivity', async (request, reply) => {
    try {
      const result = await siiBridgeAdapter.checkSIIConnectivity()
      return reply.send(result)
    } catch (err: any) {
      const isCircuitOpen = err instanceof CircuitOpenError
      return reply.status(503).send({
        conectado: false,
        ambiente: 'unknown',
        token_vigente: false,
        error: isCircuitOpen
          ? 'SII Bridge no disponible (circuit breaker abierto)'
          : extractError(err, 'Error verificando conectividad SII'),
      })
    }
  })

  // ── GET /health ────────────────────────────────────────────
  fastify.get('/bridge-health', async (request, reply) => {
    const bridgeUrl = config.SII_BRIDGE_URL
    const alive = await siiBridgeAdapter.ping()
    return reply.status(alive ? 200 : 503).send({
      bridge: alive ? 'ok' : 'down',
      bridgeUrl,
    })
  })
}
