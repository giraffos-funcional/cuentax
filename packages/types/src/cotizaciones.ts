/**
 * @cuentax/types — Cotizaciones (Quotes) types
 */

import { z } from 'zod'

// ── Interfaces ────────────────────────────────────────────────

export type CotizacionEstado =
  | 'borrador'
  | 'enviada'
  | 'aceptada'
  | 'rechazada'
  | 'facturada'
  | 'cancelada'

export interface CotizacionLinea {
  producto_id?: number
  nombre: string
  cantidad: number
  precio_unitario: number
  descuento?: number
  exento?: boolean
}

export interface Cotizacion {
  id: number
  numero: string
  fecha: string
  validez: string | null
  cliente_id: number
  cliente_nombre: string
  cliente_rut: string
  estado: CotizacionEstado
  lineas: CotizacionLinea[]
  monto_neto: number
  monto_iva: number
  monto_total: number
  notas: string | null
  created_at: string
  updated_at: string
}

export interface CreateCotizacionDTO {
  cliente_id: number
  fecha?: string
  validez?: string
  lineas: CotizacionLinea[]
  notas?: string
}

export type UpdateCotizacionDTO = Partial<CreateCotizacionDTO>

// ── Zod Schemas ───────────────────────────────────────────────

export const CotizacionLineaSchema = z.object({
  producto_id: z.number().optional(),
  nombre: z.string().min(1),
  cantidad: z.number().positive(),
  precio_unitario: z.number(),
  descuento: z.number().optional(),
  exento: z.boolean().optional(),
})

export const CreateCotizacionDTOSchema = z.object({
  cliente_id: z.number(),
  fecha: z.string().optional(),
  validez: z.string().optional(),
  lineas: z.array(CotizacionLineaSchema).min(1),
  notas: z.string().optional(),
})

export const UpdateCotizacionDTOSchema = CreateCotizacionDTOSchema.partial()
