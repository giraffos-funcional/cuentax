import type { FastifyInstance } from 'fastify'

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/', async () => ({
    status: 'ok',
    service: 'giraffos-sii-bff',
    version: process.env['npm_package_version'] ?? '0.1.0',
    timestamp: new Date().toISOString(),
  }))
}
