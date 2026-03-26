import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

// TODO Sprint 1: Implementar autenticación completa con Odoo + JWT
export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/login', {
    schema: {
      body: z.object({
        email: z.string().email(),
        password: z.string().min(1),
        company_rut: z.string().optional(),
      }),
    },
    handler: async (request, reply) => {
      return reply.status(501).send({
        error: 'not_implemented',
        message: 'Auth implementado en Sprint 1',
      })
    },
  })
}
