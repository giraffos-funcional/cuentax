/**
 * CUENTAX — Libro Mayor PDF Generator
 * =====================================
 * Generates a Chilean Libro Mayor (General Ledger) in PDF format using PDFKit.
 * A4 portrait layout with account header, movement table, and running balance.
 */

import PDFDocument from 'pdfkit'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LibroMayorPDFData {
  company_name: string
  company_rut: string
  periodo: { year: number; mes: number }
  cuenta: { code: string; name: string }
  movimientos: Array<{
    date: string
    move_name: string
    partner: string
    debit: number
    credit: number
    name: string
  }>
  saldo_inicial: number
  saldo_final: number
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
// Helpers
// ---------------------------------------------------------------------------

function drawPageFooter(doc: PDFKit.PDFDocument, pageNum: number, leftCol: number, pageWidth: number) {
  const footerY = doc.page.height - 30
  doc.font('Helvetica').fontSize(7).fillColor('#9ca3af')
  doc.text(
    `Generado por CuentaX - ${new Date().toLocaleDateString('es-CL')}`,
    leftCol, footerY,
    { width: pageWidth / 2, align: 'left' },
  )
  doc.text(
    `Pagina ${pageNum}`,
    leftCol + pageWidth / 2, footerY,
    { width: pageWidth / 2, align: 'right' },
  )
  doc.fillColor('#000000')
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '...' : str
}

// ---------------------------------------------------------------------------
// PDF Generation
// ---------------------------------------------------------------------------

/**
 * Generate a Chilean Libro Mayor PDF.
 * Returns a Buffer containing the PDF data.
 * Uses A4 portrait layout.
 */
export async function generateLibroMayorPDF(data: LibroMayorPDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'portrait',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
      })

      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const pageWidth = doc.page.width - 80 // 40pt margins each side
      const leftCol = 40
      const mesLabel = MONTHS[data.periodo.mes - 1] ?? ''

      let pageCount = 1

      // ── Header ────────────────────────────────────────────────

      function drawHeader() {
        // Company info (left)
        doc.font('Helvetica-Bold').fontSize(11)
        doc.text(data.company_name, leftCol, 40)
        doc.font('Helvetica').fontSize(9)
        doc.text(`RUT: ${data.company_rut}`, leftCol, 54)

        // Title (center)
        doc.font('Helvetica-Bold').fontSize(14)
        doc.text('LIBRO MAYOR', leftCol, 40, { width: pageWidth, align: 'center' })

        // Account info (below title)
        doc.font('Helvetica-Bold').fontSize(10)
        doc.text(
          `Cuenta: ${data.cuenta.code} - ${data.cuenta.name}`,
          leftCol, 60,
          { width: pageWidth, align: 'center' },
        )

        // Period
        doc.font('Helvetica').fontSize(9)
        doc.text(
          `Periodo: ${mesLabel} ${data.periodo.year}`,
          leftCol, 74,
          { width: pageWidth, align: 'center' },
        )
      }

      drawHeader()

      // ── Separator ─────────────────────────────────────────────

      let y = 90
      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(0.5).stroke()
      y += 10

      // ── Column definitions ────────────────────────────────────

      const cols = {
        fecha:    { x: leftCol,       w: 60  },
        asiento:  { x: leftCol + 60,  w: 100 },
        partner:  { x: leftCol + 160, w: 115 },
        debe:     { x: leftCol + 275, w: 80  },
        haber:    { x: leftCol + 355, w: 80  },
        saldo:    { x: leftCol + 435, w: 80  },
      }

      function drawTableHeader(atY: number): number {
        doc.font('Helvetica-Bold').fontSize(8)
        doc.rect(leftCol, atY - 2, pageWidth, 16).fill('#f3f4f6')
        doc.fillColor('#374151')

        doc.text('Fecha',       cols.fecha.x + 2,   atY, { width: cols.fecha.w,   align: 'left' })
        doc.text('Asiento',     cols.asiento.x + 2,  atY, { width: cols.asiento.w, align: 'left' })
        doc.text('Contraparte', cols.partner.x + 2,  atY, { width: cols.partner.w, align: 'left' })
        doc.text('Debe',        cols.debe.x + 2,     atY, { width: cols.debe.w - 4, align: 'right' })
        doc.text('Haber',       cols.haber.x + 2,    atY, { width: cols.haber.w - 4, align: 'right' })
        doc.text('Saldo',       cols.saldo.x + 2,    atY, { width: cols.saldo.w - 4, align: 'right' })

        doc.fillColor('#000000')
        return atY + 18
      }

      y = drawTableHeader(y)

      // ── Opening balance row ───────────────────────────────────

      doc.font('Helvetica-Bold').fontSize(8)
      doc.rect(leftCol, y - 2, pageWidth, 14).fill('#f9fafb')
      doc.fillColor('#6b7280')
      doc.text('Saldo Inicial', cols.fecha.x + 2, y, { width: cols.partner.x + cols.partner.w - cols.fecha.x })
      doc.text('—', cols.debe.x + 2, y, { width: cols.debe.w - 4, align: 'right' })
      doc.text('—', cols.haber.x + 2, y, { width: cols.haber.w - 4, align: 'right' })
      doc.font('Helvetica-Bold').fillColor('#111827')
      doc.text(formatCLP(data.saldo_inicial), cols.saldo.x + 2, y, { width: cols.saldo.w - 4, align: 'right' })
      doc.fillColor('#000000')
      y += 16

      // ── Movement rows ─────────────────────────────────────────

      const rowHeight = 14
      const maxY = doc.page.height - 60

      let running = data.saldo_inicial
      let totalDebe = 0
      let totalHaber = 0

      doc.font('Helvetica').fontSize(8)

      for (let i = 0; i < data.movimientos.length; i++) {
        // Check if we need a new page
        if (y + rowHeight > maxY) {
          drawPageFooter(doc, pageCount, leftCol, pageWidth)
          doc.addPage()
          pageCount++
          drawHeader()
          y = 90
          doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(0.5).stroke()
          y += 10
          y = drawTableHeader(y)
          doc.font('Helvetica').fontSize(8)
        }

        const mov = data.movimientos[i]
        running = running + mov.debit - mov.credit
        totalDebe += mov.debit
        totalHaber += mov.credit

        // Alternate row background
        if (i % 2 === 0) {
          doc.rect(leftCol, y - 2, pageWidth, rowHeight).fill('#fafafa')
          doc.fillColor('#000000')
        }

        // Row separator
        doc.moveTo(leftCol, y + rowHeight - 2).lineTo(leftCol + pageWidth, y + rowHeight - 2)
          .lineWidth(0.2).strokeColor('#e5e7eb').stroke()
        doc.strokeColor('#000000')

        doc.fillColor('#374151')
        doc.text(mov.date ?? '-',                            cols.fecha.x + 2,   y, { width: cols.fecha.w,   align: 'left' })
        doc.text(truncate(mov.move_name ?? '-', 20),         cols.asiento.x + 2,  y, { width: cols.asiento.w, align: 'left' })
        doc.text(truncate(mov.partner ?? '-', 22),           cols.partner.x + 2,  y, { width: cols.partner.w, align: 'left' })
        doc.text(mov.debit > 0 ? formatCLP(mov.debit) : '',  cols.debe.x + 2,    y, { width: cols.debe.w - 4, align: 'right' })
        doc.text(mov.credit > 0 ? formatCLP(mov.credit) : '', cols.haber.x + 2,  y, { width: cols.haber.w - 4, align: 'right' })

        // Running balance with color
        const saldoColor = running < 0 ? '#dc2626' : '#111827'
        doc.fillColor(saldoColor)
        doc.text(formatCLP(running), cols.saldo.x + 2, y, { width: cols.saldo.w - 4, align: 'right' })
        doc.fillColor('#000000')

        y += rowHeight
      }

      // ── Closing balance row ───────────────────────────────────

      if (y + 30 > maxY) {
        drawPageFooter(doc, pageCount, leftCol, pageWidth)
        doc.addPage()
        pageCount++
        y = 50
      }

      y += 4
      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(1).stroke()
      y += 6

      // Totals row
      doc.font('Helvetica-Bold').fontSize(9)
      doc.text('TOTALES', cols.fecha.x + 2, y, { width: cols.partner.x + cols.partner.w - cols.fecha.x })
      doc.text(formatCLP(totalDebe),  cols.debe.x + 2,  y, { width: cols.debe.w - 4,  align: 'right' })
      doc.text(formatCLP(totalHaber), cols.haber.x + 2, y, { width: cols.haber.w - 4, align: 'right' })
      doc.fillColor('#000000')
      y += 18

      // Closing balance row
      doc.rect(leftCol, y - 2, pageWidth, 18).fill('#f0f4ff')
      doc.fillColor('#000000')
      doc.font('Helvetica-Bold').fontSize(10)
      doc.text('SALDO FINAL', cols.fecha.x + 2, y, { width: cols.partner.x + cols.partner.w - cols.fecha.x })

      const closingColor = data.saldo_final < 0 ? '#dc2626' : '#059669'
      doc.fillColor(closingColor)
      doc.text(formatCLP(data.saldo_final), cols.saldo.x + 2, y, { width: cols.saldo.w - 4, align: 'right' })
      doc.fillColor('#000000')

      y += 22

      // ── Movement count ────────────────────────────────────────

      doc.font('Helvetica').fontSize(8).fillColor('#6b7280')
      doc.text(
        `Total de movimientos: ${data.movimientos.length}`,
        leftCol, y,
        { width: pageWidth },
      )
      doc.fillColor('#000000')

      // ── Footer ────────────────────────────────────────────────

      drawPageFooter(doc, pageCount, leftCol, pageWidth)

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}
