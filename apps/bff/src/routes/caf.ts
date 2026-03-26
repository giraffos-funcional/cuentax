/**
 * CUENTAX — CAF Routes (BFF)
 * POST /api/v1/caf/load      → Cargar CAF XML
 * GET  /api/v1/caf/status    → Estado folios empresa
 */

import type { FastifyInstance } from 'fastify'
import { authGuard } from '@/middlewares/auth-guard'
import { siiBridgeAdapter } from '@/adapters/sii-bridge.adapter'

export async function cafRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  // ── POST /load ─────────────────────────────────────────────
  fastify.post('/load', async (request, reply) => {
    const user = (request as any).user

    // Multipart file
    const data = await (request as any).file()
    if (!data) {
      return reply.status(400).send({ error: 'no_file', message: 'Archivo CAF XML requerido' })
    }

    const filename: string = data.filename
    if (!filename.toLowerCase().endsWith('.xml')) {
      return reply.status(400).send({ error: 'invalid_file', message: 'Solo se aceptan archivos .xml' })
    }

    const buffer = await data.toBuffer()
    const result = await siiBridgeAdapter.loadCAF(buffer, filename, user.company_rut)

    return reply.status(result.success ? 201 : 422).send(result)
  })

  // ── GET /status ────────────────────────────────────────────
  fastify.get('/status', async (request, reply) => {
    const user = (request as any).user
    const cafs = await siiBridgeAdapter.getCAFStatus(user.company_rut)
    return reply.send({ rut_empresa: user.company_rut, cafs })
  })
}
