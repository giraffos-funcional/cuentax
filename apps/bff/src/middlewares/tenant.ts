/**
 * Middleware Multi-tenant
 * =======================
 * Resuelve el tenant (empresa) en cada request.
 * 
 * Estrategia de resolución (en orden de prioridad):
 * 1. Header X-Company-ID (para API keys externas)
 * 2. JWT payload company_id (para usuarios autenticados)
 * 3. Subdominio (para futuro multi-tenant por subdominio)
 */

import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify'

// Extender el tipo de request para incluir company context
declare module 'fastify' {
  interface FastifyRequest {
    companyId: number | null
    companyRut: string | null
  }
}

const PUBLIC_ROUTES = ['/health', '/api/v1/auth/login', '/api/v1/auth/refresh']

export async function tenantMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Inicializar context
  request.companyId = null
  request.companyRut = null

  // Rutas públicas no necesitan tenant
  if (PUBLIC_ROUTES.some((route) => request.url.startsWith(route))) {
    return
  }

  // 1. Header explícito (prioridad máxima — para integraciones API)
  const companyHeader = request.headers['x-company-id']
  if (companyHeader && typeof companyHeader === 'string') {
    const companyId = parseInt(companyHeader, 10)
    if (!isNaN(companyId)) {
      request.companyId = companyId
      return
    }
  }

  // 2. JWT payload
  try {
    const token = request.headers.authorization?.replace('Bearer ', '')
    if (token) {
      const payload = request.server.jwt.decode<{ company_id: number; company_rut: string }>(token)
      if (payload?.company_id) {
        request.companyId = payload.company_id
        request.companyRut = payload.company_rut ?? null
        return
      }
    }
  } catch {
    // Token inválido — las rutas protegidas devolverán 401 en su propia validación
  }
}
