/**
 * Inject revenue-share line items into a draft invoice.
 *
 * Idempotent: removes any existing rs line items for the invoice before
 * inserting the new ones, so re-running before issue is safe.
 *
 * Refs: docs/multitenancy/phase-03-revenue-share.md T3.6
 */
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { invoices, invoiceLineItems, revenueShareRuns } from '@/db/schema'
import { logger } from '@/core/logger'

export async function injectIntoInvoice(runId: number, invoiceId: number): Promise<void> {
  const runRows = await db.select().from(revenueShareRuns).where(eq(revenueShareRuns.id, runId)).limit(1)
  const run = runRows[0]
  if (!run) throw new Error(`run ${runId} not found`)

  const invRows = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1)
  const inv = invRows[0]
  if (!inv) throw new Error(`invoice ${invoiceId} not found`)
  if (inv.status !== 'draft') {
    throw new Error(`invoice ${invoiceId} is not draft (status=${inv.status})`)
  }

  // Wipe any existing rs line items on this invoice (idempotency).
  await db
    .delete(invoiceLineItems)
    .where(
      and(
        eq(invoiceLineItems.invoice_id, invoiceId),
        inArray(invoiceLineItems.type, [
          'revenue_share_contabilidad',
          'revenue_share_remuneraciones',
        ]),
      ),
    )

  const itemsToInsert: Array<typeof invoiceLineItems.$inferInsert> = []
  if (run.share_contabilidad_clp > 0) {
    itemsToInsert.push({
      invoice_id:    invoiceId,
      type:          'revenue_share_contabilidad',
      description:   `Revenue share contabilidad ${run.period} (${(Number(run.rate_contabilidad) * 100).toFixed(2)}%)`,
      quantity:      1,
      unit_price_clp: run.share_contabilidad_clp,
      amount_clp:    run.share_contabilidad_clp,
      metadata:      { run_id: runId, period: run.period },
    })
  }
  if (run.share_remuneraciones_clp > 0) {
    itemsToInsert.push({
      invoice_id:    invoiceId,
      type:          'revenue_share_remuneraciones',
      description:   `Revenue share remuneraciones ${run.period} (${(Number(run.rate_remuneraciones) * 100).toFixed(2)}%)`,
      quantity:      1,
      unit_price_clp: run.share_remuneraciones_clp,
      amount_clp:    run.share_remuneraciones_clp,
      metadata:      { run_id: runId, period: run.period },
    })
  }

  if (itemsToInsert.length > 0) {
    await db.insert(invoiceLineItems).values(itemsToInsert)
  }

  // Recalculate invoice totals from sum of line items.
  const sumRow = await db.execute(sql`
    SELECT COALESCE(SUM(amount_clp), 0)::int AS subtotal
    FROM invoice_line_items
    WHERE invoice_id = ${invoiceId}
  `)
  const subtotal = Number((sumRow as any).rows?.[0]?.subtotal ?? (sumRow as any)[0]?.subtotal ?? 0)
  const iva = Math.round(subtotal * 0.19)

  await db
    .update(invoices)
    .set({
      subtotal_clp: subtotal,
      iva_clp:      iva,
      total_clp:    subtotal + iva,
      updated_at:   new Date(),
    })
    .where(eq(invoices.id, invoiceId))

  await db
    .update(revenueShareRuns)
    .set({ status: 'invoiced', invoice_id: invoiceId })
    .where(eq(revenueShareRuns.id, runId))

  logger.info({ runId, invoiceId, subtotal }, 'rs.injected_into_invoice')
}
