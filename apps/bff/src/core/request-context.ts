/**
 * CUENTAX — Request Context (AsyncLocalStorage)
 * ===============================================
 * Provides per-request context (correlation ID) to all downstream code
 * without threading it through every function signature.
 *
 * Usage:
 *   - Set in the Fastify onRequest hook via `requestContext.run()`
 *   - Read anywhere via `getRequestId()`
 */

import { AsyncLocalStorage } from 'node:async_hooks'

interface RequestContextData {
  requestId: string
}

export const requestContext = new AsyncLocalStorage<RequestContextData>()

/**
 * Returns the current request's correlation ID, or 'unknown' if called
 * outside a request context (e.g. background jobs, startup code).
 */
export function getRequestId(): string {
  return requestContext.getStore()?.requestId ?? 'unknown'
}
