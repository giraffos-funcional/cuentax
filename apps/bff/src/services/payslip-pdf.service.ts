/**
 * CUENTAX — Payslip PDF Generator (Liquidacion de Sueldo)
 * ========================================================
 * Generates a standard Chilean liquidacion de sueldo in PDF format using PDFKit.
 * Follows the official format used by Chilean companies and validated by DT.
 */

import PDFDocument from 'pdfkit'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PayslipPDFLine {
  code: string
  name: string
  /** BASIC, ALW, ALWNOTIMP, DEDPREV, DEDSALUD, DEDTRIB, GROSS, NET, COMP */
  category: string
  total: number
}

export interface PayslipPDFData {
  // Company
  company_name: string
  company_rut: string
  company_address: string
  company_logo?: string // base64

  // Employee
  employee_name: string
  employee_rut: string
  employee_start_date: string
  employee_job_title: string
  employee_department: string
  employee_afp: string
  employee_health_plan: string // "Isapre Cruz Blanca" or "FONASA"
  employee_isapre_uf?: number  // UF plan amount (only for Isapre)

  // Period
  month: string // "Febrero"
  year: number
  uf_value: number

  // Payslip lines (from hr.payslip.line)
  wage: number
  lines: PayslipPDFLine[]

  // Totals
  total_imponible: number
  total_no_imponible: number
  total_haberes: number
  total_descuentos: number
  total_pagar: number
}

// ---------------------------------------------------------------------------
// CLP Formatter
// ---------------------------------------------------------------------------

/**
 * Format a number as Chilean Peso: $1.234.567
 * Uses dot as thousands separator, no decimals.
 */
function formatCLP(amount: number): string {
  const abs = Math.abs(Math.round(amount))
  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return amount < 0 ? `-$${formatted}` : `$${formatted}`
}

/**
 * Right-pad a CLP amount string to align columns.
 */
function amountColumn(amount: number, width = 14): string {
  const str = formatCLP(amount)
  return str.padStart(width)
}

// ---------------------------------------------------------------------------
// Number to Spanish Words
// ---------------------------------------------------------------------------

const UNITS = [
  '', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO',
  'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ',
  'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE',
  'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE',
  'VEINTIUN', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO',
  'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE',
]

const TENS = [
  '', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA',
  'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA',
]

const HUNDREDS = [
  '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS',
]

function convertGroup(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'CIEN'

  const parts: string[] = []

  const h = Math.floor(n / 100)
  if (h > 0) parts.push(HUNDREDS[h])

  const remainder = n % 100
  if (remainder > 0) {
    if (remainder < 30) {
      parts.push(UNITS[remainder])
    } else {
      const t = Math.floor(remainder / 10)
      const u = remainder % 10
      if (u === 0) {
        parts.push(TENS[t])
      } else {
        parts.push(`${TENS[t]} Y ${UNITS[u]}`)
      }
    }
  }

  return parts.join(' ')
}

/**
 * Convert an integer to Spanish words (Chilean format).
 * Examples:
 *   1655917 -> "UN MILLON SEISCIENTOS CINCUENTA Y CINCO MIL NOVECIENTOS DIECISIETE"
 *   4073278 -> "CUATRO MILLONES SETENTA Y TRES MIL DOSCIENTOS SETENTA Y OCHO"
 */
