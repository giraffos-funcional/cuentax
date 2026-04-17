/**
 * CUENTAX — Country Guard Middleware
 * ====================================
 * Fastify preHandler that restricts route access based on the active
 * company's country_code. Returns 404 for routes not available in
 * the company's country.
 */

import type { FastifyRequest, FastifyReply } from 'fastify'
import { isCountryEnabled } from '@/core/feature-flags'

/** Routes restricted to Chilean companies only */
const CHILE_ONLY_PREFIXES = [
  '/api/v1/sii',
  '/api/v1/dte',
  '/api/v1/caf',
  '/api/v1/rcv',
  '/api/v1/reportes/f29',
  '/api/v1/reportes/lcv',
  '/api/v1/remuneraciones',
]

/** Routes restricted to US companies only */
const US_ONLY_PREFIXES = [
  '/api/v1/usa',
]

/**
 * Extracts country_code from the JWT user payload.
 * Falls back to 'CL' for backward compatibility.
 */
function getCountryFromRequest(req: FastifyRequest): string {
  const user = (req as any).user
  return user?.country_code ?? 'CL'
}

/**
 * Country guard — attach to route groups that are country-specific.
 * Usage: fastify.addHook('preHandler', countryGuard)
 */
export async function countryGuard(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const country = getCountryFromRequest(req)
  const url = req.url

  // Check Chile-only routes
  for (const prefix of CHILE_ONLY_PREFIXES) {
    if (url.startsWith(prefix) && country !== 'CL') {
      return reply.status(404).send({
        error: 'not_available',
        message: 'This feature is not available for your country',
      })
    }
  }

  // Check US-only routes
  for (const prefix of US_ONLY_PREFIXES) {
    if (url.startsWith(prefix)) {
      if (country !== 'US') {
        return reply.status(404).send({
          error: 'not_available',
          message: 'This feature is only available for US companies',
        })
      }
      if (!isCountryEnabled('US')) {
        return reply.status(404).send({
          error: 'feature_disabled',
          message: 'US accounting is not enabled yet',
        })
      }
    }
  }
}

/**
 * Factory: creates a guard for a specific country.
 * Usage: fastify.addHook('preHandler', requireCountry('CL'))
 */
export function requireCountry(requiredCountry: string) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const country = getCountryFromRequest(req)
    if (country !== requiredCountry) {
      return reply.status(404).send({
        error: 'not_available',
        message: `This feature requires a ${requiredCountry} company`,
      })
    }
  }
}
