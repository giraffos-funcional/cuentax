/**
 * CUENTAX — Libro de Remuneraciones PDF Generator
 * =================================================
 * Generates the monthly payroll register (Libro de Remuneraciones) in PDF format
 * using PDFKit. Landscape A4 layout to accommodate all payroll columns.
 */

import PDFDocument from 'pdfkit'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LibroRemRegistro {
  employee_name: string
  employee_rut: string
  department: string
  dias_trabajados: number
  sueldo_base: number
  gratificacion: number
  otros_haberes: number
  total_haberes_imp: number
  total_haberes_no_imp: number
  afp: number
  salud: number
  cesantia: number
  impuesto: number
  total_descuentos: number
  liquido: number
}

export interface LibroRemPDFData {
  company_name: string
  company_rut: string
  periodo: { year: number; mes: number }
  registros: LibroRemRegistro[]
  totales: Record<string, number>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/**
 * Format a number as Chilean Peso: $1.234.567
 */
function formatCLP(n: number): string {
  const abs = Math.abs(Math.round(n))
  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return n < 0 ? `-$${formatted}` : `$${formatted}`
}

// ---------------------------------------------------------------------------
// Column definitions for the table
// ---------------------------------------------------------------------------

interface Column {
  header: string
  width: number
  align: 'left' | 'right' | 'center'
  key: string
  format?: (v: unknown) => string
}

const COLUMNS: Column[] = [
  { header: 'N°',           width: 22,  align: 'center', key: '_index' },
  { header: 'RUT',          width: 62,  align: 'left',   key: 'employee_rut' },
  { header: 'Nombre',       width: 100, align: 'left',   key: 'employee_name' },
  { header: 'Depto.',       width: 55,  align: 'left',   key: 'department' },
  { header: 'Días',         width: 25,  align: 'center', key: 'dias_trabajados' },
  { header: 'Sueldo Base',  width: 58,  align: 'right',  key: 'sueldo_base',        format: (v) => formatCLP(v as number) },
  { header: 'Gratif.',      width: 50,  align: 'right',  key: 'gratificacion',       format: (v) => formatCLP(v as number) },
  { header: 'Otros Hab.',   width: 50,  align: 'right',  key: 'otros_haberes',       format: (v) => formatCLP(v as number) },
  { header: 'Hab. Imp.',    width: 58,  align: 'right',  key: 'total_haberes_imp',   format: (v) => formatCLP(v as number) },
  { header: 'Hab. No Imp.', width: 55,  align: 'right',  key: 'total_haberes_no_imp', format: (v) => formatCLP(v as number) },
  { header: 'AFP',          width: 50,  align: 'right',  key: 'afp',                 format: (v) => formatCLP(v as number) },
  { header: 'Salud',        width: 50,  align: 'right',  key: 'salud',               format: (v) => formatCLP(v as number) },
  { header: 'Cesantía',     width: 45,  align: 'right',  key: 'cesantia',            format: (v) => formatCLP(v as number) },
  { header: 'Impuesto',     width: 50,  align: 'right',  key: 'impuesto',            format: (v) => formatCLP(v as number) },
  { header: 'Tot. Desc.',   width: 55,  align: 'right',  key: 'total_descuentos',    format: (v) => formatCLP(v as number) },
  { header: 'Líquido',      width: 58,  align: 'right',  key: 'liquido',             format: (v) => formatCLP(v as number) },
]

// ---------------------------------------------------------------------------
// PDF Generation
// ---------------------------------------------------------------------------

/**
 * Generate a Libro de Remuneraciones PDF in landscape A4.
 * Returns a Buffer containing the PDF data.
 */
export async function generateLibroRemuneracionesPDF(data: LibroRemPDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 40, bottom: 40, left: 30, right: 30 },
      })

      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const pageWidth = doc.page.width - 60 // 30pt margins each side
      const leftMargin = 30
      const monthName = MONTH_NAMES[(data.periodo.mes - 1)] ?? ''

      // ── Helper: draw table header row ──────────────────────────
      function drawHeader(y: number): number {
        doc.font('Helvetica-Bold').fontSize(6.5)
        let x = leftMargin
        for (const col of COLUMNS) {
          doc.text(col.header, x, y, { width: col.width, align: col.align })
          x += col.width
        }

        // Separator line
        const lineY = y + 10
        doc.moveTo(leftMargin, lineY).lineTo(leftMargin + pageWidth, lineY).lineWidth(0.5).stroke()
        return lineY + 4
      }

      // ── Helper: draw a data row ────────────────────────────────
      function drawRow(record: Record<string, unknown>, y: number): number {
        doc.font('Helvetica').fontSize(6.5)
        let x = leftMargin
        for (const col of COLUMNS) {
          const raw = record[col.key]
          const text = col.format ? col.format(raw) : String(raw ?? '')
          doc.text(text, x, y, { width: col.width, align: col.align })
          x += col.width
        }
        return y + 11
      }

      // ── Helper: draw page header (company + title) ─────────────
      function drawPageHeader(): number {
        let y = 40

        // Company info
        doc.font('Helvetica-Bold').fontSize(10)
        doc.text(data.company_name, leftMargin, y)
        doc.font('Helvetica').fontSize(8)
        doc.text(`RUT: ${data.company_rut}`, leftMargin, y + 13)

        // Title
        doc.font('Helvetica-Bold').fontSize(12)
        doc.text(
          `LIBRO DE REMUNERACIONES`,
          leftMargin, y,
          { width: pageWidth, align: 'center' },
        )
        doc.font('Helvetica').fontSize(9)
        doc.text(
          `Período: ${monthName} ${data.periodo.year}`,
          leftMargin, y + 16,
          { width: pageWidth, align: 'center' },
        )

        y += 36

        // Separator
        doc.moveTo(leftMargin, y).lineTo(leftMargin + pageWidth, y).lineWidth(1).stroke()
        y += 8

        return y
      }

      // ── First page header ──────────────────────────────────────
      let y = drawPageHeader()
      y = drawHeader(y)

      // ── Data rows ──────────────────────────────────────────────
      const bottomLimit = doc.page.height - 60

      for (let i = 0; i < data.registros.length; i++) {
        // Check if we need a new page
        if (y > bottomLimit) {
          // Page number on current page
          doc.font('Helvetica').fontSize(6)
          doc.text(
            `Página ${doc.bufferedPageRange().count}`,
            leftMargin, doc.page.height - 30,
            { width: pageWidth, align: 'center' },
          )

          doc.addPage()
          y = drawPageHeader()
          y = drawHeader(y)
        }

        const record: Record<string, unknown> = {
          _index: i + 1,
          ...data.registros[i],
        }
        y = drawRow(record, y)
      }

      // ── Totals row ────────────────────────────────────────────
      if (y > bottomLimit - 20) {
        doc.addPage()
        y = drawPageHeader()
        y = drawHeader(y)
      }

      // Separator before totals
      doc.moveTo(leftMargin, y).lineTo(leftMargin + pageWidth, y).lineWidth(0.8).stroke()
      y += 5

      doc.font('Helvetica-Bold').fontSize(7)
      let x = leftMargin
      for (const col of COLUMNS) {
        let text = ''
        if (col.key === '_index') {
          text = ''
        } else if (col.key === 'employee_rut') {
          text = 'TOTALES'
        } else if (col.key === 'employee_name' || col.key === 'department') {
          text = ''
        } else if (col.key === 'dias_trabajados') {
          text = ''
        } else {
          const val = (data.totales[col.key] as number) ?? 0
          text = formatCLP(val)
        }
        doc.text(text, x, y, { width: col.width, align: col.align })
        x += col.width
      }
      y += 14

      // Separator after totals
      doc.moveTo(leftMargin, y).lineTo(leftMargin + pageWidth, y).lineWidth(0.8).stroke()
      y += 10

      // Summary line
      doc.font('Helvetica').fontSize(7)
      doc.text(
        `Total empleados: ${data.registros.length}`,
        leftMargin, y,
      )

      // ── Footer: page numbers ──────────────────────────────────
      const range = doc.bufferedPageRange()
      for (let p = 0; p < range.count; p++) {
        doc.switchToPage(p)
        doc.font('Helvetica').fontSize(6)
        doc.text(
          `Generado por CuentaX - ${new Date().toLocaleDateString('es-CL')} | Página ${p + 1} de ${range.count}`,
          leftMargin,
          doc.page.height - 30,
          { width: pageWidth, align: 'center' },
        )
      }

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}
