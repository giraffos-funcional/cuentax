/**
 * @cuentax/types — Gastos (Expenses) types
 * Extracted from apps/web/src/hooks/index.ts
 */

import { z } from 'zod'

// ── Interfaces ────────────────────────────────────────────────

export interface Gasto {
  id: string
  tipo_documento: string
  numero_documento: string
  fecha_documento: string
  emisor_rut: string
  emisor_razon_social: string
  monto_neto: number
  monto_iva: number
  monto_total: number
  categoria: string
  descripcion: string
  foto_url: string | null
  confianza_ocr: number | null
  verificado: boolean
  created_at: string
}

export interface CreateGastoDTO {
  tipo_documento: string
  numero_documento?: string
  fecha_documento: string
  emisor_rut?: string
  emisor_razon_social?: string
  monto_neto?: number
  monto_iva?: number
  monto_total: number
  categoria: string
  descripcion?: string
  foto_url?: string
  datos_ocr?: Record<string, unknown>
  confianza_ocr?: number
}

export type UpdateGastoDTO = Partial<CreateGastoDTO>

export type GastoCategory =
  | 'alimentacion'
  | 'transporte'
  | 'oficina'
  | 'tecnologia'
  | 'servicios'
  | 'impuestos'
  | 'otros'

export interface GastoStats {
  total_gastos: number
  monto_total: number
  por_categoria: Record<string, number>
  verificados: number
  sin_verificar: number
}

// ── Zod Schemas ───────────────────────────────────────────────

export const CreateGastoDTOSchema = z.object({
  tipo_documento: z.string().min(1),
  numero_documento: z.string().optional(),
  fecha_documento: z.string().min(1),
  emisor_rut: z.string().optional(),
  emisor_razon_social: z.string().optional(),
  monto_neto: z.number().optional(),
  monto_iva: z.number().optional(),
  monto_total: z.number(),
  categoria: z.string().min(1),
  descripcion: z.string().optional(),
  foto_url: z.string().url().optional(),
  datos_ocr: z.record(z.unknown()).optional(),
  confianza_ocr: z.number().min(0).max(1).optional(),
})

export const UpdateGastoDTOSchema = CreateGastoDTOSchema.partial()
