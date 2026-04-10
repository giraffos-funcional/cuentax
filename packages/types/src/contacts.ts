/**
 * @cuentax/types — Contacts types
 */

import { z } from 'zod'

// ── Interfaces ────────────────────────────────────────────────

export interface Contact {
  id: number
  name: string
  rut: string
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  commune: string | null
  giro: string | null
  type: 'cliente' | 'proveedor' | 'ambos'
  is_company: boolean
  created_at: string
  updated_at: string
}

export interface CreateContactDTO {
  name: string
  rut: string
  email?: string
  phone?: string
  address?: string
  city?: string
  commune?: string
  giro?: string
  type: 'cliente' | 'proveedor' | 'ambos'
  is_company?: boolean
}

export type UpdateContactDTO = Partial<CreateContactDTO>

// ── Zod Schemas ───────────────────────────────────────────────

export const CreateContactDTOSchema = z.object({
  name: z.string().min(1),
  rut: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  commune: z.string().optional(),
  giro: z.string().optional(),
  type: z.enum(['cliente', 'proveedor', 'ambos']),
  is_company: z.boolean().optional(),
})

export const UpdateContactDTOSchema = CreateContactDTOSchema.partial()
