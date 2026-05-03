/**
 * DTEs Recibidos — productive routes for incoming invoices.
 *
 * GET    /api/v1/dte-recibidos              — list received DTEs
 * POST   /api/v1/dte-recibidos/upload       — upload XML envelope received from a supplier
 * POST   /api/v1/dte-recibidos/:id/responder — generate RecepcionDTE+ResultadoDTE+EnvioRecibos and persist
 */

import type { FastifyInstance } from 'fastify'
import { eq, and, desc } from 'drizzle-orm'
import { z } from 'zod'
import { authGuard } from '@/middlewares/auth-guard'
import { db } from '@/db/client'
import { dtesRecibidos } from '@/db/schema'
import { siiBridgeAdapter } from '@/adapters/sii-bridge.adapter'
import { logger } from '@/core/logger'
import { getLocalCompanyId } from '@/core/company-resolver'

export async function dteRecibidosRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  // ── GET / — list received DTEs for active company
  fastify.get('/', async (req, reply) => {
    const user = (req as any).user
    const companyId = await getLocalCompanyId(user.company_id)
    const rows = await db.select().from(dtesRecibidos)
      .where(eq(dtesRecibidos.company_id, companyId))
      .orderBy(desc(dtesRecibidos.fecha_recibido))
      .limit(200)
    return reply.send({ items: rows })
  })

  // ── POST /upload — upload an EnvioDTE XML received from a supplier
  fastify.post('/upload', async (req, reply) => {
    const user = (req as any).user
    const companyId = await getLocalCompanyId(user.company_id)
    const rutReceptor = user.company_rut

    const file = await (req as any).file?.()
    if (!file) return reply.status(400).send({ error: 'file required (multipart)' })
    const buffer = await file.toBuffer()

    // Parse via bridge
    let parsed: any
    try {
      parsed = await siiBridgeAdapter.receptionParse(buffer, file.filename || 'envio.xml')
    } catch (err: any) {
      logger.error({ err }, 'reception parse failed')
      return reply.status(502).send({ error: 'parse_failed', message: err?.message })
    }

    if (!parsed?.success) {
      return reply.status(400).send({ error: 'invalid_envio_dte', detail: parsed })
    }

    const xmlB64 = buffer.toString('base64')
    const created: typeof dtesRecibidos.$inferSelect[] = []
    for (const d of (parsed.dtes ?? [])) {
      // Skip DTEs not addressed to us (rut_receptor mismatch)
      if ((d.rut_receptor || '').replace(/\./g, '') !== rutReceptor.replace(/\./g, '')) continue
      try {
        const [row] = await db.insert(dtesRecibidos).values({
          company_id: companyId,
          tipo_dte: d.tipo_dte,
          folio: d.folio,
          rut_emisor: d.rut_emisor,
          razon_social_emisor: d.razon_social_emisor ?? null,
          fecha_emision: d.fecha_emision ?? '',
          monto_total: d.monto_total ?? 0,
          envio_xml_b64: xmlB64,
          fuente: 'manual',
        }).onConflictDoNothing().returning()
        if (row) created.push(row)
      } catch (err) {
        logger.warn({ err, folio: d.folio }, 'insert dte_recibido failed (likely duplicate)')
      }
    }

    return reply.status(201).send({
      success: true,
      total_in_envelope: parsed.dtes?.length ?? 0,
      created_count: created.length,
      items: created,
    })
  })

  // ── POST /:id/responder — emit RecepcionDTE + ResultadoDTE + EnvioRecibos
  fastify.post('/:id/responder', async (req, reply) => {
    const user = (req as any).user
    const companyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    const parse = z.object({
      aceptar: z.boolean().default(true),
      glosa: z.string().optional().default(''),
    }).safeParse(req.body)
    if (!parse.success) return reply.status(400).send({ error: 'validation_error' })

    const [dte] = await db.select().from(dtesRecibidos)
      .where(and(eq(dtesRecibidos.id, Number(id)), eq(dtesRecibidos.company_id, companyId)))
      .limit(1)
    if (!dte) return reply.status(404).send({ error: 'not_found' })

    const dtePayload = [{
      tipo_dte: dte.tipo_dte,
      folio: dte.folio,
      rut_emisor: dte.rut_emisor,
      rut_receptor: user.company_rut,
      fecha_emision: dte.fecha_emision,
      monto_total: dte.monto_total,
    }]

    try {
      const recepcion = await siiBridgeAdapter.receptionRecepcion(
        user.company_rut, dte.rut_emisor, dtePayload,
      )
      const resultado = await siiBridgeAdapter.receptionResultado({
        rut_receptor: user.company_rut,
        rut_emisor: dte.rut_emisor,
        tipo_dte: dte.tipo_dte,
        folio: dte.folio,
        fecha_emision: dte.fecha_emision,
        monto_total: dte.monto_total,
        aceptado: parse.data.aceptar,
        glosa: parse.data.glosa,
      })
      const envioRecibos = await siiBridgeAdapter.receptionEnvioRecibos(
        user.company_rut, dte.rut_emisor, dtePayload,
      )

      const [updated] = await db.update(dtesRecibidos)
        .set({
          estado_respuesta: parse.data.aceptar ? 'aceptado' : 'rechazado',
          fecha_respuesta: new Date(),
          glosa_respuesta: parse.data.glosa,
          recepcion_xml_b64: recepcion?.xml ? Buffer.from(recepcion.xml).toString('base64') : null,
          resultado_xml_b64: resultado?.xml ? Buffer.from(resultado.xml).toString('base64') : null,
          envio_recibos_xml_b64: envioRecibos?.xml ? Buffer.from(envioRecibos.xml).toString('base64') : null,
          updated_at: new Date(),
        })
        .where(eq(dtesRecibidos.id, dte.id))
        .returning()

      return reply.send({ success: true, item: updated })
    } catch (err: any) {
      logger.error({ err, id }, 'responder failed')
      return reply.status(502).send({ error: 'responder_failed', message: err?.message })
    }
  })
}
