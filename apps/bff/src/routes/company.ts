import type { FastifyInstance } from 'fastify'

// TODO Sprint 1: Implementar gestión de empresas (multi-tenant)
export async function companyRoutes(fastify: FastifyInstance) {
  fastify.get('/me', async (request, reply) => {
    return reply.status(501).send({
      error: 'not_implemented',
      message: 'Company management implementado en Sprint 1',
    })
  })
}
