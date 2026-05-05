/**
 * F29 calculator endpoint — period summary del Formulario 29 (SII Chile).
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { calculateF29 } from '@/services/f29.service'

export async function f29Routes(fastify: FastifyInstance) {
  fastify.get('/calculate', async (request, reply) => {
    if (!request.companyId) return reply.code(400).send({ error: 'company_required' })
    const q = z.object({
      period: z.string().regex(/^\d{4}-\d{2}$/),
    }).safeParse(request.query)
    if (!q.success) return reply.code(400).send({ error: 'validation_error', details: q.error.flatten().fieldErrors })

    try {
      const result = await calculateF29({
        companyId: request.companyId,
        period:    q.data.period,
      })
      return reply.send(result)
    } catch (err) {
      return reply.code(500).send({ error: 'calculation_failed', message: (err as Error).message })
    }
  })
}
