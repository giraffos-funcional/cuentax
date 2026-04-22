/**
 * CUENTAX — Cost Center P&L PDF
 * ================================
 * Multi-page PDF with:
 *   - Page 1: consolidated summary (all centers side-by-side)
 *   - Pages 2..N: one page per cost center with detailed P&L
 */

import PDFDocument from 'pdfkit'
import type { CostCenterPnlReport } from './cost-center.service'

export interface CostCenterPnlPdfData {
  country: 'CL' | 'US'
  company_name: string
  company_tax_id: string
  report: CostCenterPnlReport
}

interface Labels {
  title: string
  subtitle: string
  summary: string
  perCenter: string
  center: string
  revenue: string
  expenses: string
  netIncome: string
  netLoss: string
  account: string
  amount: string
  total: string
  totals: string
  period: string
  taxId: string
  issued: string
  noData: string
  months: readonly string[]
}

const L: { CL: Labels; US: Labels } = {
  CL: {
    title: 'Estado de Resultados por Centro de Costo',
    subtitle: 'Análisis por dimensión analítica',
    summary: 'Resumen Consolidado',
    perCenter: 'Detalle por Centro',
    center: 'Centro',
    revenue: 'Ingresos',
    expenses: 'Gastos',
    netIncome: 'Utilidad',
    netLoss: 'Pérdida',
    account: 'Cuenta',
    amount: 'Monto',
    total: 'Total',
    totals: 'Totales',
    period: 'Período',
    taxId: 'RUT',
    issued: 'Emitido',
    noData: 'Sin movimientos',
    months: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  },
  US: {
    title: 'Profit & Loss by Cost Center',
    subtitle: 'Analysis by analytic dimension',
    summary: 'Consolidated Summary',
    perCenter: 'Per-Center Detail',
    center: 'Center',
    revenue: 'Revenue',
    expenses: 'Expenses',
    netIncome: 'Net Income',
    netLoss: 'Net Loss',
    account: 'Account',
    amount: 'Amount',
    total: 'Total',
    totals: 'Totals',
    period: 'Period',
    taxId: 'EIN',
    issued: 'Issued',
    noData: 'No activity',
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  },
}

