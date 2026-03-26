/**
 * CUENTAX — SII Config Routes (BFF)
 * POST /api/v1/sii/certificate/load → Cargar certificado digital
 * GET  /api/v1/sii/certificate/status
 * GET  /api/v1/sii/connectivity
 */

import type { FastifyInstance } from 'fastify'
import { authGuard } from '@/middlewares/auth-guard'
import { siiBridgeAdapter } from '@/adapters/sii-bridge.adapter'

export async function siiRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  // ── POST /certificate/load ─────────────────────────────────
  fastify.post('/certificate/load', async (request, reply) => {
    const user = (request as any).user
    const parts = (request as any).parts()

    let fileBuffer: Buffer | null = null
    let password = ''
    let filename = 'cert.pfx'

    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer()
        filename = part.filename
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
      const result = await siiBridgeAdapter.loadCertificate(fileBuffer, password, user.company_rut)
      return reply.status(result.success ? 200 : 422).send(result)
    } catch (err: any) {
      const msg = err.response?.data?.detail ?? 'Error cargando certificado'
      return reply.status(422).send({ error: 'cert_error', message: msg })
    }
  })

  // ── GET /certificate/status ────────────────────────────────
  fastify.get('/certificate/status', async (request, reply) => {
    const status = await siiBridgeAdapter.getCertificateStatus()
    return reply.send(status)
  })

  // ── GET /connectivity ──────────────────────────────────────
  fastify.get('/connectivity', async (request, reply) => {
    const result = await siiBridgeAdapter.checkSIIConnectivity()
    return reply.send(result)
  })

  // ── GET /health ────────────────────────────────────────────
  fastify.get('/bridge-health', async (request, reply) => {
    const alive = await siiBridgeAdapter.ping()
    return reply.status(alive ? 200 : 503).send({
      bridge: alive ? 'ok' : 'down',
    })
  })
}
