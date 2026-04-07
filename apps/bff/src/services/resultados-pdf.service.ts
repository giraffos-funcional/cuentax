/**
 * CUENTAX — Estado de Resultados PDF Generator
 * ==============================================
 * Generates a Chilean Income Statement (P&L) in PDF format using PDFKit.
 * A4 portrait layout with company header and ingresos/gastos/resultado sections.
 */

import PDFDocument from 'pdfkit'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResultadosPDFData {
  company_name: string
  company_rut: string
  periodo: { year: number; mes: number }
  ingresos: { ventas: number; otros: number; total: number }
  gastos: { costo_ventas: number; administrativos: number; depreciacion: number; total: number }
  resultado: { utilidad_bruta: number; utilidad_neta: number }
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
 * Generate a Chilean Estado de Resultados PDF.
 * Returns a Buffer containing the PDF data.
 * Uses A4 portrait layout.
 */
export async function generateResultadosPDF(data: ResultadosPDFData): Promise<Buffer> {
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

      // ── Company Header ──────────────────────────────────────

      doc.font('Helvetica-Bold').fontSize(11)
      doc.text(data.company_name, leftCol, 40)
      doc.font('Helvetica').fontSize(9)
      doc.text(`RUT: ${data.company_rut}`, leftCol, 54)

      // ── Title ───────────────────────────────────────────────

      let y = 80
      doc.font('Helvetica-Bold').fontSize(16)
      doc.text('ESTADO DE RESULTADOS', leftCol, y, { width: pageWidth, align: 'center' })
      y += 22

      doc.font('Helvetica').fontSize(10)
      doc.text(
        `Periodo: Enero - ${mesLabel} ${data.periodo.year}`,
        leftCol, y,
        { width: pageWidth, align: 'center' },
      )
      y += 20

      // ── Separator ───────────────────────────────────────────

      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(0.5).stroke()
      y += 20

      // ── Helper functions ────────────────────────────────────

      const amountX = leftCol + pageWidth - 120
      const amountW = 120

      function drawRow(label: string, amount: number, atY: number, opts?: { bold?: boolean; indent?: boolean; highlight?: boolean; color?: string }): number {
        const indent = opts?.indent ? 20 : 0

        if (opts?.highlight) {
          doc.rect(leftCol, atY - 3, pageWidth, 20).fill('#f0f4ff')
          doc.fillColor('#000000')
        }

        doc.font(opts?.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts?.bold ? 10 : 9)
        doc.fillColor(opts?.color ?? (opts?.bold ? '#111827' : '#374151'))
        doc.text(label, leftCol + 20 + indent, atY, { width: pageWidth - amountW - 40 })
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

      // ── INGRESOS Section ────────────────────────────────────

      y = drawSectionTitle('INGRESOS', y)
      y = drawRow('Ventas', data.ingresos.ventas, y, { indent: true })
      y = drawRow('Otros Ingresos', data.ingresos.otros, y, { indent: true })
      y += 4
      doc.moveTo(leftCol + 20, y - 2).lineTo(leftCol + pageWidth, y - 2).lineWidth(0.3).strokeColor('#d1d5db').stroke()
      doc.strokeColor('#000000')
      y = drawRow('Total Ingresos', data.ingresos.total, y, { bold: true })
      y += 16

      // ── COSTOS Section ──────────────────────────────────────

      y = drawSectionTitle('COSTOS', y)
      y = drawRow('Costo de Ventas', data.gastos.costo_ventas, y, { indent: true })
      y += 4
      doc.moveTo(leftCol + 20, y - 2).lineTo(leftCol + pageWidth, y - 2).lineWidth(0.3).strokeColor('#d1d5db').stroke()
      doc.strokeColor('#000000')
      y += 4
      y = drawRow('UTILIDAD BRUTA', data.resultado.utilidad_bruta, y, { bold: true, highlight: true })
      y += 16

      // ── GASTOS Section ──────────────────────────────────────

      y = drawSectionTitle('GASTOS OPERACIONALES', y)
      y = drawRow('Gastos Administrativos', data.gastos.administrativos, y, { indent: true })
      y = drawRow('Depreciacion', data.gastos.depreciacion, y, { indent: true })
      y += 4
      doc.moveTo(leftCol + 20, y - 2).lineTo(leftCol + pageWidth, y - 2).lineWidth(0.3).strokeColor('#d1d5db').stroke()
      doc.strokeColor('#000000')
      y = drawRow('Total Gastos', data.gastos.total, y, { bold: true })
      y += 20

      // ── RESULTADO Section ───────────────────────────────────

      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(1.5).stroke()
      y += 10

      const isLoss = data.resultado.utilidad_neta < 0
      const resultLabel = isLoss ? 'PERDIDA NETA' : 'UTILIDAD NETA'
      const resultColor = isLoss ? '#dc2626' : '#059669'

      // Highlighted result row
      doc.rect(leftCol, y - 3, pageWidth, 26).fill(isLoss ? '#fef2f2' : '#ecfdf5')
      doc.fillColor('#000000')

      doc.font('Helvetica-Bold').fontSize(13).fillColor(resultColor)
      doc.text(resultLabel, leftCol + 20, y)
      doc.text(formatCLP(Math.abs(data.resultado.utilidad_neta)), amountX, y, { width: amountW, align: 'right' })
      doc.fillColor('#000000')
      y += 26

      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(1.5).stroke()

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
