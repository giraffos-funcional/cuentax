/**
 * CUENTAX — Balance General PDF Generator
 * ========================================
 * Generates a Chilean Balance General (Balance Sheet) in PDF format using PDFKit.
 * A4 portrait layout with company header, activos/pasivos/patrimonio sections.
 */

import PDFDocument from 'pdfkit'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BalancePDFData {
  company_name: string
  company_rut: string
  periodo: { year: number; mes: number }
  activos: { corrientes: number; no_corrientes: number; total: number }
  pasivos: { corrientes: number; no_corrientes: number; total: number }
  patrimonio: { capital: number; resultado: number; total: number }
  cuadra: boolean
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

// ---------------------------------------------------------------------------
// Month names
// ---------------------------------------------------------------------------

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// ---------------------------------------------------------------------------
// PDF Generation
// ---------------------------------------------------------------------------

/**
 * Generate a Chilean Balance General PDF.
 * Returns a Buffer containing the PDF data.
 * Uses A4 portrait layout.
 */
export async function generateBalancePDF(data: BalancePDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'portrait',
        margins: { top: 40, bottom: 40, left: 50, right: 50 },
      })

      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const pageWidth = doc.page.width - 100 // 50pt margins each side
      const leftCol = 50
      const mesLabel = MONTHS[data.periodo.mes - 1] ?? ''
      const lastDay = new Date(data.periodo.year, data.periodo.mes, 0).getDate()

      // ── Company Header ──────────────────────────────────────

      doc.font('Helvetica-Bold').fontSize(11)
      doc.text(data.company_name, leftCol, 40)
      doc.font('Helvetica').fontSize(9)
      doc.text(`RUT: ${data.company_rut}`, leftCol, 54)

      // ── Title ───────────────────────────────────────────────

      let y = 80
      doc.font('Helvetica-Bold').fontSize(16)
      doc.text('BALANCE GENERAL', leftCol, y, { width: pageWidth, align: 'center' })
      y += 22

      doc.font('Helvetica').fontSize(10)
      doc.text(
        `Al ${lastDay} de ${mesLabel} de ${data.periodo.year}`,
        leftCol, y,
        { width: pageWidth, align: 'center' },
      )
      y += 20

      // ── Separator ───────────────────────────────────────────

      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(0.5).stroke()
      y += 20

      // ── Helper: draw a section row ──────────────────────────

      const labelX = leftCol + 20
      const amountX = leftCol + pageWidth - 120
      const amountW = 120

      function drawRow(label: string, amount: number, atY: number, opts?: { bold?: boolean; indent?: boolean; highlight?: boolean }): number {
        const indent = opts?.indent ? 20 : 0

        if (opts?.highlight) {
          doc.rect(leftCol, atY - 3, pageWidth, 20).fill('#f0f4ff')
          doc.fillColor('#000000')
        }

        doc.font(opts?.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts?.bold ? 10 : 9)
        doc.fillColor(opts?.bold ? '#111827' : '#374151')
        doc.text(label, labelX + indent, atY, { width: pageWidth - amountW - 40 })
        doc.text(formatCLP(amount), amountX, atY, { width: amountW, align: 'right' })
        doc.fillColor('#000000')
        return atY + (opts?.bold ? 22 : 18)
      }

      function drawSectionTitle(title: string, atY: number): number {
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827')
        doc.text(title, leftCol, atY)
        doc.fillColor('#000000')
        atY += 18
        doc.moveTo(leftCol, atY).lineTo(leftCol + pageWidth, atY).lineWidth(0.3).strokeColor('#d1d5db').stroke()
        doc.strokeColor('#000000')
        return atY + 10
      }

      // ── ACTIVOS Section ─────────────────────────────────────

      y = drawSectionTitle('ACTIVOS', y)
      y = drawRow('Activos Corrientes', data.activos.corrientes, y, { indent: true })
      y = drawRow('Activos No Corrientes', data.activos.no_corrientes, y, { indent: true })
      y += 4
      doc.moveTo(leftCol + 20, y - 2).lineTo(leftCol + pageWidth, y - 2).lineWidth(0.3).strokeColor('#d1d5db').stroke()
      doc.strokeColor('#000000')
      y = drawRow('TOTAL ACTIVOS', data.activos.total, y, { bold: true, highlight: true })
      y += 16

      // ── PASIVOS Y PATRIMONIO Section ────────────────────────

      y = drawSectionTitle('PASIVOS Y PATRIMONIO', y)

      // Pasivos sub-section
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#374151')
      doc.text('Pasivos', leftCol + 10, y)
      doc.fillColor('#000000')
      y += 16

      y = drawRow('Pasivos Corrientes', data.pasivos.corrientes, y, { indent: true })
      y = drawRow('Pasivos No Corrientes', data.pasivos.no_corrientes, y, { indent: true })
      y += 4
      doc.moveTo(leftCol + 20, y - 2).lineTo(leftCol + pageWidth, y - 2).lineWidth(0.3).strokeColor('#d1d5db').stroke()
      doc.strokeColor('#000000')
      y = drawRow('TOTAL PASIVOS', data.pasivos.total, y, { bold: true })
      y += 12

      // Patrimonio sub-section
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#374151')
      doc.text('Patrimonio', leftCol + 10, y)
      doc.fillColor('#000000')
      y += 16

      y = drawRow('Capital', data.patrimonio.capital, y, { indent: true })
      y = drawRow('Resultado del Ejercicio', data.patrimonio.resultado, y, { indent: true })
      y += 4
      doc.moveTo(leftCol + 20, y - 2).lineTo(leftCol + pageWidth, y - 2).lineWidth(0.3).strokeColor('#d1d5db').stroke()
      doc.strokeColor('#000000')
      y = drawRow('TOTAL PATRIMONIO', data.patrimonio.total, y, { bold: true })
      y += 8

      // Total Pasivos + Patrimonio
      const totalPasivoPatrimonio = data.pasivos.total + data.patrimonio.total
      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(1).stroke()
      y += 8
      y = drawRow('TOTAL PASIVOS + PATRIMONIO', totalPasivoPatrimonio, y, { bold: true, highlight: true })
      y += 20

      // ── Balance check ───────────────────────────────────────

      const checkLabel = data.cuadra ? 'Balance cuadra: Si' : 'Balance cuadra: No'
      const checkColor = data.cuadra ? '#059669' : '#dc2626'

      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(0.5).stroke()
      y += 10

      doc.font('Helvetica-Bold').fontSize(10).fillColor(checkColor)
      doc.text(checkLabel, leftCol, y, { width: pageWidth, align: 'center' })
      doc.fillColor('#000000')

      if (!data.cuadra) {
        y += 16
        const diff = Math.abs(data.activos.total - totalPasivoPatrimonio)
        doc.font('Helvetica').fontSize(9).fillColor('#dc2626')
        doc.text(`Diferencia: ${formatCLP(diff)}`, leftCol, y, { width: pageWidth, align: 'center' })
        doc.fillColor('#000000')
      }

      // ── Footer ──────────────────────────────────────────────

      const footerY = doc.page.height - 30
      doc.font('Helvetica').fontSize(7).fillColor('#9ca3af')
      doc.text(
        `Generado por CuentaX - ${new Date().toLocaleDateString('es-CL')}`,
        leftCol, footerY,
        { width: pageWidth / 2, align: 'left' },
      )
      doc.text(
        'Pagina 1',
        leftCol + pageWidth / 2, footerY,
        { width: pageWidth / 2, align: 'right' },
      )
      doc.fillColor('#000000')

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}
