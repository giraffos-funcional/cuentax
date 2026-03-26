import type { FastifyInstance } from 'fastify'

// TODO Sprint 2: Implementar emisión DTE
export async function dteRoutes(fastify: FastifyInstance) {
  fastify.post('/emitir', async (request, reply) => {
    return reply.status(501).send({
      error: 'not_implemented',
      message: 'Emisión DTE implementada en Sprint 2',
    })
  })
}
