/**
 * CUENTAX — DTE Routes (BFF)
 * ===========================
 * Rutas protegidas por authGuard.
 * Reciben datos del frontend y delegan al DTE Service.
 *
 * POST /api/v1/dte/emitir       → Emitir un DTE
 * GET  /api/v1/dte              → Listar DTEs de la empresa
 * GET  /api/v1/dte/:id/status   → Consultar estado en SII por track_id
 * POST /api/v1/dte/anular       → Anular un DTE (genera NC)
 * GET  /api/v1/dte/:id/pdf      → Descargar PDF del DTE
 */

import type { FastifyInstance } from 'fastify'
import { authGuard } from '@/middlewares/auth-guard'
import { dteService, emitirDTESchema } from '@/services/dte.service'
import { siiBridgeAdapter } from '@/adapters/sii-bridge.adapter'
import { z } from 'zod'

export async function dteRoutes(fastify: FastifyInstance) {
  // Todas las rutas requieren auth
  fastify.addHook('preHandler', authGuard)

  // ── POST /emitir ───────────────────────────────────────────
  fastify.post('/emitir', async (request, reply) => {
    const parse = emitirDTESchema.safeParse(request.body)
    if (!parse.success) {
      return reply.status(400).send({
        error: 'validation_error',
        details: parse.error.flatten().fieldErrors,
      })
    }

    const user = (request as any).user
    const companyContext = {
      company_id:   user.company_id,
      company_rut:  user.company_rut,
      company_name: user.company_name,
    }

    const result = await dteService.emitir(parse.data, companyContext)

    const statusCode = result.success ? 201 : 422
    return reply.status(statusCode).send(result)
  })

  // ── GET / — Listar DTEs ────────────────────────────────────
  fastify.get('/', async (request, reply) => {
    const user = (request as any).user
    const query = request.query as {
      status?: string
      tipo_dte?: string
      desde?: string
      hasta?: string
      page?: string
      limit?: string
    }

    const result = await dteService.listar(user.company_id, {
      status:  query.status,
      tipo_dte: query.tipo_dte ? Number(query.tipo_dte) : undefined,
      desde:   query.desde,
      hasta:   query.hasta,
      page:    query.page   ? Number(query.page)  : 1,
      limit:   query.limit  ? Number(query.limit) : 25,
    })

    return reply.send(result)
  })

  // ── GET /:trackId/status ───────────────────────────────────
  fastify.get('/:trackId/status', async (request, reply) => {
    const { trackId } = request.params as { trackId: string }
    const user = (request as any).user

    try {
      const status = await dteService.consultarEstado(trackId, user.company_rut)
      return reply.send(status)
    } catch {
      return reply.status(502).send({ error: 'sii_bridge_error', message: 'Error consultando estado al SII' })
    }
  })

  // ── GET /:trackId/pdf ──────────────────────────────────────
  fastify.get('/:trackId/pdf', async (request, reply) => {
    const { trackId } = request.params as { trackId: string }
    // TODO: obtener xml_firmado_b64 de la DB por track_id
    // const dte = await dteRepository.findByTrackId(...)
    // const pdfBuffer = await siiBridgeAdapter.generatePDF(dte.xml_firmado_b64, dte.tipo_dte)
    return reply.status(501).send({ error: 'not_implemented', message: 'PDF disponible próximamente' })
  })

  // ── POST /anular ───────────────────────────────────────────
  fastify.post('/anular', async (request, reply) => {
    const anulacionSchema = z.object({
      tipo_original: z.number().int(),
      folio_original: z.number().int().positive(),
      fecha_original: z.string(),
      rut_receptor: z.string(),
      razon_social_receptor: z.string(),
      giro_receptor: z.string(),
      motivo: z.string().min(3),
      items: z.array(z.object({
        nombre: z.string(),
        cantidad: z.number(),
        precio_unitario: z.number(),
      })).min(1),
    })

    const parse = anulacionSchema.safeParse(request.body)
    if (!parse.success) {
      return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten() })
    }

    const user = (request as any).user
    try {
      const result = await siiBridgeAdapter.anularDTE({
        ...parse.data,
        rut_emisor: user.company_rut,
        razon_social_emisor: user.company_name,
        giro_emisor: 'Servicios', // TODO: leer de Odoo
      })
      return reply.send(result)
    } catch {
      return reply.status(502).send({ error: 'sii_bridge_error', message: 'Error anulando DTE' })
    }
  })
}
