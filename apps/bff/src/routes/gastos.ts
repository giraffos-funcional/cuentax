/**
 * CUENTAX — Gastos (Expenses) Routes (BFF)
 * ==========================================
 * CRUD completo para gastos + stats mensuales.
 *
 * GET    /api/v1/gastos          -> List with pagination + filters
 * GET    /api/v1/gastos/stats    -> Monthly summary
 * GET    /api/v1/gastos/:id      -> Single gasto
 * POST   /api/v1/gastos          -> Create
 * PUT    /api/v1/gastos/:id      -> Update
 * DELETE /api/v1/gastos/:id      -> Delete
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authGuard } from '@/middlewares/auth-guard'
import { gastosRepository } from '@/repositories/gastos.repository'
import { logger } from '@/core/logger'
import { getLocalCompanyId } from '@/core/company-resolver'

// ── Validation Schemas ──────────────────────────────────────────

const CATEGORIAS_VALIDAS = [
  'alimentacion', 'transporte', 'oficina', 'servicios', 'tecnologia',
  'marketing', 'sueldos', 'arriendo', 'impuestos', 'seguros',
  'mantencion', 'viajes', 'capacitacion', 'legal', 'salud', 'otros',
] as const

const createGastoSchema = z.object({
  tipo_documento: z.enum(['boleta', 'factura', 'nota_credito', 'nota_debito', 'guia_despacho', 'sin_documento']).default('sin_documento'),
  numero_documento: z.string().max(20).optional(),
  fecha_documento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)').optional(),
  emisor_rut: z.string().max(12).optional(),
  emisor_razon_social: z.string().max(200).optional(),
  monto_neto: z.number().int().min(0).default(0),
  monto_iva: z.number().int().min(0).default(0),
  monto_total: z.number().int().min(1, 'El monto total debe ser mayor a 0'),
  monto_exento: z.number().int().min(0).default(0),
  categoria: z.string().min(1, 'La categoría es requerida'),
  descripcion: z.string().optional(),
  foto_url: z.string().url().optional(),
  datos_ocr: z.record(z.unknown()).optional(),
  confianza_ocr: z.number().min(0).max(1).optional(),
  verificado: z.boolean().default(false),
})

const updateGastoSchema = z.object({
  tipo_documento: z.enum(['boleta', 'factura', 'nota_credito', 'nota_debito', 'guia_despacho', 'sin_documento']).optional(),
  numero_documento: z.string().max(20).optional(),
  fecha_documento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)').optional(),
  emisor_rut: z.string().max(12).optional(),
  emisor_razon_social: z.string().max(200).optional(),
  monto_neto: z.number().int().min(0).optional(),
  monto_iva: z.number().int().min(0).optional(),
  monto_total: z.number().int().min(1).optional(),
  monto_exento: z.number().int().min(0).optional(),
  categoria: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  foto_url: z.string().url().optional().or(z.literal('')),
  datos_ocr: z.record(z.unknown()).optional(),
  confianza_ocr: z.number().min(0).max(1).optional(),
  verificado: z.boolean().optional(),
})

// ── Routes ──────────────────────────────────────────────────────

export async function gastosRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  // ── GET / — List gastos with pagination + filters ─────────────
  fastify.get('/', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const q = req.query as {
      page?: string
      limit?: string
      search?: string
      categoria?: string
      verificado?: string
      mes?: string
      year?: string
    }

    const result = await gastosRepository.findMany(localCompanyId, {
      search:     q.search,
      categoria:  q.categoria,
      verificado: q.verificado !== undefined ? q.verificado === 'true' : undefined,
      mes:        q.mes ? Number(q.mes) : undefined,
      year:       q.year ? Number(q.year) : undefined,
      page:       q.page ? Number(q.page) : 1,
      limit:      q.limit ? Number(q.limit) : 20,
    })

    return reply.send(result)
  })

  // ── GET /stats — Monthly summary ──────────────────────────────
  // IMPORTANT: this route must be registered BEFORE /:id to avoid conflict
  fastify.get('/stats', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const q = req.query as { mes?: string; year?: string }

    const now = new Date()
    const mes = q.mes ? Number(q.mes) : now.getMonth() + 1
    const year = q.year ? Number(q.year) : now.getFullYear()

    if (mes < 1 || mes > 12) {
      return reply.status(400).send({ error: 'validation_error', message: 'mes debe ser entre 1 y 12' })
    }
    if (year < 2000 || year > 2100) {
      return reply.status(400).send({ error: 'validation_error', message: 'year inválido' })
    }

    const stats = await gastosRepository.getStats(localCompanyId, mes, year)
    return reply.send({ mes, year, ...stats })
  })

  // ── GET /:id — Single gasto ───────────────────────────────────
  fastify.get('/:id', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    const gasto = await gastosRepository.findById(Number(id), localCompanyId)
    if (!gasto) return reply.status(404).send({ error: 'not_found', message: 'Gasto no encontrado' })

    return reply.send(gasto)
  })

  // ── POST / — Create gasto ────────────────────────────────────
  fastify.post('/', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)

    const parse = createGastoSchema.safeParse(req.body)
    if (!parse.success) {
      return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten().fieldErrors })
    }

    const data = parse.data

    const gasto = await gastosRepository.create({
      company_id: localCompanyId,
      tipo_documento: data.tipo_documento,
      numero_documento: data.numero_documento ?? null,
      fecha_documento: data.fecha_documento ?? new Date().toISOString().split('T')[0],
      emisor_rut: data.emisor_rut ?? null,
      emisor_razon_social: data.emisor_razon_social ?? null,
      monto_neto: data.monto_neto,
      monto_iva: data.monto_iva,
      monto_total: data.monto_total,
      monto_exento: data.monto_exento,
      categoria: data.categoria,
      descripcion: data.descripcion ?? null,
      foto_url: data.foto_url ?? null,
      datos_ocr: data.datos_ocr ?? null,
      confianza_ocr: data.confianza_ocr ?? null,
      verificado: data.verificado,
      created_by: user.uid,
    })

    logger.info({ gastoId: gasto.id, companyId: localCompanyId, monto: data.monto_total }, 'Gasto creado')
    return reply.status(201).send(gasto)
  })

  // ── PUT /:id — Update gasto ──────────────────────────────────
  fastify.put('/:id', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    const parse = updateGastoSchema.safeParse(req.body)
    if (!parse.success) {
      return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten().fieldErrors })
    }

    const existing = await gastosRepository.findById(Number(id), localCompanyId)
    if (!existing) return reply.status(404).send({ error: 'not_found', message: 'Gasto no encontrado' })

    const updated = await gastosRepository.update(Number(id), localCompanyId, parse.data)
    if (!updated) return reply.status(404).send({ error: 'not_found', message: 'Gasto no encontrado' })

    logger.info({ gastoId: updated.id, companyId: localCompanyId }, 'Gasto actualizado')
    return reply.send(updated)
  })

  // ── DELETE /:id — Delete gasto ───────────────────────────────
  fastify.delete('/:id', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    const deleted = await gastosRepository.delete(Number(id), localCompanyId)
    if (!deleted) return reply.status(404).send({ error: 'not_found', message: 'Gasto no encontrado' })

    logger.info({ gastoId: Number(id), companyId: localCompanyId }, 'Gasto eliminado')
    return reply.status(204).send()
  })
}
