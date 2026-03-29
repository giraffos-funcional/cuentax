/**
 * CUENTAX — Certification Wizard Routes (BFF)
 * Proxy to SII Bridge certification endpoints.
 *
 * GET  /api/v1/certification/wizard       → Wizard overview
 * GET  /api/v1/certification/status       → Certification status
 * POST /api/v1/certification/complete-step → Mark manual step done
 * POST /api/v1/certification/upload-set   → Upload test set file
 * POST /api/v1/certification/process-set  → Process test set
 * POST /api/v1/certification/reset        → Reset wizard
 */

import type { FastifyInstance } from 'fastify'
import { authGuard } from '@/middlewares/auth-guard'
import { siiBridgeAdapter } from '@/adapters/sii-bridge.adapter'

export async function certificationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  // ── GET /wizard ────────────────────────────────────────────
  fastify.get('/wizard', async (request, reply) => {
    const user = (request as any).user
    const rut = user.company_rut
    if (!rut || rut === false || rut === 'false') {
      // Return default wizard state when no RUT configured
      return reply.send({ current_step: 1, steps: null, rut_emisor: null })
    }

    try {
      const data = await siiBridgeAdapter.certWizard(rut)
      return reply.send(data)
    } catch (err: any) {
      // Fallback gracefully
      return reply.send({ current_step: 1, steps: null, rut_emisor: rut })
    }
  })

  // ── GET /status ────────────────────────────────────────────
  fastify.get('/status', async (request, reply) => {
    const user = (request as any).user
    const rut = user.company_rut
    if (!rut || rut === false || rut === 'false') {
      return reply.send({ rut_emisor: null, current_step: 1, steps_completed: [] })
    }

    try {
      const data = await siiBridgeAdapter.certStatus(rut)
      return reply.send(data)
    } catch (err: any) {
      return reply.send({ rut_emisor: rut, current_step: 1, steps_completed: [] })
    }
  })

  // ── POST /complete-step ────────────────────────────────────
  fastify.post('/complete-step', async (request, reply) => {
    const user = (request as any).user
    const rut = user.company_rut
    const { step } = request.body as { step: number }

    const data = await siiBridgeAdapter.certCompleteStep(rut, step)
    return reply.send(data)
  })

  // ── POST /upload-set ───────────────────────────────────────
  fastify.post('/upload-set', async (request, reply) => {
    const user = (request as any).user
    const parts = (request as any).parts()

    let fileBuffer: Buffer | null = null
    let filename = 'set_pruebas.txt'
    const emisor: Record<string, string> = {
      rut_emisor: user.company_rut ?? '',
      razon_social: user.company_name ?? '',
      giro: '',
      direccion: '',
      comuna: '',
      ciudad: 'Santiago',
      actividad_economica: '620200',
    }

    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer()
        filename = part.filename
      } else if (part.fieldname in emisor) {
        emisor[part.fieldname] = part.value
      }
    }

    if (!fileBuffer) {
      return reply.status(400).send({ error: 'Archivo del set de pruebas requerido' })
    }

    try {
      const data = await siiBridgeAdapter.certUploadTestSet(fileBuffer, filename, emisor)
      return reply.send(data)
    } catch (err: any) {
      const msg = err.response?.data?.detail ?? 'Error cargando set de pruebas'
      return reply.status(422).send({ error: 'upload_error', message: msg })
    }
  })

  // ── POST /process-set ──────────────────────────────────────
  fastify.post('/process-set', async (request, reply) => {
    const user = (request as any).user
    const rut = user.company_rut
    const { fecha_emision } = (request.body as any) ?? {}

    try {
      const data = await siiBridgeAdapter.certProcessTestSet(rut, fecha_emision)
      return reply.send(data)
    } catch (err: any) {
      const msg = err.response?.data?.detail ?? 'Error procesando set de pruebas'
      return reply.status(500).send({ error: 'process_error', message: msg })
    }
  })

  // ── POST /reset ────────────────────────────────────────────
  fastify.post('/reset', async (request, reply) => {
    const user = (request as any).user
    const rut = user.company_rut

    const data = await siiBridgeAdapter.certReset(rut)
    return reply.send(data)
  })
}
