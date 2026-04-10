/**
 * CUENTAX — OCR Service (Claude Vision)
 * =======================================
 * Processes expense images (boletas, facturas) using Claude Vision API.
 * Extracts structured Chilean tax document fields with confidence scoring.
 */

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { logger } from '@/core/logger'
import { processImageFree } from './ocr-free.service'

// ── OCR Result Schema ───────────────────────────────────────────

const ocrItemSchema = z.object({
  descripcion: z.string(),
  cantidad: z.number().default(1),
  precio_unitario: z.number().default(0),
})

export const ocrResultSchema = z.object({
  tipo_documento: z.enum(['boleta', 'factura', 'nota_credito', 'nota_debito', 'guia_despacho']).nullable(),
  numero_documento: z.string().nullable(),
  fecha_emision: z.string().nullable(),          // YYYY-MM-DD
  emisor_rut: z.string().nullable(),             // XX.XXX.XXX-X
  emisor_razon_social: z.string().nullable(),
  monto_neto: z.number().default(0),
  monto_iva: z.number().default(0),
  monto_exento: z.number().default(0),
  monto_total: z.number().default(0),
  items: z.array(ocrItemSchema).default([]),
  confianza: z.number().min(0).max(1).default(0.5),
})

export type OCRResult = z.infer<typeof ocrResultSchema>

// ── RUT Validation ──────────────────────────────────────────────

function isValidChileanRut(rut: string): boolean {
  // Accept formats: 12.345.678-9 or 12345678-9
  const cleaned = rut.replace(/\./g, '').replace(/-/g, '')
  if (cleaned.length < 8 || cleaned.length > 9) return false

  const body = cleaned.slice(0, -1)
  const verifier = cleaned.slice(-1).toUpperCase()

  let sum = 0
  let multiplier = 2
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * multiplier
    multiplier = multiplier === 7 ? 2 : multiplier + 1
  }

  const remainder = 11 - (sum % 11)
  let expected: string
  if (remainder === 11) expected = '0'
  else if (remainder === 10) expected = 'K'
  else expected = String(remainder)

  return verifier === expected
}

// ── OCR Prompt ──────────────────────────────────────────────────

const OCR_SYSTEM_PROMPT = `You are a Chilean tax document data extractor. You analyze images of Chilean boletas, facturas, notas de crédito, notas de débito, and guías de despacho.

Extract the following fields from the document image. Return ONLY a valid JSON object, no markdown, no code blocks, no explanation.

Required JSON structure:
{
  "tipo_documento": "boleta" | "factura" | "nota_credito" | "nota_debito" | "guia_despacho" | null,
  "numero_documento": "string or null",
  "fecha_emision": "YYYY-MM-DD or null",
  "emisor_rut": "XX.XXX.XXX-X format or null",
  "emisor_razon_social": "string or null",
  "monto_neto": number (pesos chilenos, 0 if not found),
  "monto_iva": number (pesos chilenos, 0 if not found),
  "monto_exento": number (pesos chilenos, 0 if not found),
  "monto_total": number (pesos chilenos, 0 if not found),
  "items": [{"descripcion": "string", "cantidad": number, "precio_unitario": number}],
  "confianza": number between 0 and 1
}

Rules:
- All monetary amounts are in Chilean Pesos (CLP), integers only, no decimals.
- RUT must be in format XX.XXX.XXX-X (with dots and dash).
- fecha_emision must be in YYYY-MM-DD format.
- confianza reflects how confident you are in the overall extraction (1.0 = perfect clarity, 0.0 = unreadable).
- If a field cannot be read, set it to null (for strings) or 0 (for numbers).
- For boletas electrónicas, IVA is usually included in the total (monto_neto = monto_total / 1.19, monto_iva = monto_total - monto_neto).
- tipo_documento: "boleta" for Boleta Electrónica (tipo 39), "factura" for Factura Electrónica (tipo 33), etc.`

// ── Service ─────────────────────────────────────────────────────

class OCRService {
  private client: Anthropic | null = null

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is not set')
      }
      this.client = new Anthropic({ apiKey })
    }
    return this.client
  }

  /**
   * Process an image buffer and extract Chilean tax document data.
   * Uses Claude Vision if ANTHROPIC_API_KEY is set, otherwise falls back to free Tesseract.js OCR.
   */
  async processImage(imageBuffer: Buffer, mimeType: string): Promise<OCRResult> {
    // Fallback to free Tesseract.js if no Anthropic API key
    if (!process.env.ANTHROPIC_API_KEY) {
      logger.info('No ANTHROPIC_API_KEY — using free Tesseract.js OCR')
      return processImageFree(imageBuffer, mimeType)
    }

    const client = this.getClient()

    const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!supportedTypes.includes(mimeType)) {
      throw new Error(`Unsupported image type: ${mimeType}. Supported: ${supportedTypes.join(', ')}`)
    }

    const base64Image = imageBuffer.toString('base64')

    logger.info({ mimeType, sizeBytes: imageBuffer.length }, 'Processing OCR image with Claude Vision')

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: OCR_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: 'Extract all tax document data from this image. Return only the JSON object.',
            },
          ],
        },
      ],
    })

    // Extract text content from response
    const textBlock = response.content.find(block => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Claude Vision returned no text response')
    }

    const rawText = textBlock.text.trim()

    // Parse JSON — handle possible markdown code block wrapping
    let jsonStr = rawText
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonStr)
    } catch (parseErr) {
      logger.error({ rawText }, 'Failed to parse OCR JSON response')
      throw new Error('OCR response was not valid JSON')
    }

    // Validate with Zod
    const result = ocrResultSchema.safeParse(parsed)
    if (!result.success) {
      logger.warn({ errors: result.error.flatten(), parsed }, 'OCR response failed schema validation')
      // Attempt partial extraction with defaults
      const fallback = ocrResultSchema.safeParse({
        ...parsed as Record<string, unknown>,
        confianza: 0.3,
      })
      if (fallback.success) return this.validateResult(fallback.data)
      throw new Error('OCR response did not match expected schema')
    }

    return this.validateResult(result.data)
  }

  /**
   * Post-processing validation: RUT format, monto consistency.
   */
  private validateResult(data: OCRResult): OCRResult {
    // Validate RUT if present
    if (data.emisor_rut && !isValidChileanRut(data.emisor_rut)) {
      logger.warn({ rut: data.emisor_rut }, 'OCR extracted invalid RUT — keeping but reducing confidence')
      data.confianza = Math.max(data.confianza - 0.2, 0)
    }

    // Validate monto consistency: total should roughly equal neto + iva + exento
    if (data.monto_total > 0 && data.monto_neto > 0) {
      const expectedTotal = data.monto_neto + data.monto_iva + data.monto_exento
      const diff = Math.abs(expectedTotal - data.monto_total)
      // Allow a 2-peso rounding tolerance
      if (diff > 2) {
        logger.warn(
          { expected: expectedTotal, actual: data.monto_total, diff },
          'OCR monto inconsistency detected',
        )
        data.confianza = Math.max(data.confianza - 0.1, 0)
      }
    }

    // If only total is present on a boleta, derive neto and iva
    if (data.tipo_documento === 'boleta' && data.monto_total > 0 && data.monto_neto === 0 && data.monto_iva === 0) {
      data.monto_neto = Math.round(data.monto_total / 1.19)
      data.monto_iva = data.monto_total - data.monto_neto
    }

    return data
  }
}

export const ocrService = new OCRService()
