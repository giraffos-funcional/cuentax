/**
 * @cuentax/types — Reporting types
 * Stats, LCV (Libro Compras/Ventas), F29 declaration.
 */

import { z } from 'zod'

// ── Interfaces ────────────────────────────────────────────────

export interface Stats {
  ventas_mes: number
  compras_mes: number
  iva_debito: number
  iva_credito: number
  iva_neto: number
  dtes_emitidos: number
  dtes_pendientes: number
  source: string
}

export interface LCVTotales {
  neto: number
  iva: number
  total: number
}

export interface LCVRecord {
  tipo_dte: number
  folio: number
  fecha: string
  rut: string
  razon_social: string
  neto: number
  iva: number
  total: number
  exento: number
}

export interface LCVResponse {
  registros: LCVRecord[]
  totales: LCVTotales
  source: string
}

export interface F29Data {
  periodo: string
  ventas_netas: number
  compras_netas: number
  iva_debito: number
  iva_credito: number
  iva_a_pagar: number
  ppm: number
  total_a_pagar: number
  source: string
  nota?: string
}

// ── Zod Schemas ───────────────────────────────────────────────

export const StatsSchema = z.object({
  ventas_mes: z.number(),
  compras_mes: z.number(),
  iva_debito: z.number(),
  iva_credito: z.number(),
  iva_neto: z.number(),
  dtes_emitidos: z.number(),
  dtes_pendientes: z.number(),
  source: z.string(),
})

export const LCVRecordSchema = z.object({
  tipo_dte: z.number(),
  folio: z.number(),
  fecha: z.string(),
  rut: z.string(),
  razon_social: z.string(),
  neto: z.number(),
  iva: z.number(),
  total: z.number(),
  exento: z.number(),
})