export function numberToWords(n: number): string {
  if (n === 0) return 'CERO'

  const num = Math.abs(Math.round(n))
  const parts: string[] = []

  // Billions (mil millones)
  const billions = Math.floor(num / 1_000_000_000)
  if (billions > 0) {
    if (billions === 1) {
      parts.push('MIL')
    } else {
      parts.push(convertGroup(billions), 'MIL')
    }
  }

  // Millions
  const millions = Math.floor((num % 1_000_000_000) / 1_000_000)
  if (millions > 0) {
    if (millions === 1) {
      parts.push('UN MILLON')
    } else {
      parts.push(convertGroup(millions), 'MILLONES')
    }
  }

  // Thousands
  const thousands = Math.floor((num % 1_000_000) / 1_000)
  if (thousands > 0) {
    if (thousands === 1) {
      parts.push('MIL')
    } else {
      parts.push(convertGroup(thousands), 'MIL')
    }
  }

  // Units
  const units = num % 1_000
  if (units > 0) {
    parts.push(convertGroup(units))
  }

  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------------------
// Category classification helpers
// ---------------------------------------------------------------------------

/** Categories that count as "haberes imponibles" */
const IMPONIBLE_CATEGORIES = new Set(['BASIC', 'ALW', 'GROSS'])

/** Categories that count as "haberes no imponibles" */
const NO_IMPONIBLE_CATEGORIES = new Set(['ALWNOTIMP'])

/** Categories that count as "descuentos" */
const DESCUENTO_CATEGORIES = new Set(['DEDPREV', 'DEDSALUD', 'DEDTRIB', 'DED'])

/** Category codes to exclude from line display (summary rows) */
const EXCLUDED_CODES = new Set(['GROSS', 'NET', 'COMP'])

// ---------------------------------------------------------------------------
// PDF Generation
// ---------------------------------------------------------------------------

/**
 * Generate a Chilean payslip PDF (liquidacion de sueldo).
 * Returns a Buffer containing the PDF data.
 */
export async function generatePayslipPDF(data: PayslipPDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
      })

      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const pageWidth = doc.page.width - 100 // 50pt margins each side
      const leftCol = 50
      const rightCol = 310

      // ── Header ────────────────────────────────────────────────

      // Company logo (top-left)
      if (data.company_logo) {
        try {
          const logoBuffer = Buffer.from(data.company_logo, 'base64')
          doc.image(logoBuffer, leftCol, 50, { width: 60, height: 60 })
        } catch {
          // Skip logo if invalid
        }
      }

      // Title (top-right area)
      doc.font('Helvetica-Bold').fontSize(16)
      doc.text('LIQUIDACION DE SUELDO', rightCol, 50, { width: pageWidth - 260, align: 'right' })

      // Company info (below logo)
      const companyY = data.company_logo ? 120 : 50
      doc.font('Helvetica-Bold').fontSize(10)
      doc.text(data.company_name, leftCol, companyY)
      doc.font('Helvetica').fontSize(9)
      doc.text(`RUT: ${data.company_rut}`, leftCol, companyY + 14)
      doc.text(data.company_address, leftCol, companyY + 26)

      // Period (right side, aligned with company info)
      doc.font('Helvetica-Bold').fontSize(12)
      doc.text(
        `${data.month} ${data.year}`,
        rightCol, companyY,
        { width: pageWidth - 260, align: 'right' },
      )

      // ── Separator ─────────────────────────────────────────────

      let y = companyY + 48
      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(1).stroke()
      y += 10

      // ── Employee info (2 columns) ─────────────────────────────

      const labelWidth = 100
      const valueWidth = 150
      const col2Label = 310
      const col2Value = 410
      const lineHeight = 15

      const employeeFields = [
        { label: 'Nombre', value: data.employee_name, label2: 'Cargo', value2: data.employee_job_title },
        { label: 'R.U.T.', value: data.employee_rut, label2: 'Sueldo Base', value2: formatCLP(data.wage) },
        { label: 'Fecha Ingreso', value: data.employee_start_date, label2: 'Valor UF', value2: `$${data.uf_value.toLocaleString('es-CL')}` },
        {
          label: 'Seccion',
          value: data.employee_department,
          label2: data.employee_health_plan.toUpperCase().includes('FONASA') ? 'Salud' : 'Pac. Isapre',
          value2: data.employee_health_plan.toUpperCase().includes('FONASA')
            ? 'FONASA 7%'
            : `UF ${data.employee_isapre_uf?.toFixed(2) ?? '0.00'}`,
        },
      ]

      doc.font('Helvetica').fontSize(9)
      for (const row of employeeFields) {
        // Left column
        doc.font('Helvetica-Bold').text(row.label + ':', leftCol, y, { width: labelWidth })
        doc.font('Helvetica').text(row.value, leftCol + labelWidth, y, { width: valueWidth })
        // Right column
        doc.font('Helvetica-Bold').text(row.label2 + ':', col2Label, y, { width: labelWidth })
        doc.font('Helvetica').text(row.value2, col2Value, y, { width: valueWidth })
        y += lineHeight
      }

      y += 5

      // ── AFP line ──────────────────────────────────────────────

      doc.font('Helvetica-Bold').text('AFP:', leftCol, y, { width: labelWidth })
      doc.font('Helvetica').text(data.employee_afp, leftCol + labelWidth, y, { width: valueWidth })
      y += lineHeight + 5

      // ── HABERES Section ───────────────────────────────────────

      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(0.5).stroke()
      y += 8

      doc.font('Helvetica-Bold').fontSize(11)
      doc.text('HABERES', leftCol, y)
      y += 16

      // Separator line
      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(0.5).dash(3, { space: 2 }).stroke()
      doc.undash()
      y += 8

      // -- Imponibles subsection --
      doc.font('Helvetica-Bold').fontSize(9)
      doc.text('IMPONIBLES', leftCol, y)
      y += 14

      const imponibleLines = data.lines.filter(
        (l) => IMPONIBLE_CATEGORIES.has(l.category) && !EXCLUDED_CODES.has(l.code) && l.total !== 0,
      )

      doc.font('Helvetica').fontSize(9)
      for (const line of imponibleLines) {
        doc.text(`  ${line.name.toUpperCase()}`, leftCol, y, { width: pageWidth - 100 })
        doc.text(amountColumn(line.total), leftCol + pageWidth - 100, y, { width: 100, align: 'right' })
        y += 13
      }

      // Total imponibles
      y += 4
      doc.font('Helvetica-Bold').fontSize(9)
      doc.text('TOTAL IMPONIBLES', leftCol, y, { width: pageWidth - 100 })
      doc.text(amountColumn(data.total_imponible), leftCol + pageWidth - 100, y, { width: 100, align: 'right' })
      y += 16

      // -- No Imponibles subsection --
      doc.font('Helvetica-Bold').fontSize(9)
      doc.text('NO IMPONIBLES', leftCol, y)
      y += 14

      const noImponibleLines = data.lines.filter(
        (l) => NO_IMPONIBLE_CATEGORIES.has(l.category) && !EXCLUDED_CODES.has(l.code) && l.total !== 0,
      )

      doc.font('Helvetica').fontSize(9)
      for (const line of noImponibleLines) {
        doc.text(`  ${line.name.toUpperCase()}`, leftCol, y, { width: pageWidth - 100 })
        doc.text(amountColumn(line.total), leftCol + pageWidth - 100, y, { width: 100, align: 'right' })
        y += 13
      }

      // Total no imponibles
      y += 4
      doc.font('Helvetica-Bold').fontSize(9)
      doc.text('TOTAL NO IMPONIBLES', leftCol, y, { width: pageWidth - 100 })
      doc.text(amountColumn(data.total_no_imponible), leftCol + pageWidth - 100, y, { width: 100, align: 'right' })
      y += 16

      // Total haberes
      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(0.5).stroke()
      y += 6
      doc.font('Helvetica-Bold').fontSize(10)
      doc.text('TOTAL HABERES', leftCol, y, { width: pageWidth - 100 })
      doc.text(amountColumn(data.total_haberes), leftCol + pageWidth - 100, y, { width: 100, align: 'right' })
      y += 20

      // ── DESCUENTOS Section ────────────────────────────────────

      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(0.5).stroke()
      y += 8

      doc.font('Helvetica-Bold').fontSize(11)
      doc.text('DESCUENTOS', leftCol, y)
      y += 16

      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(0.5).dash(3, { space: 2 }).stroke()
      doc.undash()
      y += 8

      const descuentoLines = data.lines.filter(
        (l) => DESCUENTO_CATEGORIES.has(l.category) && !EXCLUDED_CODES.has(l.code) && l.total !== 0,
      )

      doc.font('Helvetica').fontSize(9)
      for (const line of descuentoLines) {
        doc.text(`  ${line.name.toUpperCase()}`, leftCol, y, { width: pageWidth - 100 })
        doc.text(amountColumn(Math.abs(line.total)), leftCol + pageWidth - 100, y, { width: 100, align: 'right' })
        y += 13
      }

      // Total descuentos
      y += 4
      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(0.5).stroke()
      y += 6
      doc.font('Helvetica-Bold').fontSize(10)
      doc.text('TOTAL DESCUENTOS', leftCol, y, { width: pageWidth - 100 })
      doc.text(amountColumn(Math.abs(data.total_descuentos)), leftCol + pageWidth - 100, y, { width: 100, align: 'right' })
      y += 22

      // ── TOTAL A PAGAR ─────────────────────────────────────────

      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(1.5).stroke()
      y += 8
      doc.font('Helvetica-Bold').fontSize(13)
      doc.text('TOTAL A PAGAR', leftCol, y, { width: pageWidth - 120 })
      doc.text(amountColumn(data.total_pagar), leftCol + pageWidth - 120, y, { width: 120, align: 'right' })
      y += 22

      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(1.5).stroke()
      y += 14

      // ── Amount in words ───────────────────────────────────────

      doc.font('Helvetica').fontSize(9)
      doc.text(
        `Son: ${numberToWords(data.total_pagar)} PESOS.-`,
        leftCol, y,
        { width: pageWidth },
      )
      y += 30

      // ── Signature lines ───────────────────────────────────────

      // Check if we need a new page for signatures
      if (y > doc.page.height - 150) {
        doc.addPage()
        y = 50
      }

      const sigWidth = 180
      const sigGap = (pageWidth - sigWidth * 2) / 3
      const sig1X = leftCol + sigGap
      const sig2X = leftCol + sigGap * 2 + sigWidth

      y += 30

      // Signature line 1 (employer)
      doc.moveTo(sig1X, y).lineTo(sig1X + sigWidth, y).lineWidth(0.5).stroke()
      doc.font('Helvetica').fontSize(8)
      doc.text('FIRMA EMPLEADOR', sig1X, y + 4, { width: sigWidth, align: 'center' })

      // Signature line 2 (employee)
      doc.moveTo(sig2X, y).lineTo(sig2X + sigWidth, y).lineWidth(0.5).stroke()
      doc.text('FIRMA TRABAJADOR', sig2X, y + 4, { width: sigWidth, align: 'center' })

      y += 30

      // Date received line
      doc.font('Helvetica').fontSize(8)
      doc.text(
        `Recibido conforme en _________________ , a _____ de ${data.month} de ${data.year}`,
        leftCol, y,
        { width: pageWidth, align: 'center' },
      )

      // ── Footer ────────────────────────────────────────────────

      doc.font('Helvetica').fontSize(7)
      doc.text(
        `Generado por CuentaX - ${new Date().toLocaleDateString('es-CL')}`,
        leftCol,
        doc.page.height - 40,
        { width: pageWidth, align: 'center' },
      )

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}
