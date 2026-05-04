/**
 * /api/v1/tenant-fees — CRUD para que el contador declare honorarios
 * mensuales por PYME y vea proyección del revenue-share del período.
 *
 * Refs: docs/multitenancy/phase-03-revenue-share.md T3.2
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { tenantFees } from '@/db/schema'
import { calculateRevenueShare } from '@/services/revenue-share/calculator'
import { logger } from '@/core/logger'

const upsertSchema = z.object({
  company_id:   z.number().int().positive(),
  fee_type:     z.enum(['contabilidad', 'remuneraciones']),
  monthly_clp:  z.number().int().min(0).max(100_000_000),
  billing_day:  z.number().int().min(1).max(28).default(1),
  valid_from:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  valid_to:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes:        z.string().optional(),
})

const periodSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
})

export async function tenantFeesRoutes(fastify: FastifyInstance) {
  // List fees for the active tenant (optionally filter by company)
  fastify.get('/', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    const q = z.object({
      company_id: z.coerce.number().int().positive().optional(),
      active:     z.enum(['true', 'false']).optional(),
    }).safeParse(request.query)
    if (!q.success) return reply.code(400).send({ error: 'validation_error', details: q.error.flatten().fieldErrors })

    const conds = [eq(tenantFees.tenant_id, request.tenantId)]
    if (q.data.company_id !== undefined) conds.push(eq(tenantFees.company_id, q.data.company_id))
    if (q.data.active !== undefined)     conds.push(eq(tenantFees.active, q.data.active === 'true'))

    const rows = await db.select().from(tenantFees).where(and(...conds))
    return reply.send({ data: rows })
  })

  // Create a fee
  fastify.post('/', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    const parsed = upsertSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error', details: parsed.error.flatten().fieldErrors })
    const body = parsed.data

    try {
      const [row] = await db
        .insert(tenantFees)
        .values({
          tenant_id:   request.tenantId,
          company_id:  body.company_id,
          fee_type:    body.fee_type,
          monthly_clp: body.monthly_clp,
          billing_day: body.billing_day,
          valid_from:  body.valid_from,
          valid_to:    body.valid_to ?? null,
          notes:       body.notes ?? null,
        })
        .returning()
      logger.info({ tenantId: request.tenantId, feeId: row?.id }, 'tenant_fee.created')
      return reply.code(201).send(row)
    } catch (err) {
      // Likely unique violation (tenant, company, fee_type, valid_from)
      return reply.code(409).send({ error: 'fee_conflict', message: (err as Error).message })
    }
  })

  // Update / soft-deactivate
  fastify.patch('/:id', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    const id = Number((request.params as { id: string }).id)
    const body = z.object({
      monthly_clp: z.number().int().min(0).max(100_000_000).optional(),
      billing_day: z.number().int().min(1).max(28).optional(),
      active:      z.boolean().optional(),
      valid_to:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      notes:       z.string().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'validation_error', details: body.error.flatten().fieldErrors })

    const updates: Record<string, unknown> = { updated_at: new Date() }
    if (body.data.monthly_clp !== undefined) updates.monthly_clp = body.data.monthly_clp
    if (body.data.billing_day !== undefined) updates.billing_day = body.data.billing_day
    if (body.data.active      !== undefined) updates.active      = body.data.active
    if (body.data.valid_to    !== undefined) updates.valid_to    = body.data.valid_to
    if (body.data.notes       !== undefined) updates.notes       = body.data.notes

    const [row] = await db
      .update(tenantFees)
      .set(updates)
      .where(and(eq(tenantFees.id, id), eq(tenantFees.tenant_id, request.tenantId)))
      .returning()
    if (!row) return reply.code(404).send({ error: 'not_found' })
    return reply.send(row)
  })

  fastify.delete('/:id', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    const id = Number((request.params as { id: string }).id)
    const today = new Date().toISOString().slice(0, 10)
    const [row] = await db
      .update(tenantFees)
      .set({ active: false, valid_to: today, updated_at: new Date() })
      .where(and(eq(tenantFees.id, id), eq(tenantFees.tenant_id, request.tenantId)))
      .returning()
    if (!row) return reply.code(404).send({ error: 'not_found' })
    return reply.send(row)
  })

  // Projection for a future period (read-only — does not persist a run)
  fastify.get('/projection', async (request, reply) => {
    if (!request.tenantId) return reply.code(400).send({ error: 'tenant_required' })
    const parsed = periodSchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error', details: parsed.error.flatten().fieldErrors })

    const result = await calculateRevenueShare(request.tenantId, parsed.data.period)
    return reply.send(result)
  })
}
