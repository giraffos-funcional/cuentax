/**
 * @cuentax/types — Products types
 */

import { z } from 'zod'

// ── Interfaces ────────────────────────────────────────────────

export interface Product {
  id: number
  name: string
  code: string | null
  description: string | null
  price: number
  exento: boolean
  unit: string
  created_at: string
  updated_at: string
}

export interface CreateProductDTO {
  name: string
  code?: string
  description?: string
  price: number
  exento?: boolean
  unit?: string
}

export type UpdateProductDTO = Partial<CreateProductDTO>

// ── Zod Schemas ───────────────────────────────────────────────

export const CreateProductDTOSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  description: z.string().optional(),
  price: z.number().min(0),
  exento: z.boolean().optional(),
  unit: z.string().optional(),
})

export const UpdateProductDTOSchema = CreateProductDTOSchema.partial()
