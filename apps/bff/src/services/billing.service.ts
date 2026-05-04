/**
 * Billing service — orchestrates the BillingProvider against our DB.
 *
 * Owns:
 *   - Provider selection (Mercado Pago today; pluggable for Webpay/Stripe later).
 *   - setupIntent: create a preapproval, store the pending subscription row,
 *     return the init_point for the customer portal redirect.
 *   - handlePaymentEvent: idempotently reconcile a webhook payment with our
 *     payments + invoices tables.
 *
 * Refs: docs/multitenancy/phase-02-billing.md T2.3, T2.4, T2.5
 */
import { eq } from 'drizzle-orm'
import {
  MercadoPagoProvider,
  type BillingProvider,
  type ProviderPayment,
} from '@cuentax/billing'
import { config } from '@/core/config'
import { db, pool } from '@/db/client'
import { subscriptions, plans, tenants } from '@/db/schema'
import { logger } from '@/core/logger'

let providerInstance: BillingProvider | null = null

export function getBillingProvider(): BillingProvider {
  if (providerInstance) return providerInstance
  if (!config.MP_ACCESS_TOKEN || !config.MP_WEBHOOK_SECRET) {
    throw new Error(
      'Billing provider not configured: set MP_ACCESS_TOKEN and MP_WEBHOOK_SECRET',
    )
  }
  providerInstance = new MercadoPagoProvider({
    accessToken: config.MP_ACCESS_TOKEN,
    webhookSecret: config.MP_WEBHOOK_SECRET,
    baseUrl: config.MP_BASE_URL,
    notificationUrl: config.MP_NOTIFICATION_URL || undefined,
  })
  return providerInstance
}

/** Allow tests to inject a fake provider. */
export function setBillingProvider(p: BillingProvider | null): void {
  providerInstance = p
}

export async function createSetupIntent(
  tenantId: number,
  planCode: string,
): Promise<{ init_point: string; subscription_id: number }> {
  const tenantRows = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1)
  const tenant = tenantRows[0]
  if (!tenant) throw new Error(`tenant ${tenantId} not found`)

  const planRows = await db.select().from(plans).where(eq(plans.code, planCode)).limit(1)
  const plan = planRows[0]
  if (!plan) throw new Error(`plan ${planCode} not found`)

  const provider = getBillingProvider()
  const result = await provider.setupIntent({
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      email: tenant.billing_email ?? `billing+${tenant.slug}@cuentax.cl`,
      rut: tenant.primary_rut ?? undefined,
    },
    plan: {
      code: plan.code,
      name: plan.name,
      base_price_clp: plan.base_price_clp,
    },
    back_url: config.BILLING_BACK_URL,
  })

  const [row] = await db
    .insert(subscriptions)
    .values({
      tenant_id: tenant.id,
      plan_id: plan.id,
      status: 'trialing',
      payment_provider: provider.name,
      provider_subscription_id: result.provider_subscription_id,
    })
    .returning()

  if (!row) throw new Error('failed to insert subscription')
  logger.info(
    { tenantId, subscriptionId: row.id, providerSubId: result.provider_subscription_id },
    'billing.setup_intent_created',
  )
  return { init_point: result.init_point, subscription_id: row.id }
}

/**
 * Idempotent webhook payment handler. Caller has already verified the signature.
 * If the payment can't be tied to a tenant yet (e.g. external_reference missing),
 * we still record the row but don't transition any invoice/tenant state.
 */
export async function handlePaymentEvent(providerTxnId: string): Promise<void> {
  const provider = getBillingProvider()
  const payment: ProviderPayment = await provider.getPayment(providerTxnId)

  const externalRef = (payment.metadata as { external_reference?: string } | undefined)?.external_reference
  let tenantId: number | null = null
  if (externalRef?.startsWith('tenant:')) {
    const parsed = Number(externalRef.slice(7))
    if (Number.isInteger(parsed) && parsed > 0) tenantId = parsed
  }

  // Idempotent upsert by (provider, provider_txn_id).
  if (tenantId) {
    await pool.query(
      `INSERT INTO payments (provider, provider_txn_id, tenant_id, amount_clp, status, failure_reason, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (provider, provider_txn_id) DO UPDATE SET
         status = EXCLUDED.status,
         failure_reason = EXCLUDED.failure_reason,
         raw_payload = EXCLUDED.raw_payload,
         updated_at = now()`,
      [
        provider.name,
        payment.id,
        tenantId,
        payment.amount_clp,
        payment.status,
        payment.failure_reason ?? null,
        JSON.stringify(payment.raw),
      ],
    )

    if (payment.status === 'approved') {
      await pool.query(
        `UPDATE invoices SET status = 'paid', paid_at = now() WHERE tenant_id = $1 AND status = 'issued'`,
        [tenantId],
      )
      await pool.query(
        `UPDATE tenants SET status = 'active', updated_at = now() WHERE id = $1 AND status = 'past_due'`,
        [tenantId],
      )
    }
  } else {
    logger.warn({ providerTxnId }, 'billing.payment_no_tenant_ref')
  }

  logger.info(
    { providerTxnId, tenantId, status: payment.status },
    'billing.payment_reconciled',
  )
}
