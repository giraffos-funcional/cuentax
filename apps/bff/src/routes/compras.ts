/**
 * CUENTAX — Compras (Pedidos de Compra) Routes (BFF)
 * ====================================================
 * CRUD completo para pedidos de compra / solicitudes.
 * Flujo: Solicitud -> Enviada -> Confirmada -> Recibida
 *
 * POST   /api/v1/compras/pedidos             -> Crear pedido (solicitud)
 * GET    /api/v1/compras/pedidos             -> Listar pedidos
 * GET    /api/v1/compras/pedidos/:id         -> Detalle de pedido
 * PUT    /api/v1/compras/pedidos/:id         -> Actualizar (solo solicitud)
 * POST   /api/v1/compras/pedidos/:id/enviar    -> solicitud -> enviada
 * POST   /api/v1/compras/pedidos/:id/confirmar -> enviada -> confirmada
 * POST   /api/v1/compras/pedidos/:id/recibir   -> confirmada -> recibida
 * POST   /api/v1/compras/pedidos/:id/cancelar  -> any -> cancelada
 * POST   /api/v1/compras/pedidos/:id/vincular-factura -> link to RCV DTE
 * DELETE /api/v1/compras/pedidos/:id         -> Eliminar (solo solicitud)
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, desc, sql, count } from 'drizzle-orm'
import { authGuard } from '@/middlewares/auth-guard'
import { db } from '@/db/client'
import { purchaseOrders } from '@/db/schema'
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

const createPedidoSchema = z.object({
  rut_proveedor: z.string().min(9),
  razon_social_proveedor: z.string().min(2),
  email_proveedor: z.string().email().optional().or(z.literal('')),
  items: z.array(itemSchema).min(1),
  fecha_entrega: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  observaciones: z.string().optional(),
})

const updatePedidoSchema = z.object({
  rut_proveedor: z.string().min(9).optional(),
  razon_social_proveedor: z.string().min(2).optional(),
  email_proveedor: z.string().email().optional().or(z.literal('')),
  items: z.array(itemSchema).min(1).optional(),
  fecha_entrega: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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

function calculateItems(items: ItemInput[]): { calculated: ItemCalculated[]; monto_neto: number; monto_iva: number; monto_total: number } {
  let monto_neto = 0
  let monto_iva = 0

  const calculated = items.map(item => {
    const neto = Math.round(item.cantidad * item.precio_unitario * (1 - item.descuento / 100))
    const iva = item.exento ? 0 : Math.round(neto * 0.19)
    const total = neto + iva

    monto_neto += neto
    monto_iva += iva

    return { ...item, neto, iva, total }
  })

  const monto_total = monto_neto + monto_iva

  return { calculated, monto_neto, monto_iva, monto_total }
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

// ── Routes ───────────────────────────────────────────────────

export async function comprasRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  // ── POST / — Crear pedido de compra ───────────────────────
  fastify.post('/', async (req, reply) => {
    const parse = createPedidoSchema.safeParse(req.body)
    if (!parse.success) {
      return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten().fieldErrors })
    }

    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const data = parse.data

    // Auto-generate numero
    const [maxResult] = await db
      .select({ max: sql<number>`COALESCE(MAX(${purchaseOrders.numero}), 0)` })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.company_id, localCompanyId))

    const numero = (maxResult?.max ?? 0) + 1

    // Calculate items
    const { calculated, monto_neto, monto_iva, monto_total } = calculateItems(data.items as ItemInput[])

    const [created] = await db.insert(purchaseOrders).values({
      company_id: localCompanyId,
      numero,
      estado: 'solicitud',
      rut_proveedor: data.rut_proveedor,
      razon_social_proveedor: data.razon_social_proveedor,
      email_proveedor: data.email_proveedor ?? null,
      fecha: todayISO(),
      fecha_entrega: data.fecha_entrega ?? null,
      monto_neto,
      monto_iva,
      monto_total,
      items_json: calculated,
      observaciones: data.observaciones ?? null,
    }).returning()

    logger.info({ pedidoId: created.id, numero, companyId: localCompanyId }, 'Pedido de compra creado')
    return reply.status(201).send(created)
  })

  // ── GET / — Listar pedidos de compra ──────────────────────
  fastify.get('/', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const query = req.query as { estado?: string; page?: string; limit?: string }

    const page = query.page ? Number(query.page) : 1
    const limit = query.limit ? Number(query.limit) : 20
    const offset = (page - 1) * limit

    const conditions = [eq(purchaseOrders.company_id, localCompanyId)]
    if (query.estado && query.estado !== 'todas') {
      conditions.push(eq(purchaseOrders.estado, query.estado as any))
    }

    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions)

    const [data, [totalResult]] = await Promise.all([
      db
        .select()
        .from(purchaseOrders)
        .where(whereClause)
        .orderBy(desc(purchaseOrders.created_at))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: count() })
        .from(purchaseOrders)
        .where(whereClause),
    ])

    return reply.send({ data, total: totalResult?.count ?? 0 })
  })

  // ── GET /:id — Detalle de pedido ──────────────────────────
  fastify.get('/:id', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    const [pedido] = await db
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, Number(id)), eq(purchaseOrders.company_id, localCompanyId)))

    if (!pedido) return reply.status(404).send({ error: 'not_found' })

    return reply.send(pedido)
  })

  // ── PUT /:id — Actualizar pedido (solo solicitud) ─────────
  fastify.put('/:id', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    const parse = updatePedidoSchema.safeParse(req.body)
    if (!parse.success) {
      return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten().fieldErrors })
    }

    // Check current state
    const [existing] = await db
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, Number(id)), eq(purchaseOrders.company_id, localCompanyId)))

    if (!existing) return reply.status(404).send({ error: 'not_found' })
    if (existing.estado !== 'solicitud') {
      return reply.status(422).send({ error: 'invalid_state', message: 'Solo se pueden editar pedidos en estado solicitud' })
    }

    const data = parse.data
    const updateValues: Record<string, unknown> = { updated_at: new Date() }

    if (data.rut_proveedor !== undefined) updateValues.rut_proveedor = data.rut_proveedor
    if (data.razon_social_proveedor !== undefined) updateValues.razon_social_proveedor = data.razon_social_proveedor
    if (data.email_proveedor !== undefined) updateValues.email_proveedor = data.email_proveedor
    if (data.fecha_entrega !== undefined) updateValues.fecha_entrega = data.fecha_entrega
    if (data.observaciones !== undefined) updateValues.observaciones = data.observaciones

    if (data.items) {
      const { calculated, monto_neto, monto_iva, monto_total } = calculateItems(data.items as ItemInput[])
      updateValues.items_json = calculated
      updateValues.monto_neto = monto_neto
      updateValues.monto_iva = monto_iva
      updateValues.monto_total = monto_total
    }

    const [updated] = await db
      .update(purchaseOrders)
      .set(updateValues)
      .where(and(eq(purchaseOrders.id, Number(id)), eq(purchaseOrders.company_id, localCompanyId)))
      .returning()

    return reply.send(updated)
  })

  // ── POST /:id/enviar — solicitud -> enviada ───────────────
  fastify.post('/:id/enviar', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    const [existing] = await db
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, Number(id)), eq(purchaseOrders.company_id, localCompanyId)))

    if (!existing) return reply.status(404).send({ error: 'not_found' })
    if (existing.estado !== 'solicitud') {
      return reply.status(422).send({ error: 'invalid_state', message: 'Solo se pueden enviar pedidos en estado solicitud' })
    }

    const [updated] = await db
      .update(purchaseOrders)
      .set({ estado: 'enviada', updated_at: new Date() })
      .where(eq(purchaseOrders.id, Number(id)))
      .returning()

    logger.info({ pedidoId: updated.id, numero: updated.numero }, 'Pedido de compra enviado')
    return reply.send({ success: true, message: 'Pedido enviado al proveedor', pedido: updated })
  })

  // ── POST /:id/confirmar — enviada -> confirmada ───────────
  fastify.post('/:id/confirmar', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    const [existing] = await db
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, Number(id)), eq(purchaseOrders.company_id, localCompanyId)))

    if (!existing) return reply.status(404).send({ error: 'not_found' })
    if (existing.estado !== 'enviada') {
      return reply.status(422).send({ error: 'invalid_state', message: 'Solo se pueden confirmar pedidos en estado enviada' })
    }

    const [updated] = await db
      .update(purchaseOrders)
      .set({ estado: 'confirmada', updated_at: new Date() })
      .where(eq(purchaseOrders.id, Number(id)))
      .returning()

    logger.info({ pedidoId: updated.id, numero: updated.numero }, 'Pedido de compra confirmado')
    return reply.send({ success: true, message: 'Pedido confirmado por proveedor', pedido: updated })
  })

  // ── POST /:id/recibir — confirmada -> recibida ────────────
  fastify.post('/:id/recibir', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    const [existing] = await db
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, Number(id)), eq(purchaseOrders.company_id, localCompanyId)))

    if (!existing) return reply.status(404).send({ error: 'not_found' })
    if (existing.estado !== 'confirmada') {
      return reply.status(422).send({ error: 'invalid_state', message: 'Solo se pueden recibir pedidos en estado confirmada' })
    }

    const [updated] = await db
      .update(purchaseOrders)
      .set({ estado: 'recibida', updated_at: new Date() })
      .where(eq(purchaseOrders.id, Number(id)))
      .returning()

    logger.info({ pedidoId: updated.id, numero: updated.numero }, 'Pedido de compra recibido')
    return reply.send({ success: true, message: 'Pedido marcado como recibido', pedido: updated })
  })

  // ── POST /:id/cancelar — any -> cancelada ─────────────────
  fastify.post('/:id/cancelar', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    const [existing] = await db
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, Number(id)), eq(purchaseOrders.company_id, localCompanyId)))

    if (!existing) return reply.status(404).send({ error: 'not_found' })
    if (existing.estado === 'cancelada') {
      return reply.status(422).send({ error: 'invalid_state', message: 'El pedido ya esta cancelado' })
    }

    const [updated] = await db
      .update(purchaseOrders)
      .set({ estado: 'cancelada', updated_at: new Date() })
      .where(eq(purchaseOrders.id, Number(id)))
      .returning()

    logger.info({ pedidoId: updated.id, numero: updated.numero }, 'Pedido de compra cancelado')
    return reply.send({ success: true, message: 'Pedido cancelado', pedido: updated })
  })

  // ── POST /:id/vincular-factura — Link to RCV DTE ─────────
  fastify.post('/:id/vincular-factura', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    const body = req.body as { dte_id?: number }
    if (!body.dte_id) {
      return reply.status(400).send({ error: 'validation_error', message: 'dte_id es requerido' })
    }

    const [existing] = await db
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, Number(id)), eq(purchaseOrders.company_id, localCompanyId)))

    if (!existing) return reply.status(404).send({ error: 'not_found' })
    if (existing.estado !== 'recibida') {
      return reply.status(422).send({ error: 'invalid_state', message: 'Solo se pueden vincular facturas a pedidos en estado recibida' })
    }

    const [updated] = await db
      .update(purchaseOrders)
      .set({ dte_document_id: body.dte_id, updated_at: new Date() })
      .where(eq(purchaseOrders.id, Number(id)))
      .returning()

    logger.info({ pedidoId: updated.id, dteId: body.dte_id }, 'Pedido vinculado a factura')
    return reply.send({ success: true, message: 'Factura vinculada exitosamente', pedido: updated })
  })

  // ── DELETE /:id — Eliminar pedido (solo solicitud) ────────
  fastify.delete('/:id', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { id } = req.params as { id: string }

    const [existing] = await db
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, Number(id)), eq(purchaseOrders.company_id, localCompanyId)))

    if (!existing) return reply.status(404).send({ error: 'not_found' })
    if (existing.estado !== 'solicitud') {
      return reply.status(422).send({ error: 'invalid_state', message: 'Solo se pueden eliminar pedidos en estado solicitud' })
    }

    await db.delete(purchaseOrders).where(eq(purchaseOrders.id, Number(id)))

    logger.info({ pedidoId: existing.id, numero: existing.numero }, 'Pedido de compra eliminado')
    return reply.status(204).send()
  })
}
