/**
 * CUENTAX -- Certificado Laboral PDF Generator
 * =============================================
 * Generates Chilean employment certificates (Certificado Laboral).
 * Shows: employee name, RUT, position, seniority, contract type.
 * Uses PDFKit for layout and rendering.
 */

import PDFDocument from 'pdfkit'

// -- Types ------------------------------------------------------------------

export interface CertificadoLaboralData {
  // Company
  company_name: string
  company_rut: string
  company_address: string
  company_city: string
  company_logo?: string // base64
  rep_legal_name: string
  rep_legal_rut: string

  // Employee
  employee_name: string
  employee_rut: string
  job_title: string
  department: string

  // Contract
  contract_type: string // "indefinido", "plazo_fijo", "obra_faena"
  start_date: string    // YYYY-MM-DD
  wage: number

  // Metadata
  issue_date: string    // YYYY-MM-DD
}

// -- Helpers ----------------------------------------------------------------

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`
}

function formatCLP(amount: number): string {
  return '$' + Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '.-'
}

function contractTypeLabel(type: string): string {
  switch (type.toLowerCase()) {
    case 'indefinido': return 'Contrato Indefinido'
    case 'plazo_fijo': return 'Contrato a Plazo Fijo'
    case 'obra_faena': return 'Contrato por Obra o Faena'
    default: return type
  }
}

function computeAntiguedad(startDate: string, endDate: string): string {
  const start = new Date(startDate + 'T12:00:00')
  const end = new Date(endDate + 'T12:00:00')

  let years = end.getFullYear() - start.getFullYear()
  let months = end.getMonth() - start.getMonth()

  if (months < 0) {
    years--
    months += 12
  }

  const parts: string[] = []
  if (years > 0) parts.push(`${years} ${years === 1 ? 'año' : 'años'}`)
  if (months > 0) parts.push(`${months} ${months === 1 ? 'mes' : 'meses'}`)
  if (parts.length === 0) return 'menos de un mes'
  return parts.join(' y ')
}

// -- PDF Generator ----------------------------------------------------------

export async function generateCertificadoLaboralPDF(data: CertificadoLaboralData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []

    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      info: {
        Title: `Certificado Laboral - ${data.employee_name}`,
        Author: data.company_name,
        Subject: 'Certificado Laboral',
      },
    })

    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const PAGE_WIDTH = 612 // Letter width in points
    const CONTENT_WIDTH = PAGE_WIDTH - 72 - 72
    const LEFT = 72
    const FONT_REGULAR = 'Helvetica'
    const FONT_BOLD = 'Helvetica-Bold'

    const antiguedad = computeAntiguedad(data.start_date, data.issue_date)

    // -- Company header --
    let y = 72

    if (data.company_logo) {
      try {
        const logoBuffer = Buffer.from(data.company_logo, 'base64')
        doc.image(logoBuffer, LEFT, y, { width: 70, height: 70 })
        doc.font(FONT_BOLD).fontSize(12)
        doc.text(data.company_name, LEFT + 85, y + 8)
        doc.font(FONT_REGULAR).fontSize(9)
        doc.text(`RUT: ${data.company_rut}`, LEFT + 85, y + 24)
        doc.text(data.company_address, LEFT + 85, y + 36)
        doc.text(data.company_city, LEFT + 85, y + 48)
        y += 85
      } catch {
        doc.font(FONT_BOLD).fontSize(12)
        doc.text(data.company_name, LEFT, y)
        doc.font(FONT_REGULAR).fontSize(9)
        doc.text(`RUT: ${data.company_rut}`, LEFT, y + 16)
        doc.text(data.company_address, LEFT, y + 28)
        doc.text(data.company_city, LEFT, y + 40)
        y += 55
      }
    } else {
      doc.font(FONT_BOLD).fontSize(12)
      doc.text(data.company_name, LEFT, y)
      doc.font(FONT_REGULAR).fontSize(9)
      doc.text(`RUT: ${data.company_rut}`, LEFT, y + 16)
      doc.text(data.company_address, LEFT, y + 28)
      doc.text(data.company_city, LEFT, y + 40)
      y += 55
    }

    // -- Separator --
    y += 10
    doc.moveTo(LEFT, y).lineTo(LEFT + CONTENT_WIDTH, y).lineWidth(1).stroke('#7c3aed')
    y += 30

    // -- Title --
    doc.font(FONT_BOLD).fontSize(16)
    doc.text('CERTIFICADO LABORAL', LEFT, y, {
      align: 'center',
      width: CONTENT_WIDTH,
    })
    y += 40

    // -- Body --
    doc.font(FONT_REGULAR).fontSize(11)

    const bodyText =
      `Por medio del presente, ${data.company_name}, RUT ${data.company_rut}, ` +
      `representada legalmente por don/doña ${data.rep_legal_name}, RUT ${data.rep_legal_rut}, ` +
      `certifica que:`

    doc.text(bodyText, LEFT, y, {
      width: CONTENT_WIDTH,
      align: 'justify',
      lineGap: 4,
    })
    y = doc.y + 25

    // -- Employee data block --
    const LABEL_X = LEFT + 30
    const VALUE_X = LEFT + 190
    const ROW_H = 22

    function dataRow(label: string, value: string) {
      doc.font(FONT_BOLD).fontSize(11)
      doc.text(label, LABEL_X, y, { width: 155 })
      doc.font(FONT_REGULAR).fontSize(11)
      doc.text(value, VALUE_X, y, { width: CONTENT_WIDTH - 190 })
      y += ROW_H
    }

    dataRow('Nombre:', data.employee_name)
    dataRow('RUT:', data.employee_rut)
    dataRow('Cargo:', data.job_title || 'No especificado')
    if (data.department) {
      dataRow('Departamento:', data.department)
    }
    dataRow('Tipo de Contrato:', contractTypeLabel(data.contract_type))
    dataRow('Fecha de Ingreso:', formatDateLong(data.start_date))
    dataRow('Antigüedad:', antiguedad)
    dataRow('Remuneración Bruta:', formatCLP(data.wage))

    y += 15

    // -- Closing text --
    doc.font(FONT_REGULAR).fontSize(11)
    doc.text(
      `Se extiende el presente certificado a petición del/la interesado/a, para los fines que estime convenientes.`,
      LEFT, y, { width: CONTENT_WIDTH, align: 'justify', lineGap: 4 },
    )
    y = doc.y + 15

    doc.text(
      `${data.company_city}, ${formatDateLong(data.issue_date)}.`,
      LEFT, y, { width: CONTENT_WIDTH, align: 'left' },
    )
    y = doc.y + 60

    // -- Signature --
    const SIG_WIDTH = 200
    const sigX = LEFT + (CONTENT_WIDTH - SIG_WIDTH) / 2

    doc.moveTo(sigX, y).lineTo(sigX + SIG_WIDTH, y).lineWidth(0.5).stroke('#333333')
    y += 5

    doc.font(FONT_BOLD).fontSize(9)
    doc.text(data.rep_legal_name, sigX, y, { width: SIG_WIDTH, align: 'center' })
    y += 12
    doc.font(FONT_REGULAR).fontSize(8)
    doc.text(`RUT: ${data.rep_legal_rut}`, sigX, y, { width: SIG_WIDTH, align: 'center' })
    y += 10
    doc.text(`Representante Legal`, sigX, y, { width: SIG_WIDTH, align: 'center' })
    y += 10
    doc.text(data.company_name, sigX, y, { width: SIG_WIDTH, align: 'center' })

    doc.end()
  })
}
