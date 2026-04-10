/**
 * @cuentax/types — API generic types
 * Shared response wrappers for all endpoints.
 */

import { z } from 'zod'

// ── Interfaces ────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pages: number
}

export interface APIError {
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface APIResponse<T> {
  data: T
  message?: string
}

// ── Zod Schemas ───────────────────────────────────────────────

export const APIErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
})

/** Factory to create a paginated response schema for any item type */
export function paginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    pages: z.number(),
  })
}
