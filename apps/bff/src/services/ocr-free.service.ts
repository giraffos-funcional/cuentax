/**
 * CUENTAX — Free OCR Service (Tesseract.js)
 * ==========================================
 * On-server OCR using Tesseract.js — zero API costs.
 * Extracts text from images and parses Chilean tax document fields
 * (boletas, facturas) using regex patterns.
 *
 * Used as fallback when ANTHROPIC_API_KEY is not configured.
 */

import Tesseract from 'tesseract.js'
import { logger } from '@/core/logger'
import type { OCRResult } from './ocr.service'

// ── Chilean Document Regex Patterns ─────────────────────────────

const PATTERNS = {
  // RUT: 76.596.620-5 or 76596620-5
  rut: /R\.?U\.?T\.?\s*[:\.]?\s*(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK])/i,

  // Boleta Electronica No 34373139
  boletaNum: /BOLETA\s+ELECTR[OÓ]NICA\s+N[oO°º]?\s*(\d+)/i,
  facturaNum: /FACTURA\s+ELECTR[OÓ]NICA\s+N[oO°º]?\s*(\d+)/i,
  ncNum: /NOTA\s+DE?\s+CR[EÉ]DITO\s+ELECTR[OÓ]NICA\s+N[oO°º]?\s*(\d+)/i,
  ndNum: /NOTA\s+DE?\s+D[EÉ]BITO\s+ELECTR[OÓ]NICA\s+N[oO°º]?\s*(\d+)/i,
  guiaNum: /GU[IÍ]A\s+DE?\s+DESPACHO\s+N[oO°º]?\s*(\d+)/i,

  // Date: 06/04/2026, 06-04-2026, Fecha: 06/04/2026
  dateSlash: /(?:Fecha|FECHA)\s*[:\.]?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i,
  dateText: /(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i,

  // Razón social (first line after RUT header or standalone)
  razonSocial: /(?:RAZ[OÓ]N?\s*SOCIAL|SOC\.|SOCIEDAD)\s*[:\.]?\s*(.+)/i,

  // Montos
  totalNeto: /(?:TOTAL\s*NETO|NETO|SUBTOTAL)\s*\$?\s*([\d.,]+)/i,
  iva: /(?:I\.?V\.?A\.?\s*(?:\(?19%?\)?)?\s*)\$?\s*([\d.,]+)/i,
  totalVenta: /(?:TOTAL\s*(?:VENTA|A\s*PAGAR)?|TOTAL)\s*\$?\s*([\d.,]+)/i,

  // Item lines: quantity + description + amount
  // Pattern: "7803948000049 ARROZ GRANO LARGO F    1    790"
  itemLine: /^[\s]*(?:\d{6,13}\s+)?(.+?)\s+(\d+)\s+([\d.,]+)\s*$/gm,
}

// ── Month name mapping ──────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04',
  mayo: '05', junio: '06', julio: '07', agosto: '08',
  septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
}

// ── Parsing Helpers ─────────────────────────────────────────────

function parseAmount(raw: string): number {
  // "12.080" or "12,080" or "12080" → 12080
  const cleaned = raw.replace(/[.,]/g, '')
  const num = parseInt(cleaned, 10)
  return isNaN(num) ? 0 : num
}

function formatRut(raw: string): string {
  // Ensure format: XX.XXX.XXX-X
  const cleaned = raw.replace(/\./g, '').trim()
  const [body, dv] = cleaned.split('-')
  if (!body || !dv) return raw

  // Add dots
  const padded = body.padStart(8, '0')
  if (padded.length === 8) {
    return `${padded.slice(0, 2)}.${padded.slice(2, 5)}.${padded.slice(5)}-${dv}`
  }
  if (padded.length === 9) {
    return `${padded.slice(0, 3)}.${padded.slice(3, 6)}.${padded.slice(6)}-${dv}`
  }
  return raw
}

