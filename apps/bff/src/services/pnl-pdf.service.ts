/**
 * CUENTAX — P&L PDF Generator
 * ==============================
 * Generates an Income Statement (Profit & Loss) PDF from posted Odoo
 * journal entries. Works for both CL and US companies — formatting
 * (currency symbol, locale, language) follows the passed country code.
 */

import PDFDocument from 'pdfkit'

export interface PnlRow {
  account: string
  debit: number
  credit: number
  balance: number
}

export interface PnlData {
  country: 'CL' | 'US'
  currency: 'CLP' | 'USD'
  company_name: string
  company_tax_id: string
  period: { year: number; month: number | null; from: string; to: string }
  revenue: PnlRow[]
  expenses: PnlRow[]
  other: PnlRow[]
  totals: { revenue: number; expenses: number; net_income: number }
}

const L = {
  CL: {
    title: 'Estado de Resultados',
    revenue: 'Ingresos',
    expenses: 'Gastos',
    other: 'Otros',
    totalRev: 'Total Ingresos',
    totalExp: 'Total Gastos',
    netIncome: 'Utilidad Neta',
    netLoss: 'Pérdida Neta',
    period: 'Período',
    issued: 'Emitido',
    taxId: 'RUT',
    account: 'Cuenta',
    amount: 'Monto',
    company: 'Empresa',
    months: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  },
  US: {
    title: 'Profit & Loss Statement',
    revenue: 'Revenue',
    expenses: 'Expenses',
    other: 'Other',
    totalRev: 'Total Revenue',
    totalExp: 'Total Expenses',
    netIncome: 'Net Income',
    netLoss: 'Net Loss',
    period: 'Period',
    issued: 'Issued',
    taxId: 'EIN',
    account: 'Account',
    amount: 'Amount',
    company: 'Company',
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  },
} as const

function formatMoney(amount: number, currency: 'CLP' | 'USD'): string {
  if (currency === 'CLP') {
    return `$${Math.round(amount).toLocaleString('es-CL')}`
  }
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function periodLabel(data: PnlData): string {
  const l = L[data.country]
  if (data.period.month) {
    return `${l.months[data.period.month - 1]} ${data.period.year}`
  }
  return `${data.country === 'CL' ? 'Año' : 'Year'} ${data.period.year}`
}

/**
 * Build the P&L PDF and return it as a Buffer (ready to send as HTTP response).
 */
export function generatePnlPdf(data: PnlData): Promise<Buffer> {
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

      // ─── Header ──────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(20).text(l.title, { align: 'center' })
      doc.moveDown(0.3)
      doc.font('Helvetica').fontSize(11).text(data.company_name, { align: 'center' })
      doc.fontSize(9).fillColor('#666').text(`${l.taxId}: ${data.company_tax_id}`, { align: 'center' })
      doc.moveDown(0.5)
      doc.fontSize(11).fillColor('#333').text(`${l.period}: ${periodLabel(data)}`, { align: 'center' })
      doc.fontSize(8).fillColor('#888').text(`${l.issued}: ${new Date().toISOString().slice(0, 10)}`, { align: 'center' })
      doc.moveDown(1.5)
      doc.strokeColor('#333').moveTo(50, doc.y).lineTo(562, doc.y).stroke()
      doc.moveDown(0.5)

      // ─── Revenue ─────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text(l.revenue)
      doc.moveDown(0.3)
      doc.font('Helvetica').fontSize(10)
      if (data.revenue.length === 0) {
        doc.fillColor('#999').text('  —', { continued: false })
      } else {
        for (const row of data.revenue) {
          drawRow(doc, row.account, formatMoney(row.balance, data.currency))
        }
      }
      doc.moveDown(0.2)
      drawTotal(doc, l.totalRev, formatMoney(data.totals.revenue, data.currency))
      doc.moveDown(1)

      // ─── Expenses ────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text(l.expenses)
      doc.moveDown(0.3)
      doc.font('Helvetica').fontSize(10)
      if (data.expenses.length === 0) {
        doc.fillColor('#999').text('  —', { continued: false })
      } else {
        for (const row of data.expenses) {
          // For expenses, the "amount spent" is the debit total — balance is negative of that
          const amount = -row.balance
          drawRow(doc, row.account, formatMoney(amount, data.currency))
        }
      }
      doc.moveDown(0.2)
      drawTotal(doc, l.totalExp, formatMoney(data.totals.expenses, data.currency))
      doc.moveDown(1)

      // ─── Other income/expense ───────────────────────────────
      if (data.other.length > 0) {
        doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text(l.other)
        doc.moveDown(0.3)
        doc.font('Helvetica').fontSize(10)
        for (const row of data.other) {
          drawRow(doc, row.account, formatMoney(row.balance, data.currency))
        }
        doc.moveDown(1)
      }

      // ─── Net Income ──────────────────────────────────────────
      doc.strokeColor('#000').lineWidth(2).moveTo(50, doc.y).lineTo(562, doc.y).stroke()
      doc.moveDown(0.4)
      doc.lineWidth(1)

      const netLabel = data.totals.net_income >= 0 ? l.netIncome : l.netLoss
      const netColor = data.totals.net_income >= 0 ? '#0a5f2d' : '#a01020'
      doc.font('Helvetica-Bold').fontSize(14).fillColor(netColor)
      drawRow(doc, netLabel, formatMoney(data.totals.net_income, data.currency), true)

      // ─── Footer ──────────────────────────────────────────────
      doc.moveDown(3)
      doc.font('Helvetica').fontSize(7).fillColor('#aaa')
        .text(
          data.country === 'CL'
            ? 'Generado automáticamente por CuentaX desde asientos contables contabilizados. Para uso informativo.'
            : 'Generated automatically by CuentaX from posted journal entries. For informational use only.',
          { align: 'center' },
        )

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

function drawRow(doc: PDFKit.PDFDocument, label: string, value: string, emphasized = false): void {
  const y = doc.y
  const width = 512
  if (emphasized) {
    doc.text(label, 50, y, { continued: false, width: 400 })
    doc.text(value, 50, y, { width, align: 'right' })
  } else {
    doc.fillColor('#333').text('  ' + label, 50, y, { continued: false, width: 400 })
    doc.fillColor('#333').text(value, 50, y, { width, align: 'right' })
  }
  doc.moveDown(0.15)
}

function drawTotal(doc: PDFKit.PDFDocument, label: string, value: string): void {
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#000')
  const y = doc.y
  doc.text(label, 50, y, { continued: false, width: 400 })
  doc.text(value, 50, y, { width: 512, align: 'right' })
  doc.font('Helvetica').fontSize(10).fillColor('#333')
  doc.moveDown(0.2)
}
