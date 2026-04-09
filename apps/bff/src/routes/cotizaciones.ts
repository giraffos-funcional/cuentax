/**
 * CUENTAX — Cotizaciones Routes (BFF)
 * ====================================
 * CRUD completo para presupuestos/cotizaciones.
 * Flujo: Crear → Enviar → Aceptar → Convertir a Factura (DTE 33).
 *
 * POST   /api/v1/cotizaciones           → Crear cotización
 * GET    /api/v1/cotizaciones           → Listar cotizaciones
 * GET    /api/v1/cotizaciones/:id       → Detalle de cotización
 * PUT    /api/v1/cotizaciones/:id       → Actualizar (solo borrador)
 * POST   /api/v1/cotizaciones/:id/enviar   → Enviar cotización
 * POST   /api/v1/cotizaciones/:id/aceptar  → Aceptar cotización
 * POST   /api/v1/cotizaciones/:id/rechazar → Rechazar cotización
 * POST   /api/v1/cotizaciones/:id/facturar → Convertir a DTE 33
 * DELETE /api/v1/cotizaciones/:id       → Eliminar (solo borrador)
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, desc, sql, count } from 'drizzle-orm'
import { authGuard } from '@/middlewares/auth-guard'
import { db } from '@/db/client'
import { quotations, dteDocuments } from '@/db/schema'
import { logger } from '@/core/logger'
import { getLocalCompanyId } from '@/core/company-resolver'

// ── Validation Schemas ───────────────────────────────────────

const itemSchema = z.object({
  nombre: z.string().min(1),
  cantidad: z.number().positive(),
  precio_unitario: z.number().min(0),
  descuento: z.number().min(0).max(100).default(0),
  exento: z.boolean().default(false),
})

const createCotizacionSchema = z.object({
  rut_receptor: z.string().min(9),
  razon_social_receptor: z.string().min(2),
  giro_receptor: z.string().optional(),
  email_receptor: z.string().email().optional().or(z.literal('')),
  items: z.array(itemSchema).min(1),
  valida_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  observaciones: z.string().optional(),
})

const updateCotizacionSchema = z.object({
  rut_receptor: z.string().min(9).optional(),
  razon_social_receptor: z.string().min(2).optional(),
  giro_receptor: z.string().optional(),
  email_receptor: z.string().email().optional().or(z.literal('')),
  items: z.array(itemSchema).min(1).optional(),
  valida_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  observaciones: z.string().optional(),
})

// ── Helpers ──────────────────────────────────────────────────

interface ItemInput {
  nombre: string
  cantidad: number
  precio_unitario: number
  descuento: number
  exento: boolean
}

interface ItemCalculated extends ItemInput {
  neto: number
  iva: number
  total: number
}

function calculateItems(items: ItemInput[]): { calculated: ItemCalculated[]; monto_neto: number; monto_exento: number; monto_iva: number; monto_total: number } {
  let monto_neto = 0
  let monto_exento = 0
  let monto_iva = 0

  const calculated = items.map(item => {
    const neto = Math.round(item.cantidad * item.precio_unitario * (1 - item.descuento / 100))
    const iva = item.exento ? 0 : Math.round(neto * 0.19)
    const total = neto + iva

    if (item.exento) {
      monto_exento += neto
    } else {
      monto_neto += neto
      monto_iva += iva
    }

    return { ...item, neto, iva, total }
  })

  const monto_total = monto_neto + monto_exento + monto_iva

  return { calculated, monto_neto, monto_exento, monto_iva, monto_total }
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

// ── Routes ───────────────────────────────────────────────────

export async function cotizacionesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  // ── POST / — Crear cotización ─────────────────────────────
  fastify.post('/', async (req, reply) => {
    const parse = createCotizacionSchema.safeParse(req.body)
    if (!parse.success) {
      return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten().fieldErrors })
    }

    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const data = parse.data

    // Auto-generate numero
    const [maxResult] = await db
      .select({ max: sql<number>`COALESCE(MAX(${quotations.numero}), 0)` })
      .from(quotations)
      .where(eq(quotations.company_id, localCompanyId))

    const numero = (maxResult?.max ?? 0) + 1

    // Calculate items
    const { calculated, monto_total } = calculateItems(data.items as ItemInput[])

    const [created] = await db.insert(quotations).values({
      company_id: localCompanyId,
      numero,
      estado: 'borrador',
      rut_receptor: data.rut_receptor,
      razon_social_receptor: data.razon_social_receptor,
      giro_receptor: data.giro_receptor ?? null,
      email_receptor: data.email_receptor ?? null,
      fecha: todayISO(),
      valida_hasta: data.valida_hasta,
      monto_total,
      items_json: calculated,
      observaciones: data.observaciones ?? null,
    }).returning()

    logger.info({ cotizacionId: created.id, numero, companyId: localCompanyId }, 'Cotización creada')
    return reply.status(201).send(created)
  })

  // ── GET / — Listar cotizaciones ───────────────────────────
  fastify.get('/', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const query = req.query as { estado?: string; page?: string; limit?: string }

    const page = query.page ? Number(query.page) : 1
    const limit = query.limit ? Number(query.limit) : 20
    const offset = (page - 1) * limit

    const conditions = [eq(quotations.company_id, localCompanyId)]
    if (query.estado && query.estado !== 'todas') {
      conditions.push(eq(quotations.estado, query.estado as any))
    }

    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions)

    const [data, [totalResult]] = await Promise.all([
      db
        .select()
        .from(quotations)
        .where(whereClause)
        .orderBy(desc(quotations.created_at))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: count() })
        .from(quotations)
        .where(whereClause),
    ])

    return reply.send({ data, total: totalResult?.count ?? 0 })
  })

  // ── GET /:id — Detalle de cotización ──────────────────────
  fastify.get('/:id', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    const [cotizacion] = await db
      .select()
      .from(quotations)
      .where(and(eq(quotations.id, Number(id)), eq(quotations.company_id, localCompanyId)))

    if (!cotizacion) return reply.status(404).send({ error: 'not_found' })

    // Include linked DTE if exists
    let dte = null
    if (cotizacion.dte_id) {
      const [dteResult] = await db
        .select()
        .from(dteDocuments)
        .where(eq(dteDocuments.id, cotizacion.dte_id))
      dte = dteResult ?? null
    }

    return reply.send({ ...cotizacion, dte })
  })

  // ── PUT /:id — Actualizar cotización (solo borrador) ──────
  fastify.put('/:id', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    const parse = updateCotizacionSchema.safeParse(req.body)
    if (!parse.success) {
      return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten().fieldErrors })
    }

    // Check current state
    const [existing] = await db
      .select()
      .from(quotations)
      .where(and(eq(quotations.id, Number(id)), eq(quotations.company_id, localCompanyId)))

    if (!existing) return reply.status(404).send({ error: 'not_found' })
    if (existing.estado !== 'borrador') {
      return reply.status(422).send({ error: 'invalid_state', message: 'Solo se pueden editar cotizaciones en estado borrador' })
    }

    const data = parse.data
    const updateValues: Record<string, unknown> = { updated_at: new Date() }

    if (data.rut_receptor !== undefined) updateValues.rut_receptor = data.rut_receptor
    if (data.razon_social_receptor !== undefined) updateValues.razon_social_receptor = data.razon_social_receptor
    if (data.giro_receptor !== undefined) updateValues.giro_receptor = data.giro_receptor
    if (data.email_receptor !== undefined) updateValues.email_receptor = data.email_receptor
    if (data.valida_hasta !== undefined) updateValues.valida_hasta = data.valida_hasta
    if (data.observaciones !== undefined) updateValues.observaciones = data.observaciones

    if (data.items) {
      const { calculated, monto_total } = calculateItems(data.items as ItemInput[])
      updateValues.items_json = calculated
      updateValues.monto_total = monto_total
    }

    const [updated] = await db
      .update(quotations)
      .set(updateValues)
      .where(and(eq(quotations.id, Number(id)), eq(quotations.company_id, localCompanyId)))
      .returning()

    return reply.send(updated)
  })

  // ── POST /:id/enviar — Enviar cotización ──────────────────
  fastify.post('/:id/enviar', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    const [existing] = await db
      .select()
      .from(quotations)
      .where(and(eq(quotations.id, Number(id)), eq(quotations.company_id, localCompanyId)))

    if (!existing) return reply.status(404).send({ error: 'not_found' })
    if (existing.estado !== 'borrador') {
      return reply.status(422).send({ error: 'invalid_state', message: 'Solo se pueden enviar cotizaciones en estado borrador' })
    }

    const [updated] = await db
      .update(quotations)
      .set({ estado: 'enviada', updated_at: new Date() })
      .where(eq(quotations.id, Number(id)))
      .returning()

    logger.info({ cotizacionId: updated.id, numero: updated.numero }, 'Cotización enviada')
    return reply.send({ success: true, message: 'Cotización enviada exitosamente', cotizacion: updated })
  })

  // ── POST /:id/aceptar — Aceptar cotización ────────────────
  fastify.post('/:id/aceptar', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    const [existing] = await db
      .select()
      .from(quotations)
      .where(and(eq(quotations.id, Number(id)), eq(quotations.company_id, localCompanyId)))

    if (!existing) return reply.status(404).send({ error: 'not_found' })
    if (existing.estado !== 'enviada') {
      return reply.status(422).send({ error: 'invalid_state', message: 'Solo se pueden aceptar cotizaciones en estado enviada' })
    }

    const [updated] = await db
      .update(quotations)
      .set({ estado: 'aceptada', updated_at: new Date() })
      .where(eq(quotations.id, Number(id)))
      .returning()

    logger.info({ cotizacionId: updated.id, numero: updated.numero }, 'Cotización aceptada')
    return reply.send({ success: true, message: 'Cotización aceptada', cotizacion: updated })
  })

  // ── POST /:id/rechazar — Rechazar cotización ───────────────
  fastify.post('/:id/rechazar', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    const [existing] = await db
      .select()
      .from(quotations)
      .where(and(eq(quotations.id, Number(id)), eq(quotations.company_id, localCompanyId)))

    if (!existing) return reply.status(404).send({ error: 'not_found' })
    if (existing.estado !== 'enviada') {
      return reply.status(422).send({ error: 'invalid_state', message: 'Solo se pueden rechazar cotizaciones en estado enviada' })
    }

    const [updated] = await db
      .update(quotations)
      .set({ estado: 'rechazada', updated_at: new Date() })
      .where(eq(quotations.id, Number(id)))
      .returning()

    logger.info({ cotizacionId: updated.id, numero: updated.numero }, 'Cotización rechazada')
    return reply.send({ success: true, message: 'Cotización rechazada', cotizacion: updated })
  })

  // ── POST /:id/facturar — Convertir a DTE 33 (Factura) ────
  fastify.post('/:id/facturar', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    const [existing] = await db
      .select()
      .from(quotations)
      .where(and(eq(quotations.id, Number(id)), eq(quotations.company_id, localCompanyId)))

    if (!existing) return reply.status(404).send({ error: 'not_found' })
    if (existing.estado !== 'aceptada') {
      return reply.status(422).send({ error: 'invalid_state', message: 'Solo se pueden facturar cotizaciones en estado aceptada' })
    }

    // Calculate totals from items
    const items = (existing.items_json as ItemCalculated[]) ?? []
    const { monto_neto, monto_exento, monto_iva, monto_total } = calculateItems(
      items.map(i => ({
        nombre: i.nombre,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        descuento: i.descuento ?? 0,
        exento: i.exento ?? false,
      }))
    )

    // Create DTE document
    const [dte] = await db.insert(dteDocuments).values({
      company_id: localCompanyId,
      tipo_dte: 33,
      estado: 'borrador',
      rut_receptor: existing.rut_receptor,
      razon_social_receptor: existing.razon_social_receptor,
      giro_receptor: existing.giro_receptor,
      email_receptor: existing.email_receptor,
      monto_neto,
      monto_exento,
      monto_iva,
      monto_total,
      fecha_emision: todayISO(),
      items_json: existing.items_json,
      cotizacion_id: existing.id,
      observaciones: `Generado desde presupuesto #${existing.numero}`,
    }).returning()

    // Update quotation
    const [updated] = await db
      .update(quotations)
      .set({ estado: 'convertida', dte_id: dte.id, updated_at: new Date() })
      .where(eq(quotations.id, Number(id)))
      .returning()

    logger.info({ cotizacionId: updated.id, dteId: dte.id, numero: updated.numero }, 'Cotización convertida a DTE 33')
    return reply.send({ success: true, message: 'Factura creada exitosamente', dte, cotizacion: updated })
  })

  // ── DELETE /:id — Eliminar cotización (solo borrador) ─────
  fastify.delete('/:id', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    const [existing] = await db
      .select()
      .from(quotations)
      .where(and(eq(quotations.id, Number(id)), eq(quotations.company_id, localCompanyId)))

    if (!existing) return reply.status(404).send({ error: 'not_found' })
    if (existing.estado !== 'borrador') {
      return reply.status(422).send({ error: 'invalid_state', message: 'Solo se pueden eliminar cotizaciones en estado borrador' })
    }

    await db.delete(quotations).where(eq(quotations.id, Number(id)))

    logger.info({ cotizacionId: existing.id, numero: existing.numero }, 'Cotización eliminada')
    return reply.status(204).send()
  })
}
