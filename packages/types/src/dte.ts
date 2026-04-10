/**
 * @cuentax/types — DTE (Documento Tributario Electronico) types
 * Chilean electronic tax documents for SII.
 */

import { z } from 'zod'

// ── Enums ─────────────────────────────────────────────────────

export enum TipoDTE {
  FACTURA_ELECTRONICA = 33,
  FACTURA_EXENTA = 34,
  NOTA_CREDITO = 61,
  NOTA_DEBITO = 56,
  BOLETA_ELECTRONICA = 39,
  BOLETA_EXENTA = 41,
  GUIA_DESPACHO = 52,
}

export type DTEStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'processing'

// ── Interfaces ────────────────────────────────────────────────

export interface DTELine {
  nombre: string
  cantidad: number
  precio_unitario: number
  monto_neto: number
  descuento?: number
  exento?: boolean
}

export interface DTEDocument {
  id: number
  tipo_dte: TipoDTE
  folio: number
  fecha_emision: string
  receptor_rut: string
  receptor_razon_social: string
  monto_neto: number
  monto_iva: number
  monto_total: number
  status: DTEStatus
  track_id: string | null
  sii_response: string | null
  lineas: DTELine[]
  created_at: string
  updated_at: string
}

export interface EmitirDTERequest {
  tipo_dte: TipoDTE
  receptor_rut: string
  receptor_razon_social: string
  receptor_giro?: string
  receptor_direccion?: string
  receptor_comuna?: string
  receptor_ciudad?: string
  lineas: DTELine[]
  fecha_emision?: string
  referencia?: DTEReferencia[]
}

export interface DTEReferencia {
  tipo_doc_ref: TipoDTE
  folio_ref: number
  fecha_ref: string
  razon_ref?: string
  codigo_ref?: number
}

export interface EmitirDTEResponse {
  id: number
  folio: number
  tipo_dte: TipoDTE
  track_id: string
  status: DTEStatus
}

export interface DTEStatusResponse {
  track_id: string
  status: DTEStatus
  glosa: string | null
  accepted_at: string | null
}

// ── Zod Schemas ───────────────────────────────────────────────

export const DTELineSchema = z.object({
  nombre: z.string().min(1),
  cantidad: z.number().positive(),
  precio_unitario: z.number(),
  monto_neto: z.number(),
  descuento: z.number().optional(),
  exento: z.boolean().optional(),
})

export const EmitirDTERequestSchema = z.object({
  tipo_dte: z.nativeEnum(TipoDTE),
  receptor_rut: z.string().min(1),
  receptor_razon_social: z.string().min(1),
  receptor_giro: z.string().optional(),
  receptor_direccion: z.string().optional(),
  receptor_comuna: z.string().optional(),
  receptor_ciudad: z.string().optional(),
  lineas: z.array(DTELineSchema).min(1),
  fecha_emision: z.string().optional(),
  referencia: z.array(z.object({
    tipo_doc_ref: z.nativeEnum(TipoDTE),
    folio_ref: z.number(),
    fecha_ref: z.string(),
    razon_ref: z.string().optional(),
    codigo_ref: z.number().optional(),
  })).optional(),
})
