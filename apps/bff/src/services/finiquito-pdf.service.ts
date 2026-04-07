/**
 * CUENTAX — Finiquito PDF Generator (Employment Termination Settlement)
 * =====================================================================
 * Generates a Chilean finiquito document in PDF format using PDFKit.
 * Follows the official format used by Chilean companies and validated by DT.
 */

import PDFDocument from 'pdfkit'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FiniquitoPDFData {
  // Company
  company_name: string
  company_rut: string
  company_address: string
  company_city: string

  // Employee
  employee_name: string
  employee_rut: string
  employee_job_title: string
  employee_department: string

  // Termination
  date_start: string
  date_termination: string
  reason: string
  reason_label: string

  // Calculations
  years_service: number
  months_service: number
  wage: number
  avg_wage_3m: number
  uf_value: number

  indemnizacion_anos: number
  vacaciones_proporcionales: number
  feriado_pendiente: number
  sueldo_proporcional: number
  gratificacion_proporcional: number
  total_finiquito: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function formatDateLong(dateStr: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDate()
  const month = MONTHS[d.getMonth()]
  const year = d.getFullYear()
  return `${day} de ${month} de ${year}`
}

function formatCLP(amount: number): string {
  const abs = Math.abs(Math.round(amount))
  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return amount < 0 ? `-$${formatted}` : `$${formatted}`
}

// ---------------------------------------------------------------------------
// Number to Spanish words
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

function numberToWords(n: number): string {
  if (n === 0) return 'CERO'

  const num = Math.abs(Math.round(n))
  const parts: string[] = []

  const millions = Math.floor((num % 1_000_000_000) / 1_000_000)
  if (millions > 0) {
    if (millions === 1) {
      parts.push('UN MILLON')
    } else {
      parts.push(convertGroup(millions), 'MILLONES')
    }
  }

  const thousands = Math.floor((num % 1_000_000) / 1_000)
  if (thousands > 0) {
    if (thousands === 1) {
      parts.push('MIL')
    } else {
      parts.push(convertGroup(thousands), 'MIL')
    }
  }

  const units = num % 1_000
  if (units > 0) {
    parts.push(convertGroup(units))
  }

  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------------------
// PDF Generation
// ---------------------------------------------------------------------------

/**
 * Generate a Chilean finiquito (employment termination settlement) PDF.
 * Returns a Buffer containing the PDF data.
 */
export async function generateFiniquitoPDF(data: FiniquitoPDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 60, bottom: 60, left: 60, right: 60 },
        info: {
          Title: `Finiquito - ${data.employee_name}`,
          Author: data.company_name,
          Subject: 'Finiquito de Trabajo',
        },
      })

      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const pageWidth = doc.page.width - 120 // 60pt margins each side
      const leftCol = 60

      const FONT_REGULAR = 'Helvetica'
      const FONT_BOLD = 'Helvetica-Bold'

      // ── Company Header ────────────────────────────────────────
      let y = 60

      doc.font(FONT_BOLD).fontSize(12)
      doc.text(data.company_name, leftCol, y, { width: pageWidth })
      y += 16
      doc.font(FONT_REGULAR).fontSize(9)
      doc.text(`RUT: ${data.company_rut}`, leftCol, y)
      y += 12
      doc.text(`${data.company_address}${data.company_city ? `, ${data.company_city}` : ''}`, leftCol, y)
      y += 20

      // ── Title ─────────────────────────────────────────────────
      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(1.5).stroke('#333333')
      y += 12

      doc.font(FONT_BOLD).fontSize(16)
      doc.text('FINIQUITO DE TRABAJO', leftCol, y, { width: pageWidth, align: 'center' })
      y += 24

      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(1.5).stroke('#333333')
      y += 18

      // ── Employee Info ─────────────────────────────────────────
      const labelWidth = 150
      const valueStart = leftCol + labelWidth

      function kvRow(label: string, value: string): void {
        doc.font(FONT_BOLD).fontSize(10)
        doc.text(`${label}:`, leftCol, y, { width: labelWidth })
        doc.font(FONT_REGULAR).fontSize(10)
        doc.text(value, valueStart, y, { width: pageWidth - labelWidth })
        y += 16
      }

      kvRow('Nombre Trabajador', data.employee_name)
      kvRow('R.U.T.', data.employee_rut)
      kvRow('Cargo', data.employee_job_title)
      kvRow('Departamento', data.employee_department)
      kvRow('Fecha Ingreso', formatDateLong(data.date_start))
      kvRow('Fecha Término', formatDateLong(data.date_termination))
      kvRow('Causal de Término', data.reason_label)
      kvRow('Antigüedad', `${Math.floor(data.years_service)} año(s) y ${data.months_service % 12} mes(es)`)
      kvRow('Remuneración Base', formatCLP(data.wage))
      kvRow('Promedio 3 Meses', formatCLP(data.avg_wage_3m))

      if (data.uf_value > 0) {
        kvRow('Valor UF', `$${data.uf_value.toLocaleString('es-CL')}`)
      }

      y += 10

      // ── Calculation Breakdown ─────────────────────────────────
      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(0.5).stroke('#666666')
      y += 10

      doc.font(FONT_BOLD).fontSize(12)
      doc.text('DETALLE DEL FINIQUITO', leftCol, y)
      y += 20

      // Table header
      const conceptCol = leftCol
      const amountCol = leftCol + pageWidth - 120
      const amountWidth = 120

      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(0.3).dash(3, { space: 2 }).stroke('#999999')
      doc.undash()
      y += 8

      doc.font(FONT_BOLD).fontSize(9)
      doc.text('CONCEPTO', conceptCol, y, { width: pageWidth - amountWidth })
      doc.text('MONTO', amountCol, y, { width: amountWidth, align: 'right' })
      y += 14

      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(0.3).stroke('#999999')
      y += 10

      // Breakdown lines
      function detailRow(label: string, amount: number, note?: string): void {
        doc.font(FONT_REGULAR).fontSize(10)
        const displayLabel = note ? `${label} (${note})` : label
        doc.text(displayLabel, conceptCol, y, { width: pageWidth - amountWidth })
        doc.text(formatCLP(amount), amountCol, y, { width: amountWidth, align: 'right' })
        y += 16
      }

      if (data.indemnizacion_anos > 0) {
        detailRow(
          'Indemnización por Años de Servicio',
          data.indemnizacion_anos,
          `${Math.floor(data.years_service)} año(s), tope 11`,
        )
      }

      detailRow(
        'Vacaciones Proporcionales',
        data.vacaciones_proporcionales,
      )

      if (data.feriado_pendiente > 0) {
        detailRow('Feriado Legal Pendiente', data.feriado_pendiente)
      }

      detailRow(
        'Sueldo Proporcional',
        data.sueldo_proporcional,
        `${new Date(data.date_termination + 'T12:00:00').getDate()} días`,
      )

      detailRow('Gratificación Proporcional', data.gratificacion_proporcional)

      y += 4

      // Total separator
      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(1.5).stroke('#333333')
      y += 10

      doc.font(FONT_BOLD).fontSize(13)
      doc.text('TOTAL FINIQUITO', conceptCol, y, { width: pageWidth - amountWidth })
      doc.text(formatCLP(data.total_finiquito), amountCol, y, { width: amountWidth, align: 'right' })
      y += 20

      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(1.5).stroke('#333333')
      y += 14

      // Amount in words
      doc.font(FONT_REGULAR).fontSize(9)
      doc.text(
        `Son: ${numberToWords(data.total_finiquito)} PESOS.-`,
        leftCol, y,
        { width: pageWidth },
      )
      y += 25

      // ── Legal text ────────────────────────────────────────────

      // Check if we need a new page
      if (y > doc.page.height - 280) {
        doc.addPage()
        y = 60
      }

      doc.font(FONT_REGULAR).fontSize(9)
      doc.text(
        'El trabajador declara que recibe a su entera y total conformidad las sumas indicadas en el presente finiquito, no teniendo cargo ni cobro alguno que formular en contra de su ex empleador, por concepto alguno derivado de la relación laboral que los unió, ya sea por remuneraciones, horas extraordinarias, feriados, gratificaciones, indemnizaciones de cualquier naturaleza, u otro concepto laboral o previsional.',
        leftCol, y,
        { width: pageWidth, align: 'justify', lineGap: 3 },
      )
      y = (doc as any).y + 15

      doc.text(
        'Asimismo, el trabajador declara que las cotizaciones previsionales se encuentran debidamente pagadas hasta el último día del mes anterior al del término de la relación laboral, conforme al artículo 177 del Código del Trabajo.',
        leftCol, y,
        { width: pageWidth, align: 'justify', lineGap: 3 },
      )
      y = (doc as any).y + 15

      doc.text(
        'El presente finiquito se firma en tres ejemplares, quedando uno en poder de cada parte y el tercero para el ministro de fe que lo ratifica.',
        leftCol, y,
        { width: pageWidth, align: 'justify', lineGap: 3 },
      )
      y = (doc as any).y + 15

      // City and date
      const termDate = new Date(data.date_termination + 'T12:00:00')
      doc.text(
        `${data.company_city || '_______________'}, ${termDate.getDate()} de ${MONTHS[termDate.getMonth()]} de ${termDate.getFullYear()}`,
        leftCol, y,
        { width: pageWidth, align: 'center' },
      )
      y = (doc as any).y + 30

      // ── Signatures ────────────────────────────────────────────

      // Check if we need a new page for signatures
      if (y > doc.page.height - 160) {
        doc.addPage()
        y = 60
      }

      const sigWidth = 140
      const totalSigWidth = sigWidth * 3
      const sigGap = (pageWidth - totalSigWidth) / 4
      const sig1X = leftCol + sigGap
      const sig2X = leftCol + sigGap * 2 + sigWidth
      const sig3X = leftCol + sigGap * 3 + sigWidth * 2

      // Signature lines
      doc.moveTo(sig1X, y).lineTo(sig1X + sigWidth, y).lineWidth(0.5).stroke('#333333')
      doc.moveTo(sig2X, y).lineTo(sig2X + sigWidth, y).lineWidth(0.5).stroke('#333333')
      doc.moveTo(sig3X, y).lineTo(sig3X + sigWidth, y).lineWidth(0.5).stroke('#333333')

      doc.font(FONT_BOLD).fontSize(8)
      doc.text('FIRMA EMPLEADOR', sig1X, y + 5, { width: sigWidth, align: 'center' })
      doc.text('FIRMA TRABAJADOR', sig2X, y + 5, { width: sigWidth, align: 'center' })
      doc.text('MINISTRO DE FE', sig3X, y + 5, { width: sigWidth, align: 'center' })

      // ── Footer ────────────────────────────────────────────────
      doc.font(FONT_REGULAR).fontSize(7)
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