function formatMoney(amount: number, currency: 'CLP' | 'USD'): string {
  if (currency === 'CLP') return `$${Math.round(amount).toLocaleString('es-CL')}`
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function periodLabel(data: CostCenterPnlPdfData): string {
  const l = L[data.country]
  const p = data.report.period
  if (p.month) return `${l.months[p.month - 1]} ${p.year}`
  return `${data.country === 'CL' ? 'Año' : 'Year'} ${p.year}`
}

export function generateCostCenterPnlPdf(data: CostCenterPnlPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
      })
      const chunks: Buffer[] = []
      doc.on('data', (c) => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const l = L[data.country]
      const cur = data.report.currency

      // ─── Page 1: Summary ──────────────────────────────────
      drawHeader(doc, data, l, true)

      doc.font('Helvetica-Bold').fontSize(14).fillColor('#000').text(l.summary)
      doc.moveDown(0.3)

      // Table header
      const colX = { name: 50, rev: 270, exp: 370, net: 470 }
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#666')
      doc.text(l.center,    colX.name, doc.y, { continued: false })
      doc.text(l.revenue,   colX.rev,  doc.y - 11, { width: 95, align: 'right' })
      doc.text(l.expenses,  colX.exp,  doc.y - 11, { width: 95, align: 'right' })
      doc.text(l.netIncome, colX.net,  doc.y - 11, { width: 95, align: 'right' })
      doc.moveDown(0.2)
      drawHr(doc, '#ccc')

      doc.font('Helvetica').fontSize(10).fillColor('#333')
      for (const c of data.report.by_center) {
        const y = doc.y
        doc.fillColor('#333').text(c.cost_center_name.slice(0, 40), colX.name, y, { width: 200 })
        doc.text(formatMoney(c.total_revenue, cur),  colX.rev, y, { width: 95, align: 'right' })
        doc.text(formatMoney(c.total_expenses, cur), colX.exp, y, { width: 95, align: 'right' })
        doc.fillColor(c.net_income >= 0 ? '#0a5f2d' : '#a01020')
           .text(formatMoney(c.net_income, cur), colX.net, y, { width: 95, align: 'right' })
        doc.fillColor('#333')
        doc.moveDown(0.25)
      }

      drawHr(doc, '#000', 2)
      doc.moveDown(0.2)
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000')
      const totalsY = doc.y
      doc.text(l.totals, colX.name, totalsY, { width: 200 })
      doc.text(formatMoney(data.report.totals.revenue, cur),  colX.rev, totalsY, { width: 95, align: 'right' })
      doc.text(formatMoney(data.report.totals.expenses, cur), colX.exp, totalsY, { width: 95, align: 'right' })
      const net = data.report.totals.net_income
      doc.fillColor(net >= 0 ? '#0a5f2d' : '#a01020')
         .text(formatMoney(net, cur), colX.net, totalsY, { width: 95, align: 'right' })
      doc.fillColor('#333')

      // ─── Pages 2..N: one per cost center ──────────────────
      if (data.report.by_center.length > 0) {
        doc.addPage()
        drawHeader(doc, data, l, false)
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#000').text(l.perCenter)
        doc.moveDown(0.5)
      }

      for (let idx = 0; idx < data.report.by_center.length; idx++) {
        const c = data.report.by_center[idx]
        if (idx > 0) { doc.addPage(); drawHeader(doc, data, l, false) }
        drawCenterDetail(doc, c, l, cur)
      }

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

function drawHeader(doc: PDFKit.PDFDocument, data: CostCenterPnlPdfData, l: Labels, first: boolean): void {
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#000')
  doc.text(l.title, { align: 'center' })
  doc.font('Helvetica').fontSize(9).fillColor('#666')
  doc.text(l.subtitle, { align: 'center' })
  doc.moveDown(0.4)
  doc.fontSize(11).fillColor('#333').text(data.company_name, { align: 'center' })
  doc.fontSize(8).fillColor('#888').text(`${l.taxId}: ${data.company_tax_id}`, { align: 'center' })
  doc.moveDown(0.3)
  doc.fontSize(10).fillColor('#333').text(`${l.period}: ${periodLabel(data)}`, { align: 'center' })
  if (first) {
    doc.fontSize(8).fillColor('#888').text(`${l.issued}: ${new Date().toISOString().slice(0, 10)}`, { align: 'center' })
  }
  doc.moveDown(0.8)
  drawHr(doc, '#333')
  doc.moveDown(0.5)
}

function drawCenterDetail(
  doc: PDFKit.PDFDocument,
  c: CostCenterPnlReport['by_center'][number],
  l: Labels,
  cur: 'CLP' | 'USD',
): void {
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text(c.cost_center_name)
  doc.moveDown(0.4)

  // Revenue
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0a5f2d').text(l.revenue)
  doc.moveDown(0.2)
  if (c.revenue_by_account.length === 0) {
    doc.font('Helvetica').fontSize(9).fillColor('#999').text('  ' + l.noData)
  } else {
    doc.font('Helvetica').fontSize(10).fillColor('#333')
    for (const r of c.revenue_by_account) {
      const y = doc.y
      doc.text('  ' + r.account.slice(0, 50), 50, y, { width: 400 })
      doc.text(formatMoney(r.amount, cur), 50, y, { width: 512, align: 'right' })
      doc.moveDown(0.18)
    }
  }
  doc.moveDown(0.2)
  drawTotalRow(doc, `${l.total} ${l.revenue}`, formatMoney(c.total_revenue, cur), '#0a5f2d')
  doc.moveDown(0.6)

  // Expenses
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#a01020').text(l.expenses)
  doc.moveDown(0.2)
  if (c.expense_by_account.length === 0) {
    doc.font('Helvetica').fontSize(9).fillColor('#999').text('  ' + l.noData)
  } else {
    doc.font('Helvetica').fontSize(10).fillColor('#333')
    for (const r of c.expense_by_account) {
      const y = doc.y
      doc.text('  ' + r.account.slice(0, 50), 50, y, { width: 400 })
      doc.text(formatMoney(r.amount, cur), 50, y, { width: 512, align: 'right' })
      doc.moveDown(0.18)
    }
  }
  doc.moveDown(0.2)
  drawTotalRow(doc, `${l.total} ${l.expenses}`, formatMoney(c.total_expenses, cur), '#a01020')
  doc.moveDown(0.6)

  // Net
  drawHr(doc, '#000', 2)
  doc.moveDown(0.3)
  const netColor = c.net_income >= 0 ? '#0a5f2d' : '#a01020'
  const netLabel = c.net_income >= 0 ? l.netIncome : l.netLoss
  doc.font('Helvetica-Bold').fontSize(13).fillColor(netColor)
  const y = doc.y
  doc.text(netLabel, 50, y, { width: 400 })
  doc.text(formatMoney(c.net_income, cur), 50, y, { width: 512, align: 'right' })
  doc.fillColor('#333')
}

function drawTotalRow(doc: PDFKit.PDFDocument, label: string, value: string, color: string): void {
  doc.font('Helvetica-Bold').fontSize(10).fillColor(color)
  const y = doc.y
  doc.text(label, 50, y, { width: 400 })
  doc.text(value, 50, y, { width: 512, align: 'right' })
  doc.fillColor('#333').font('Helvetica').fontSize(10)
}

function drawHr(doc: PDFKit.PDFDocument, color: string, width: number = 1): void {
  doc.strokeColor(color).lineWidth(width)
     .moveTo(50, doc.y).lineTo(562, doc.y).stroke().lineWidth(1)
  doc.moveDown(0.1)
}
