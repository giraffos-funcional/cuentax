/**
 * CUENTAX — LCV PDF Generator (Libro de Compras y Ventas)
 * ========================================================
 * Generates a Chilean LCV report in PDF format using PDFKit.
 * Follows the official SII format for Libro de Compras/Ventas.
 */

import PDFDocument from 'pdfkit'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LCVPDFData {
  company_name: string
  company_rut: string
  company_address: string
  libro: 'ventas' | 'compras'
  periodo: { year: number; mes: number }
  registros: Array<{
    tipo_dte?: string
    folio?: string
    fecha?: string
    rut_receptor?: string
    razon_social_receptor?: string
    neto: number
    iva: number
    total: number
  }>
  totales: { neto: number; iva: number; total: number }
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
 * Generate a Chilean LCV PDF (Libro de Compras/Ventas).
 * Returns a Buffer containing the PDF data.
 * Uses A4 landscape for wide table layout.
 */
export async function generateLCVPDF(data: LCVPDFData): Promise<Buffer> {
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
      const libroLabel = data.libro === 'ventas' ? 'VENTAS' : 'COMPRAS'
      const mesLabel = MONTHS[data.periodo.mes - 1] ?? ''

      // Track page count for page numbering
      let pageCount = 1

      // ── Header ────────────────────────────────────────────────

      function drawHeader() {
        // Company info (left)
        doc.font('Helvetica-Bold').fontSize(11)
        doc.text(data.company_name, leftCol, 40)
        doc.font('Helvetica').fontSize(9)
        doc.text(`RUT: ${data.company_rut}`, leftCol, 54)
        if (data.company_address) {
          doc.text(data.company_address, leftCol, 66)
        }

        // Title (center)
        doc.font('Helvetica-Bold').fontSize(14)
        doc.text(`LIBRO DE ${libroLabel}`, leftCol, 40, { width: pageWidth, align: 'center' })

        // Period (right)
        doc.font('Helvetica').fontSize(10)
        doc.text(`Periodo: ${mesLabel} ${data.periodo.year}`, leftCol, 58, { width: pageWidth, align: 'center' })
      }

      drawHeader()

      // ── Separator ─────────────────────────────────────────────

      let y = 85
      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(0.5).stroke()
      y += 10

      // ── Table Header ──────────────────────────────────────────

      // Column widths for landscape A4 (total ~757pt usable)
      const cols = {
        num:    { x: leftCol,       w: 35  },
        tipo:   { x: leftCol + 35,  w: 55  },
        folio:  { x: leftCol + 90,  w: 60  },
        fecha:  { x: leftCol + 150, w: 70  },
        rut:    { x: leftCol + 220, w: 90  },
        razon:  { x: leftCol + 310, w: 207 },
        neto:   { x: leftCol + 517, w: 80  },
        iva:    { x: leftCol + 597, w: 80  },
        total:  { x: leftCol + 677, w: 80  },
      }

      function drawTableHeader(atY: number): number {
        doc.font('Helvetica-Bold').fontSize(8)
        const headerY = atY

        // Header background
        doc.rect(leftCol, headerY - 2, pageWidth, 16).fill('#f3f4f6')
        doc.fillColor('#374151')

        doc.text('N.',            cols.num.x + 2,   headerY, { width: cols.num.w,   align: 'left' })
        doc.text('Tipo Doc',     cols.tipo.x + 2,  headerY, { width: cols.tipo.w,  align: 'left' })
        doc.text('Folio',        cols.folio.x + 2, headerY, { width: cols.folio.w, align: 'left' })
        doc.text('Fecha',        cols.fecha.x + 2, headerY, { width: cols.fecha.w, align: 'left' })
        doc.text('RUT',          cols.rut.x + 2,   headerY, { width: cols.rut.w,   align: 'left' })
        doc.text('Razon Social', cols.razon.x + 2, headerY, { width: cols.razon.w, align: 'left' })
        doc.text('Neto',         cols.neto.x + 2,  headerY, { width: cols.neto.w - 4, align: 'right' })
        doc.text('IVA',          cols.iva.x + 2,   headerY, { width: cols.iva.w - 4,  align: 'right' })
        doc.text('Total',        cols.total.x + 2, headerY, { width: cols.total.w - 4, align: 'right' })

        doc.fillColor('#000000')

        return headerY + 18
      }

      y = drawTableHeader(y)

      // ── Table Rows ────────────────────────────────────────────

      const rowHeight = 14
      const maxY = doc.page.height - 60 // Leave space for footer

      doc.font('Helvetica').fontSize(8)

      for (let i = 0; i < data.registros.length; i++) {
        // Check if we need a new page
        if (y + rowHeight > maxY) {
          // Draw page number on current page
          drawPageFooter(doc, pageCount, leftCol, pageWidth)
          doc.addPage()
          pageCount++
          drawHeader()
          y = 85
          doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(0.5).stroke()
          y += 10
          y = drawTableHeader(y)
          doc.font('Helvetica').fontSize(8)
        }

        const r = data.registros[i]

        // Alternate row background
        if (i % 2 === 0) {
          doc.rect(leftCol, y - 2, pageWidth, rowHeight).fill('#fafafa')
          doc.fillColor('#000000')
        }

        // Draw separator line
        doc.moveTo(leftCol, y + rowHeight - 2).lineTo(leftCol + pageWidth, y + rowHeight - 2)
          .lineWidth(0.2).strokeColor('#e5e7eb').stroke()
        doc.strokeColor('#000000')

        doc.fillColor('#374151')
        doc.text(String(i + 1),                         cols.num.x + 2,   y, { width: cols.num.w,   align: 'left' })
        doc.text(r.tipo_dte ?? '-',                     cols.tipo.x + 2,  y, { width: cols.tipo.w,  align: 'left' })
        doc.text(r.folio ?? '-',                        cols.folio.x + 2, y, { width: cols.folio.w, align: 'left' })
        doc.text(r.fecha ?? '-',                        cols.fecha.x + 2, y, { width: cols.fecha.w, align: 'left' })
        doc.text(r.rut_receptor ?? '-',                 cols.rut.x + 2,   y, { width: cols.rut.w,   align: 'left' })
        doc.text(truncate(r.razon_social_receptor ?? '-', 40), cols.razon.x + 2, y, { width: cols.razon.w, align: 'left' })
        doc.text(formatCLP(r.neto),                     cols.neto.x + 2,  y, { width: cols.neto.w - 4, align: 'right' })
        doc.text(formatCLP(r.iva),                      cols.iva.x + 2,   y, { width: cols.iva.w - 4,  align: 'right' })
        doc.text(formatCLP(r.total),                    cols.total.x + 2, y, { width: cols.total.w - 4, align: 'right' })

        doc.fillColor('#000000')
        y += rowHeight
      }

      // ── Totals Row ────────────────────────────────────────────

      // Check if totals need a new page
      if (y + 20 > maxY) {
        drawPageFooter(doc, pageCount, leftCol, pageWidth)
        doc.addPage()
        pageCount++
        y = 50
      }

      y += 4
      doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).lineWidth(1).stroke()
      y += 6

      doc.font('Helvetica-Bold').fontSize(9)
      doc.text('TOTALES', cols.num.x + 2, y, { width: cols.razon.x + cols.razon.w - cols.num.x })
      doc.text(formatCLP(data.totales.neto),  cols.neto.x + 2,  y, { width: cols.neto.w - 4, align: 'right' })
      doc.text(formatCLP(data.totales.iva),   cols.iva.x + 2,   y, { width: cols.iva.w - 4,  align: 'right' })
      doc.text(formatCLP(data.totales.total), cols.total.x + 2, y, { width: cols.total.w - 4, align: 'right' })

      y += 20

      // ── Document count ────────────────────────────────────────

      doc.font('Helvetica').fontSize(8)
      doc.fillColor('#6b7280')
      doc.text(
        `Total de documentos: ${data.registros.length}`,
        leftCol, y,
        { width: pageWidth },
      )
      doc.fillColor('#000000')

      // ── Page footer ───────────────────────────────────────────

      drawPageFooter(doc, pageCount, leftCol, pageWidth)

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

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
