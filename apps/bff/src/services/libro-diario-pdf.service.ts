/**
 * CUENTAX — Libro Diario PDF Generator
 * ======================================
 * Generates a Chilean Libro Diario (Journal Book) in PDF format using PDFKit.
 * A4 landscape layout for wide table with journal entry lines.
 */

import PDFDocument from 'pdfkit'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LibroDiarioPDFData {
  company_name: string
  company_rut: string
  periodo: { year: number; mes: number }
  asientos: Array<{
    name: string
    date: string
    journal_name: string
    state: string
    lines: Array<{
      account_code: string
      account_name: string
      debit: number
      credit: number
      name: string
    }>
  }>
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
 * Generate a Chilean Libro Diario PDF.
 * Returns a Buffer containing the PDF data.
 * Uses A4 landscape for wide table layout.
 */
export async function generateLibroDiarioPDF(data: LibroDiarioPDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
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
        doc.text('LIBRO DIARIO', leftCol, 40, { width: pageWidth, align: 'center' })

        // Period
        doc.font('Helvetica').fontSize(10)
        doc.text(`Periodo: ${mesLabel} ${data.periodo.year}`, leftCol, 58, { width: pageWidth, align: 'center' })
      }

      drawHeader()

      // ── Separator ─────────────────────────────────────────────

      let y = 78
      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(0.5).stroke()
      y += 10

      // ── Column definitions ────────────────────────────────────

      const cols = {
        cuenta:  { x: leftCol,       w: 220 },
        debe:    { x: leftCol + 220, w: 110 },
        haber:   { x: leftCol + 330, w: 110 },
        glosa:   { x: leftCol + 440, w: pageWidth - 440 },
      }

      function drawTableHeader(atY: number): number {
        doc.font('Helvetica-Bold').fontSize(8)
        doc.rect(leftCol, atY - 2, pageWidth, 16).fill('#f3f4f6')
        doc.fillColor('#374151')

        doc.text('Cuenta',  cols.cuenta.x + 2, atY, { width: cols.cuenta.w, align: 'left' })
        doc.text('Debe',    cols.debe.x + 2,   atY, { width: cols.debe.w - 4, align: 'right' })
        doc.text('Haber',   cols.haber.x + 2,  atY, { width: cols.haber.w - 4, align: 'right' })
        doc.text('Glosa',   cols.glosa.x + 2,  atY, { width: cols.glosa.w - 4, align: 'left' })

        doc.fillColor('#000000')
        return atY + 18
      }

      const rowHeight = 14
      const maxY = doc.page.height - 60 // Leave space for footer

      // ── Grand totals tracking ─────────────────────────────────

      let grandTotalDebe = 0
      let grandTotalHaber = 0

      // ── Render each journal entry ─────────────────────────────

      for (let ei = 0; ei < data.asientos.length; ei++) {
        const entry = data.asientos[ei]

        // Calculate how much space this entry needs
        // Header (20) + table header (18) + lines * rowHeight + subtotal (18) + spacing (10)
        const entryHeight = 20 + 18 + (entry.lines.length * rowHeight) + 18 + 10

        // Check if we need a new page
        if (y + Math.min(entryHeight, 80) > maxY) {
          drawPageFooter(doc, pageCount, leftCol, pageWidth)
          doc.addPage()
          pageCount++
          drawHeader()
          y = 78
          doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(0.5).stroke()
          y += 10
        }

        // ── Entry header ──────────────────────────────────────

        const stateLabel = entry.state === 'posted' ? 'Confirmado' : 'Borrador'

        doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827')
        doc.text(entry.name, leftCol + 2, y)
        doc.font('Helvetica').fontSize(8).fillColor('#6b7280')
        doc.text(
          `${entry.date}  |  ${entry.journal_name}  |  ${stateLabel}`,
          leftCol + 160, y,
          { width: pageWidth - 160 },
        )
        doc.fillColor('#000000')
        y += 18

        // ── Table header ──────────────────────────────────────

        y = drawTableHeader(y)

        // ── Lines ─────────────────────────────────────────────

        let entryTotalDebe = 0
        let entryTotalHaber = 0

        doc.font('Helvetica').fontSize(8)

        for (let li = 0; li < entry.lines.length; li++) {
          // Check if we need a new page mid-entry
          if (y + rowHeight > maxY) {
            drawPageFooter(doc, pageCount, leftCol, pageWidth)
            doc.addPage()
            pageCount++
            drawHeader()
            y = 78
            doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(0.5).stroke()
            y += 10
            y = drawTableHeader(y)
            doc.font('Helvetica').fontSize(8)
          }

          const line = entry.lines[li]

          // Alternate row background
          if (li % 2 === 0) {
            doc.rect(leftCol, y - 2, pageWidth, rowHeight).fill('#fafafa')
            doc.fillColor('#000000')
          }

          // Row separator
          doc.moveTo(leftCol, y + rowHeight - 2).lineTo(leftCol + pageWidth, y + rowHeight - 2)
            .lineWidth(0.2).strokeColor('#e5e7eb').stroke()
          doc.strokeColor('#000000')

          const accountLabel = truncate(`${line.account_code} - ${line.account_name}`, 45)

          doc.fillColor('#374151')
          doc.text(accountLabel,       cols.cuenta.x + 2, y, { width: cols.cuenta.w - 4, align: 'left' })
          doc.text(line.debit > 0 ? formatCLP(line.debit) : '',   cols.debe.x + 2,  y, { width: cols.debe.w - 4,  align: 'right' })
          doc.text(line.credit > 0 ? formatCLP(line.credit) : '', cols.haber.x + 2, y, { width: cols.haber.w - 4, align: 'right' })
          doc.text(truncate(line.name ?? '', 50),                  cols.glosa.x + 2, y, { width: cols.glosa.w - 4, align: 'left' })
          doc.fillColor('#000000')

          entryTotalDebe += line.debit
          entryTotalHaber += line.credit
          y += rowHeight
        }

        // ── Entry subtotal ────────────────────────────────────

        if (y + 18 > maxY) {
          drawPageFooter(doc, pageCount, leftCol, pageWidth)
          doc.addPage()
          pageCount++
          drawHeader()
          y = 88
        }

        y += 2
        doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(0.5).strokeColor('#9ca3af').stroke()
        doc.strokeColor('#000000')
        y += 4

        doc.font('Helvetica-Bold').fontSize(8).fillColor('#374151')
        doc.text('Subtotal', cols.cuenta.x + 2, y, { width: cols.cuenta.w, align: 'left' })
        doc.text(formatCLP(entryTotalDebe),  cols.debe.x + 2,  y, { width: cols.debe.w - 4,  align: 'right' })
        doc.text(formatCLP(entryTotalHaber), cols.haber.x + 2, y, { width: cols.haber.w - 4, align: 'right' })
        doc.fillColor('#000000')

        grandTotalDebe += entryTotalDebe
        grandTotalHaber += entryTotalHaber

        y += 20
      }

      // ── Grand Totals ──────────────────────────────────────────

      if (y + 30 > maxY) {
        drawPageFooter(doc, pageCount, leftCol, pageWidth)
        doc.addPage()
        pageCount++
        y = 50
      }

      y += 4
      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(1).stroke()
      y += 6

      doc.font('Helvetica-Bold').fontSize(10)
      doc.text('TOTALES GENERALES', cols.cuenta.x + 2, y, { width: cols.cuenta.w })
      doc.text(formatCLP(grandTotalDebe),  cols.debe.x + 2,  y, { width: cols.debe.w - 4,  align: 'right' })
      doc.text(formatCLP(grandTotalHaber), cols.haber.x + 2, y, { width: cols.haber.w - 4, align: 'right' })

      y += 20

      // ── Document count ────────────────────────────────────────

      doc.font('Helvetica').fontSize(8).fillColor('#6b7280')
      doc.text(
        `Total de asientos: ${data.asientos.length}`,
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
