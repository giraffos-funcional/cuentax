/**
 * Invoice PDF generator (Phase 02 T2.9 ext).
 *
 * Generates a self-billed invoice PDF for a Cuentax subscription.
 * Note: this is the PRESENTATION layer; the actual SII-valid DTE 33
 * comes from Cuentax's emisión service once the platform's own CAF +
 * cert is wired (separate work track).
 */
import PDFDocument from 'pdfkit'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { invoices, invoiceLineItems, tenants, plans } from '@/db/schema'

const clpFmt = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`

export async function generateInvoicePdf(invoiceId: number): Promise<Buffer> {
  const invRows = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1)
  const inv = invRows[0]
  if (!inv) throw new Error(`invoice ${invoiceId} not found`)

  const tenantRows = await db.select().from(tenants).where(eq(tenants.id, inv.tenant_id)).limit(1)
  const tenant = tenantRows[0]
  if (!tenant) throw new Error(`tenant ${inv.tenant_id} not found`)

  const items = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoice_id, inv.id))

  let plan: typeof plans.$inferSelect | null = null
  if (tenant.plan_id) {
    const p = await db.select().from(plans).where(eq(plans.id, tenant.plan_id)).limit(1)
    plan = p[0] ?? null
  }

  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } })
      const chunks: Buffer[] = []
      doc.on('data', (c) => chunks.push(c as Buffer))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      // ── Header ─────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(22).fillColor('#1d4ed8').text('CUENTAX', { align: 'left' })
      doc.font('Helvetica').fontSize(9).fillColor('#666')
        .text('Plataforma de contabilidad y facturación electrónica', { align: 'left' })

      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000')
        .text('FACTURA', 350, 50, { align: 'right' })
      doc.font('Helvetica').fontSize(9).fillColor('#666')
        .text(`Nº interno: ${String(inv.id).padStart(6, '0')}`, 350, 70, { align: 'right' })
        .text(`Período:     ${inv.period}`, 350, 84, { align: 'right' })
        .text(`Estado:      ${inv.status}`, 350, 98, { align: 'right' })
      if (inv.issued_at) {
        doc.text(`Emisión:     ${new Date(inv.issued_at).toLocaleDateString('es-CL')}`, 350, 112, { align: 'right' })
      }
      if (inv.due_at) {
        doc.text(`Vencimiento: ${new Date(inv.due_at).toLocaleDateString('es-CL')}`, 350, 126, { align: 'right' })
      }

      doc.moveDown(4)

      // ── Issuer / Receiver ──────────────────────────────────
      doc.fontSize(8).fillColor('#666').text('EMISOR', 50, 160)
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text('Cuentax SpA', 50, 174)
      doc.font('Helvetica').fontSize(9).fillColor('#333')
        .text('soporte@cuentax.cl', 50, 188)

      doc.font('Helvetica').fontSize(8).fillColor('#666').text('CLIENTE', 320, 160)
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text(tenant.name, 320, 174)
      doc.font('Helvetica').fontSize(9).fillColor('#333')
      if (tenant.primary_rut)   doc.text(`RUT: ${tenant.primary_rut}`, 320, 188)
      if (tenant.billing_email) doc.text(tenant.billing_email, 320, 202)
      if (plan)                 doc.text(`Plan: ${plan.name}`, 320, 216)

      // ── Line items table ───────────────────────────────────
      let y = 260
      doc.lineWidth(0.5).strokeColor('#999').moveTo(50, y).lineTo(545, y).stroke()
      y += 6
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#666')
        .text('DESCRIPCIÓN', 50, y)
        .text('CANT', 360, y, { width: 50, align: 'right' })
        .text('PRECIO',  410, y, { width: 60, align: 'right' })
        .text('TOTAL',   480, y, { width: 65, align: 'right' })
      y += 14
      doc.lineWidth(0.5).moveTo(50, y).lineTo(545, y).stroke()
      y += 8

      doc.font('Helvetica').fontSize(9).fillColor('#000')
      for (const item of items) {
        doc.text(item.description, 50, y, { width: 300 })
        doc.text(String(item.quantity), 360, y, { width: 50, align: 'right' })
        doc.text(clpFmt(item.unit_price_clp), 410, y, { width: 60, align: 'right' })
        doc.text(clpFmt(item.amount_clp), 480, y, { width: 65, align: 'right' })
        y += 16
      }

      doc.lineWidth(0.5).moveTo(50, y).lineTo(545, y).stroke()
      y += 10

      // ── Totals ─────────────────────────────────────────────
      doc.font('Helvetica').fontSize(10).fillColor('#333')
      doc.text('Subtotal', 380, y, { width: 100, align: 'right' })
      doc.text(clpFmt(inv.subtotal_clp), 480, y, { width: 65, align: 'right' })
      y += 16
      doc.text('IVA 19%', 380, y, { width: 100, align: 'right' })
      doc.text(clpFmt(inv.iva_clp), 480, y, { width: 65, align: 'right' })
      y += 16
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#000')
      doc.text('TOTAL', 380, y, { width: 100, align: 'right' })
      doc.text(clpFmt(inv.total_clp), 480, y, { width: 65, align: 'right' })

      // ── Footer ─────────────────────────────────────────────
      doc.font('Helvetica').fontSize(8).fillColor('#888')
      doc.text(
        'Esta factura corresponde al servicio de suscripción a Cuentax. ' +
        'Las líneas de "revenue share" reflejan el porcentaje pactado del despacho contable.',
        50, 760, { width: 495, align: 'center' },
      )

      doc.end()
    } catch (err) {
      reject(err as Error)
    }
  })
}
