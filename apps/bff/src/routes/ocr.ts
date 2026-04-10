/**
 * CUENTAX — OCR Routes (BFF)
 * ===========================
 * Image processing endpoint for expense document OCR.
 *
 * POST /api/v1/ocr/process — Upload image, extract tax document data via Claude Vision
 */

import type { FastifyInstance } from 'fastify'
import { authGuard } from '@/middlewares/auth-guard'
import { ocrService } from '@/services/ocr.service'
import { logger } from '@/core/logger'

export async function ocrRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  // ── POST /process — Process image with OCR ────────────────────
  fastify.post('/process', async (req, reply) => {
    const user = (req as any).user

    // Consume multipart file upload (configured in server.ts: 5MB max, 1 file)
    const file = await req.file()

    if (!file) {
      return reply.status(400).send({
        error: 'validation_error',
        message: 'Se requiere una imagen. Envíe un archivo en el campo "image".',
      })
    }

    const supportedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!supportedMimes.includes(file.mimetype)) {
      return reply.status(400).send({
        error: 'validation_error',
        message: `Tipo de archivo no soportado: ${file.mimetype}. Soportados: ${supportedMimes.join(', ')}`,
      })
    }

    try {
      // Read buffer from multipart stream
      const buffer = await file.toBuffer()

      // Size check (redundant with multipart config, but explicit)
      const MAX_SIZE = 5 * 1024 * 1024 // 5MB
      if (buffer.length > MAX_SIZE) {
        return reply.status(413).send({
          error: 'file_too_large',
          message: 'La imagen excede el tamaño máximo de 5MB.',
        })
      }

      logger.info(
        { userId: user.uid, companyId: user.company_id, mimeType: file.mimetype, sizeBytes: buffer.length },
        'Processing OCR request',
      )

      const result = await ocrService.processImage(buffer, file.mimetype)

      return reply.send({
        success: true,
        data: result,
        meta: {
          filename: file.filename,
          mimetype: file.mimetype,
          size_bytes: buffer.length,
          processed_at: new Date().toISOString(),
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error processing image'

      // Distinguish between API key issues and other errors
      if (message.includes('ANTHROPIC_API_KEY')) {
        logger.error('OCR service not configured — ANTHROPIC_API_KEY missing')
        return reply.status(503).send({
          error: 'service_unavailable',
          message: 'Servicio OCR no configurado. Contacte al administrador.',
        })
      }

      logger.error({ error, userId: user.uid }, 'OCR processing failed')
      return reply.status(422).send({
        error: 'ocr_processing_failed',
        message: 'No se pudo procesar la imagen. Intente con una imagen más clara.',
      })
    }
  })
}