function parseDate(text: string): string | null {
  // Try DD/MM/YYYY or DD-MM-YYYY
  const slashMatch = text.match(PATTERNS.dateSlash)
  if (slashMatch) {
    const [, day, month, year] = slashMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // Try "06 de abril de 2026"
  const textMatch = text.match(PATTERNS.dateText)
  if (textMatch) {
    const [, day, monthName, year] = textMatch
    const month = MONTH_MAP[monthName.toLowerCase()]
    if (month) {
      return `${year}-${month}-${day.padStart(2, '0')}`
    }
  }

  return null
}

function detectDocType(text: string): {
  tipo: OCRResult['tipo_documento']
  numero: string | null
} {
  let match: RegExpMatchArray | null

  match = text.match(PATTERNS.boletaNum)
  if (match) return { tipo: 'boleta', numero: match[1] }

  match = text.match(PATTERNS.facturaNum)
  if (match) return { tipo: 'factura', numero: match[1] }

  match = text.match(PATTERNS.ncNum)
  if (match) return { tipo: 'nota_credito', numero: match[1] }

  match = text.match(PATTERNS.ndNum)
  if (match) return { tipo: 'nota_debito', numero: match[1] }

  match = text.match(PATTERNS.guiaNum)
  if (match) return { tipo: 'guia_despacho', numero: match[1] }

  // Fallback detection
  if (/boleta/i.test(text)) return { tipo: 'boleta', numero: null }
  if (/factura/i.test(text)) return { tipo: 'factura', numero: null }

  return { tipo: null, numero: null }
}

function extractRazonSocial(text: string): string | null {
  // Try explicit pattern first
  const match = text.match(PATTERNS.razonSocial)
  if (match) return match[1].trim()

  // For boletas: often the line right after the RUT header
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const rutLineIdx = lines.findIndex(l => PATTERNS.rut.test(l))

  // Look for company name near the top (usually within first 5 lines)
  for (let i = Math.max(0, rutLineIdx - 2); i < Math.min(lines.length, rutLineIdx + 3); i++) {
    const line = lines[i]
    if (!line) continue
    // Company names typically contain S.A., LTDA, SPA, EIRL, etc.
    if (/\b(S\.?A\.?|LTDA\.?|SPA|EIRL|S\.?C\.?)\b/i.test(line)) {
      // Clean up: remove RUT from line if present
      const clean = line.replace(PATTERNS.rut, '').trim()
      if (clean.length > 5) return clean
    }
  }

  return null
}

function extractItems(text: string): Array<{
  descripcion: string
  cantidad: number
  precio_unitario: number
}> {
  const items: Array<{ descripcion: string; cantidad: number; precio_unitario: number }> = []

  // Look for item-like lines between header markers and total markers
  const lines = text.split('\n')
  let inItems = false

  for (const line of lines) {
    const trimmed = line.trim()

    // Start collecting after header-like lines
    if (/COD.?PROD|ARTICULO|DETALLE|DESCRIPCI/i.test(trimmed)) {
      inItems = true
      continue
    }

    // Stop at total lines
    if (/TOTAL\s*NETO|TOTAL\s*VENTA|SUBTOTAL|TOTAL$/i.test(trimmed)) {
      inItems = false
      continue
    }

    if (!inItems) continue

    // Try to parse: [barcode] DESCRIPTION QTY PRICE
    const itemMatch = trimmed.match(
      /^(?:\d{6,13}\s+)?(.+?)\s+(\d+)\s+([\d.,]+)\s*$/,
    )
    if (itemMatch) {
      const descripcion = itemMatch[1].trim()
      const cantidad = parseInt(itemMatch[2], 10)
      const precio = parseAmount(itemMatch[3])
      if (descripcion.length > 1 && precio > 0) {
        items.push({ descripcion, cantidad: cantidad || 1, precio_unitario: precio })
      }
    }
  }

  return items
}

// ── Main OCR Processing ─────────────────────────────────────────

/**
 * Process an image buffer using Tesseract.js (free, on-server).
 * Returns structured OCR result with Chilean DTE fields.
 */
export async function processImageFree(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<OCRResult> {
  logger.info(
    { mimeType, sizeBytes: imageBuffer.length },
    'Processing OCR image with Tesseract.js (free mode)',
  )

  // Run Tesseract OCR
  const { data } = await Tesseract.recognize(imageBuffer, 'spa', {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        logger.debug({ progress: m.progress }, 'Tesseract OCR progress')
      }
    },
  })

  const rawText = data.text
  const confidence = data.confidence / 100 // Tesseract returns 0-100

  logger.info(
    { textLength: rawText.length, confidence: confidence.toFixed(2) },
    'Tesseract OCR completed',
  )
  logger.debug({ rawText: rawText.slice(0, 500) }, 'OCR raw text preview')

  // Parse structured fields from raw text
  const { tipo, numero } = detectDocType(rawText)
  const rutMatch = rawText.match(PATTERNS.rut)
  const netoMatch = rawText.match(PATTERNS.totalNeto)
  const ivaMatch = rawText.match(PATTERNS.iva)
  const totalMatch = rawText.match(PATTERNS.totalVenta)

  let monto_neto = netoMatch ? parseAmount(netoMatch[1]) : 0
  let monto_iva = ivaMatch ? parseAmount(ivaMatch[1]) : 0
  let monto_total = totalMatch ? parseAmount(totalMatch[1]) : 0

  // Derive missing amounts for boletas
  if (tipo === 'boleta' && monto_total > 0 && monto_neto === 0 && monto_iva === 0) {
    monto_neto = Math.round(monto_total / 1.19)
    monto_iva = monto_total - monto_neto
  }

  const result: OCRResult = {
    tipo_documento: tipo,
    numero_documento: numero,
    fecha_emision: parseDate(rawText),
    emisor_rut: rutMatch ? formatRut(rutMatch[1]) : null,
    emisor_razon_social: extractRazonSocial(rawText),
    monto_neto,
    monto_iva,
    monto_exento: 0,
    monto_total,
    items: extractItems(rawText),
    confianza: Math.round(confidence * 0.8 * 100) / 100, // Slightly lower than Claude Vision
  }

  logger.info({ result }, 'Free OCR extraction complete')
  return result
}
