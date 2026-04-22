/**
 * CUENTAX — Balance Sheet PDF
 * Bilingual (CL Estado de Situación / US Balance Sheet).
 */

import PDFDocument from 'pdfkit'
import type { BalanceSheetReport, BalanceSheetSection } from './balance-sheet.service'

export interface BalanceSheetPdfData {
  country: 'CL' | 'US'
  company_name: string
  company_tax_id: string
  report: BalanceSheetReport
}

interface Labels {
  title: string
  subtitle: string
  asOf: string
  assets: string
  currentAssets: string
  fixedAssets: string
  otherAssets: string
  totalAssets: string
  liabilities: string
  currentLiab: string
  longTermLiab: string
  totalLiab: string
  equity: string
  totalEquity: string
  liabEq: string
  taxId: string
  issued: string
  account: string
  empty: string
  balanced: string
  unbalanced: string
}

const L: { CL: Labels; US: Labels } = {
  CL: {
    title: 'Estado de Situación Financiera',
    subtitle: 'Balance General',
    asOf: 'Al',
    assets: 'ACTIVOS',
    currentAssets: 'Activos Corrientes',
    fixedAssets: 'Activos Fijos',
    otherAssets: 'Otros Activos',
    totalAssets: 'Total Activos',
    liabilities: 'PASIVOS',
    currentLiab: 'Pasivos Corrientes',
    longTermLiab: 'Pasivos Largo Plazo',
    totalLiab: 'Total Pasivos',
    equity: 'PATRIMONIO',
    totalEquity: 'Total Patrimonio',
    liabEq: 'Total Pasivos + Patrimonio',
    taxId: 'RUT',
    issued: 'Emitido',
    account: 'Cuenta',
    empty: '—',
    balanced: '✓ Cuadrado',
    unbalanced: '⚠ Diferencia',
  },
  US: {
    title: 'Balance Sheet',
    subtitle: 'Statement of Financial Position',
    asOf: 'As of',
    assets: 'ASSETS',
    currentAssets: 'Current Assets',
    fixedAssets: 'Fixed Assets',
    otherAssets: 'Other Assets',
    totalAssets: 'Total Assets',
    liabilities: 'LIABILITIES',
    currentLiab: 'Current Liabilities',
    longTermLiab: 'Long-term Liabilities',
    totalLiab: 'Total Liabilities',
    equity: 'EQUITY',
    totalEquity: 'Total Equity',
    liabEq: 'Total Liabilities + Equity',
    taxId: 'EIN',
    issued: 'Issued',
    account: 'Account',
    empty: '—',
    balanced: '✓ Balanced',
    unbalanced: '⚠ Variance',
  },
}

function fmt(amount: number, currency: 'CLP' | 'USD'): string {
  if (currency === 'CLP') return `$${Math.round(amount).toLocaleString('es-CL')}`
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function generateBalanceSheetPdf(data: BalanceSheetPdfData): Promise<Buffer> {
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
      doc.fontSize(10).fillColor('#333').text(`${l.asOf} ${data.report.as_of_date}`, { align: 'center' })
      doc.fontSize(8).fillColor('#888').text(`${l.issued}: ${new Date().toISOString().slice(0, 10)}`, { align: 'center' })
      doc.moveDown(0.8)
      drawHr(doc, '#333')
      doc.moveDown(0.4)

      // ASSETS
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#000').text(l.assets)
      doc.moveDown(0.3)
      drawSection(doc, data.report.current_assets, l.currentAssets, cur)
      drawSection(doc, data.report.fixed_assets, l.fixedAssets, cur)
      drawSection(doc, data.report.other_assets, l.otherAssets, cur)
      doc.moveDown(0.3)
      drawHr(doc, '#000', 2)
      drawTotal(doc, l.totalAssets, fmt(data.report.total_assets, cur), '#000')
      doc.moveDown(1)

      // LIABILITIES
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#000').text(l.liabilities)
      doc.moveDown(0.3)
      drawSection(doc, data.report.current_liabilities, l.currentLiab, cur)
      drawSection(doc, data.report.long_term_liabilities, l.longTermLiab, cur)
      doc.moveDown(0.2)
      drawTotal(doc, l.totalLiab, fmt(data.report.total_liabilities, cur), '#333')
      doc.moveDown(0.6)

      // EQUITY
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#000').text(l.equity)
      doc.moveDown(0.3)
      drawSection(doc, data.report.equity, '', cur)
      doc.moveDown(0.2)
      drawTotal(doc, l.totalEquity, fmt(data.report.total_equity, cur), '#333')
      doc.moveDown(0.5)
      drawHr(doc, '#000', 2)
      drawTotal(doc, l.liabEq, fmt(data.report.total_liabilities + data.report.total_equity, cur), '#000')

      // Balance check
      doc.moveDown(0.8)
      const balanced = Math.abs(data.report.unbalanced_by) < 1
      doc.fontSize(9).fillColor(balanced ? '#0a5f2d' : '#a01020')
         .text(balanced ? l.balanced : `${l.unbalanced}: ${fmt(data.report.unbalanced_by, cur)}`, { align: 'center' })

      doc.end()
    } catch (err) { reject(err) }
  })
}

function drawSection(doc: PDFKit.PDFDocument, section: BalanceSheetSection, header: string, cur: 'CLP' | 'USD'): void {
  if (header) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#333')
    doc.text(header, 50, doc.y)
    doc.moveDown(0.2)
  }
  doc.font('Helvetica').fontSize(10).fillColor('#333')
  if (section.lines.length === 0) {
    doc.fillColor('#999').text('  —', 50, doc.y)
    doc.moveDown(0.2)
  } else {
    for (const line of section.lines) {
      const y = doc.y
      const label = line.code ? `${line.code} ${line.name}` : line.name
      doc.fillColor('#333').text('  ' + label.slice(0, 55), 50, y, { width: 400 })
      doc.fillColor('#333').text(fmt(line.balance, cur), 50, y, { width: 512, align: 'right' })
      doc.moveDown(0.15)
    }
  }
  if (header) {
    // Subtotal under the section header
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#555')
    const y = doc.y
    doc.text('  Subtotal', 50, y, { width: 400 })
    doc.text(fmt(section.subtotal, cur), 50, y, { width: 512, align: 'right' })
    doc.moveDown(0.4)
    doc.font('Helvetica').fontSize(10).fillColor('#333')
  }
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
