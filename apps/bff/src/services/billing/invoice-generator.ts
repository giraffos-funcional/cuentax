/**
 * Monthly invoice generator (Phase 02 T2.6).
 *
 * For a given tenant + period, builds a draft invoice with:
 *   - subscription line item (plan base price)
 *   - overage line item (DTEs over plan inclusion × overage_price)
 *   - revenue-share line items (injected by services/revenue-share/injector)
 *
 * Idempotent on (tenant_id, period). Re-running on a draft replaces line
 * items; if the invoice is already issued/paid it is left untouched.
 *
 * Notes on DTE 33 issuance: in slice 1 we leave dte_id null. Once
 * Cuentax's CAF + cert SII for self-issuance is wired, hook the issuer
 * here and set issued_at/dte_id.
 */
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { tenants, plans, subscriptions, invoices, invoiceLineItems, companies } from '@/db/schema'
import { logger } from '@/core/logger'

export interface GenerateInput {
  tenantId: number
  period: string  // YYYY-MM
}

export async function generateMonthlyInvoice(
  input: GenerateInput,
): Promise<{ invoice_id: number; total_clp: number; created: boolean }> {
  if (!/^\d{4}-\d{2}$/.test(input.period)) {
    throw new Error(`Invalid period: ${input.period}`)
  }

  // Tenant + active subscription
  const tenantRow = await db.select().from(tenants).where(eq(tenants.id, input.tenantId)).limit(1)
  const tenant = tenantRow[0]
  if (!tenant) throw new Error(`tenant ${input.tenantId} not found`)

  const subRow = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenant_id, input.tenantId))
    .orderBy(sql`${subscriptions.created_at} DESC`)
    .limit(1)
  const subscription = subRow[0]

  // Plan: prefer subscription.plan, fallback to tenant.plan_id
  const planId = subscription?.plan_id ?? tenant.plan_id
  if (!planId) {
    throw new Error(`tenant ${tenant.slug} has no plan to invoice`)
  }
  const planRow = await db.select().from(plans).where(eq(plans.id, planId)).limit(1)
  const plan = planRow[0]
  if (!plan) throw new Error(`plan ${planId} not found`)

  // Existing invoice for this period?
  const existing = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.tenant_id, tenant.id), eq(invoices.period, input.period)))
    .limit(1)

  if (existing[0] && existing[0].status !== 'draft') {
    logger.info({ tenantId: tenant.id, period: input.period, status: existing[0].status }, 'invoice_already_finalized')
    return { invoice_id: existing[0].id, total_clp: existing[0].total_clp, created: false }
  }

  // ── Compute usage: DTEs emitted by tenant's companies during the period.
  const usage = await db.execute(sql`
    SELECT COUNT(*)::int AS dtes
    FROM dte_documents d
    JOIN companies c ON c.id = d.company_id
    WHERE c.tenant_id = ${tenant.id}
      AND to_char(d.created_at AT TIME ZONE 'America/Santiago', 'YYYY-MM') = ${input.period}
      AND d.estado IN ('aceptado','enviado','firmado')
  `)
  const dtesEmitted = Number((usage as any).rows?.[0]?.dtes ?? (usage as any)[0]?.dtes ?? 0)
  const overageDtes = Math.max(0, dtesEmitted - plan.included_dtes)

  // ── Insert / replace draft invoice
  let invoiceId: number
  let created = false

  if (existing[0]) {
    invoiceId = existing[0].id
    // Wipe subscription/overage line items (rs items handled by injector separately).
    await db
      .delete(invoiceLineItems)
      .where(
        and(
          eq(invoiceLineItems.invoice_id, invoiceId),
          sql`${invoiceLineItems.type} IN ('subscription','overage')`,
        ),
      )
  } else {
    const [row] = await db
      .insert(invoices)
      .values({
        tenant_id:       tenant.id,
        subscription_id: subscription?.id ?? null,
        period:          input.period,
        status:          'draft',
        due_at:          dueDateOf(input.period),
        metadata:        { plan_code: plan.code },
      })
      .returning()
    if (!row) throw new Error('Failed to insert invoice')
    invoiceId = row.id
    created = true
  }

  // ── Line items
  const lineItems: Array<typeof invoiceLineItems.$inferInsert> = [
    {
      invoice_id:    invoiceId,
      type:          'subscription',
      description:   `Suscripción Cuentax — ${plan.name} (${input.period})`,
      quantity:      1,
      unit_price_clp: plan.base_price_clp,
      amount_clp:    plan.base_price_clp,
      metadata:      { plan_code: plan.code },
    },
  ]
  if (overageDtes > 0 && plan.overage_price_per_dte_clp > 0) {
    lineItems.push({
      invoice_id:    invoiceId,
      type:          'overage',
      description:   `Overage DTEs (${overageDtes} sobre ${plan.included_dtes} incluidos)`,
      quantity:      overageDtes,
      unit_price_clp: plan.overage_price_per_dte_clp,
      amount_clp:    overageDtes * plan.overage_price_per_dte_clp,
      metadata:      { dtes_emitted: dtesEmitted, plan_included: plan.included_dtes },
    })
  }
  await db.insert(invoiceLineItems).values(lineItems)

  // ── Recompute totals (re-summing accounts for any pre-existing rs items)
  const sumRow = await db.execute(sql`
    SELECT COALESCE(SUM(amount_clp), 0)::int AS subtotal
    FROM invoice_line_items
    WHERE invoice_id = ${invoiceId}
  `)
  const subtotal = Number((sumRow as any).rows?.[0]?.subtotal ?? (sumRow as any)[0]?.subtotal ?? 0)
  const iva = Math.round(subtotal * 0.19)
  const total = subtotal + iva

  await db
    .update(invoices)
    .set({
      subtotal_clp: subtotal,
      iva_clp:      iva,
      total_clp:    total,
      updated_at:   new Date(),
    })
    .where(eq(invoices.id, invoiceId))

  logger.info(
    { tenantId: tenant.id, period: input.period, invoiceId, subtotal, total },
    'invoice.generated',
  )

  return { invoice_id: invoiceId, total_clp: total, created }
}

function dueDateOf(period: string): Date {
  // Due on the 5th of the following month, 23:59 CLT (UTC-4 → 03:59 UTC next day).
  const [y, m] = period.split('-').map(Number)
  if (!y || !m) throw new Error(`Invalid period: ${period}`)
  return new Date(Date.UTC(y, m, 5, 3, 59, 0))
}

/** Avoid unused-import warning. */
void companies
