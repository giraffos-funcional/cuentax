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

  /** Extract company RUT as string, or null if not configured */
  const getRut = (request: any): string | null => {
    const rut = request.user?.company_rut
    if (!rut || rut === false || rut === 'false' || rut === 'False') return null
    return String(rut)
  }

  // ── POST /load ─────────────────────────────────────────────
  fastify.post('/load', async (request, reply) => {
    const rut = getRut(request)
    if (!rut) {
      return reply.status(400).send({ error: 'no_rut', message: 'Empresa sin RUT configurado. Configúralo en Mi Empresa.' })
    }

    // Multipart file
    const data = await (request as any).file()
    if (!data) {
      return reply.status(400).send({ error: 'no_file', message: 'Archivo CAF XML requerido' })
    }

    const filename: string = data.filename
    if (!filename.toLowerCase().endsWith('.xml')) {
      return reply.status(400).send({ error: 'invalid_file', message: 'Solo se aceptan archivos .xml' })
    }

    try {
      const buffer = await data.toBuffer()
      const result = await siiBridgeAdapter.loadCAF(buffer, filename, rut)
      return reply.status(result.success ? 201 : 422).send(result)
    } catch (err: any) {
      const detail = err.response?.data?.detail
      const msg = typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail.map((d: any) => d.msg ?? JSON.stringify(d)).join('; ') : 'Error cargando CAF')
      return reply.status(422).send({ error: 'caf_error', message: msg })
    }
  })

  // ── GET /status ────────────────────────────────────────────
  fastify.get('/status', async (request, reply) => {
    const rut = getRut(request)
    if (!rut) return reply.send({ rut_empresa: null, cafs: [] })

    try {
      const cafs = await siiBridgeAdapter.getCAFStatus(rut)
      return reply.send({ rut_empresa: rut, cafs })
    } catch {
      return reply.send({ rut_empresa: rut, cafs: [] })
    }
  })
}
