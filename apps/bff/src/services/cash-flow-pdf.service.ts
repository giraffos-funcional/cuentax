/**
 * CUENTAX — Cash Flow Statement PDF
 */

import PDFDocument from 'pdfkit'
import type { CashFlowReport, CashFlowSection } from './cash-flow.service'

export interface CashFlowPdfData {
  country: 'CL' | 'US'
  company_name: string
  company_tax_id: string
  report: CashFlowReport
}

interface Labels {
  title: string
  subtitle: string
  period: string
  operating: string
  investing: string
  financing: string
  openingCash: string
  closingCash: string
  netChange: string
  subtotal: string
  taxId: string
  issued: string
  empty: string
  months: readonly string[]
}

const L: { CL: Labels; US: Labels } = {
  CL: {
    title: 'Estado de Flujo de Caja',
    subtitle: 'Método Directo',
    period: 'Período',
    operating: 'Actividades Operacionales',
    investing: 'Actividades de Inversión',
    financing: 'Actividades de Financiamiento',
    openingCash: 'Saldo Inicial',
    closingCash: 'Saldo Final',
    netChange: 'Variación Neta',
    subtotal: 'Subtotal',
    taxId: 'RUT',
    issued: 'Emitido',
    empty: 'Sin movimientos',
    months: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  },
  US: {
    title: 'Cash Flow Statement',
    subtitle: 'Direct Method',
    period: 'Period',
    operating: 'Operating Activities',
    investing: 'Investing Activities',
    financing: 'Financing Activities',
    openingCash: 'Opening Cash',
    closingCash: 'Closing Cash',
    netChange: 'Net Change',
    subtotal: 'Subtotal',
    taxId: 'EIN',
    issued: 'Issued',
    empty: 'No activity',
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  },
}

function fmt(amount: number, currency: 'CLP' | 'USD'): string {
  if (currency === 'CLP') return `$${Math.round(amount).toLocaleString('es-CL')}`
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function periodLabel(report: CashFlowReport, l: Labels, country: 'CL' | 'US'): string {
  if (report.period.month) return `${l.months[report.period.month - 1]} ${report.period.year}`
  return `${country === 'CL' ? 'Año' : 'Year'} ${report.period.year}`
}

export function generateCashFlowPdf(data: CashFlowPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margins: { top: 50, bottom: 50, left: 50, right: 50 } })
      const chunks: Buffer[] = []
      doc.on('data', (c) => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const l = L[data.country]
      const cur = data.report.currency

      // Header
      doc.font('Helvetica-Bold').fontSize(20).fillColor('#000').text(l.title, { align: 'center' })
      doc.font('Helvetica').fontSize(10).fillColor('#666').text(l.subtitle, { align: 'center' })
      doc.moveDown(0.5)
      doc.fontSize(11).fillColor('#333').text(data.company_name, { align: 'center' })
      doc.fontSize(8).fillColor('#888').text(`${l.taxId}: ${data.company_tax_id}`, { align: 'center' })
      doc.moveDown(0.3)
      doc.fontSize(10).fillColor('#333').text(`${l.period}: ${periodLabel(data.report, l, data.country)}`, { align: 'center' })
      doc.fontSize(8).fillColor('#888').text(`${l.issued}: ${new Date().toISOString().slice(0, 10)}`, { align: 'center' })
      doc.moveDown(0.8)
      drawHr(doc, '#333')
      doc.moveDown(0.4)

      // Opening cash
      drawTotal(doc, l.openingCash, fmt(data.report.opening_cash, cur), '#333')
      doc.moveDown(0.8)

      // Sections
      drawSection(doc, data.report.operating, l.operating, l, cur)
      drawSection(doc, data.report.investing, l.investing, l, cur)
      drawSection(doc, data.report.financing, l.financing, l, cur)

      // Net change
      doc.moveDown(0.3)
      drawHr(doc, '#000', 2)
      drawTotal(doc, l.netChange, fmt(data.report.net_change, cur),
                data.report.net_change >= 0 ? '#0a5f2d' : '#a01020')
      doc.moveDown(0.4)
      drawTotal(doc, l.closingCash, fmt(data.report.closing_cash, cur), '#000')

      doc.end()
    } catch (err) { reject(err) }
  })
}

function drawSection(
  doc: PDFKit.PDFDocument, section: CashFlowSection, header: string, l: Labels, cur: 'CLP' | 'USD',
): void {
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#000').text(header)
  doc.moveDown(0.2)
  doc.font('Helvetica').fontSize(10).fillColor('#333')
  if (section.lines.length === 0) {
    doc.fillColor('#999').text('  ' + l.empty, 50, doc.y)
    doc.moveDown(0.2)
  } else {
    for (const line of section.lines) {
      const y = doc.y
      doc.fillColor('#333').text('  ' + line.source_account.slice(0, 55), 50, y, { width: 400 })
      doc.fillColor(line.amount >= 0 ? '#0a5f2d' : '#a01020')
         .text(fmt(line.amount, cur), 50, y, { width: 512, align: 'right' })
      doc.moveDown(0.15)
    }
  }
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#555')
  const y = doc.y
  doc.text('  ' + l.subtotal, 50, y, { width: 400 })
  doc.text(fmt(section.subtotal, cur), 50, y, { width: 512, align: 'right' })
  doc.font('Helvetica').fontSize(10).fillColor('#333')
  doc.moveDown(0.6)
}

function drawTotal(doc: PDFKit.PDFDocument, label: string, value: string, color: string): void {
  doc.font('Helvetica-Bold').fontSize(12).fillColor(color)
  const y = doc.y
  doc.text(label, 50, y, { width: 400 })
  doc.text(value, 50, y, { width: 512, align: 'right' })
  doc.font('Helvetica').fontSize(10).fillColor('#333')
}

function drawHr(doc: PDFKit.PDFDocument, color: string, width: number = 1): void {
  doc.strokeColor(color).lineWidth(width).moveTo(50, doc.y).lineTo(562, doc.y).stroke().lineWidth(1)
  doc.moveDown(0.2)
}
