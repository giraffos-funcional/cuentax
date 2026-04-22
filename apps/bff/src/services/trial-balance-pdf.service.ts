/**
 * CUENTAX — Trial Balance PDF (Balance de Comprobación / Trial Balance)
 */

import PDFDocument from 'pdfkit'
import type { TrialBalanceReport } from './trial-balance.service'

export interface TrialBalancePdfData {
  country: 'CL' | 'US'
  company_name: string
  company_tax_id: string
  report: TrialBalanceReport
}

function fmt(amount: number, currency: 'CLP' | 'USD'): string {
  if (currency === 'CLP') return `$${Math.round(amount).toLocaleString('es-CL')}`
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function generateTrialBalancePdf(data: TrialBalancePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margins: { top: 40, bottom: 40, left: 40, right: 40 } })
      const chunks: Buffer[] = []
      doc.on('data', (c) => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const isCL = data.country === 'CL'
      const L = isCL
        ? { title: 'Balance de Comprobación', subtitle: 'Trial Balance', period: 'Período', account: 'Cuenta', opening: 'Saldo Inicial', debit: 'Débitos', credit: 'Créditos', closing: 'Saldo Final', totals: 'Totales', balanced: '✓ Cuadrado', unbalanced: '⚠ No cuadra', taxId: 'RUT' }
        : { title: 'Trial Balance', subtitle: 'Balance de Comprobación', period: 'Period', account: 'Account', opening: 'Opening', debit: 'Debit', credit: 'Credit', closing: 'Closing', totals: 'Totals', balanced: '✓ Balanced', unbalanced: '⚠ Not balanced', taxId: 'EIN' }

      // Header
      doc.font('Helvetica-Bold').fontSize(18).fillColor('#000').text(L.title, { align: 'center' })
      doc.font('Helvetica').fontSize(9).fillColor('#666').text(L.subtitle, { align: 'center' })
      doc.moveDown(0.3)
      doc.fontSize(10).fillColor('#333').text(data.company_name, { align: 'center' })
      doc.fontSize(8).fillColor('#888').text(`${L.taxId}: ${data.company_tax_id}`, { align: 'center' })
      doc.fontSize(9).fillColor('#333').text(`${L.period}: ${data.report.period.from} → ${data.report.period.to}`, { align: 'center' })
      doc.moveDown(0.6)

      // Table
      const cur = data.report.currency
      const colX = { code: 40, name: 100, opening: 410, debit: 530, credit: 640, closing: 720 }

      // Header row
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#666')
      doc.text(L.account + ' #', colX.code, doc.y)
      doc.text(L.account, colX.name, doc.y - 10)
      doc.text(L.opening, colX.opening, doc.y - 10, { width: 110, align: 'right' })
      doc.text(L.debit,   colX.debit,   doc.y - 10, { width: 100, align: 'right' })
      doc.text(L.credit,  colX.credit,  doc.y - 10, { width: 90,  align: 'right' })
      doc.text(L.closing, colX.closing, doc.y - 10, { width: 100, align: 'right' })
      doc.moveDown(0.2)
      doc.strokeColor('#999').lineWidth(0.5).moveTo(40, doc.y).lineTo(820, doc.y).stroke()
      doc.moveDown(0.1)

      // Rows
      doc.font('Helvetica').fontSize(8).fillColor('#333')
      for (const r of data.report.rows) {
        if (doc.y > 560) { doc.addPage({ layout: 'landscape' }); doc.font('Helvetica').fontSize(8).fillColor('#333') }
        const y = doc.y
        doc.text(r.account_code || '—', colX.code, y, { width: 55 })
        doc.text(r.account_name.slice(0, 50), colX.name, y, { width: 300 })
        doc.text(fmt(r.opening_balance, cur), colX.opening, y, { width: 110, align: 'right' })
        doc.text(fmt(r.period_debit, cur),    colX.debit,   y, { width: 100, align: 'right' })
        doc.text(fmt(r.period_credit, cur),   colX.credit,  y, { width: 90,  align: 'right' })
        doc.text(fmt(r.closing_balance, cur), colX.closing, y, { width: 100, align: 'right' })
        doc.moveDown(0.12)
      }

      doc.strokeColor('#000').lineWidth(1.5).moveTo(40, doc.y + 3).lineTo(820, doc.y + 3).stroke()
      doc.moveDown(0.4)
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#000')
      const y2 = doc.y
      doc.text(L.totals, colX.name, y2)
      doc.text(fmt(data.report.totals.opening_balance, cur), colX.opening, y2, { width: 110, align: 'right' })
      doc.text(fmt(data.report.totals.period_debit, cur),    colX.debit,   y2, { width: 100, align: 'right' })
      doc.text(fmt(data.report.totals.period_credit, cur),   colX.credit,  y2, { width: 90,  align: 'right' })
      doc.text(fmt(data.report.totals.closing_balance, cur), colX.closing, y2, { width: 100, align: 'right' })

      doc.moveDown(0.8)
      doc.fontSize(8).fillColor(data.report.is_balanced ? '#0a5f2d' : '#a01020')
         .text(data.report.is_balanced ? L.balanced : L.unbalanced, { align: 'center' })

      doc.end()
    } catch (err) { reject(err) }
  })
}
