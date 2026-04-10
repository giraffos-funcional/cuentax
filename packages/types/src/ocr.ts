/**
 * @cuentax/types — OCR types
 */

import { z } from 'zod'

// ── Interfaces ────────────────────────────────────────────────

export interface OCRResult {
  tipo_documento: string
  numero_documento: string | null
  fecha_documento: string | null
  emisor_rut: string | null
  emisor_razon_social: string | null
  monto_neto: number | null
  monto_iva: number | null
  monto_total: number | null
  confianza: number
  campos_raw: Record<string, unknown>
}

export interface OCRRequest {
  /** Base64 encoded image or image URL */
  image: string
  /** Hint for document type to improve accuracy */
  tipo_hint?: string
}

// ── Zod Schemas ───────────────────────────────────────────────

export const OCRResultSchema = z.object({
  tipo_documento: z.string(),
  numero_documento: z.string().nullable(),
  fecha_documento: z.string().nullable(),
  emisor_rut: z.string().nullable(),
  emisor_razon_social: z.string().nullable(),
  monto_neto: z.number().nullable(),
  monto_iva: z.number().nullable(),
  monto_total: z.number().nullable(),
  confianza: z.number().min(0).max(1),
  campos_raw: z.record(z.unknown()),
})

export const OCRRequestSchema = z.object({
  image: z.string().min(1),
  tipo_hint: z.string().optional(),
})
