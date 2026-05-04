/**
 * Billing provider abstraction.
 *
 * Phase 02 ships with a Mercado Pago implementation. The interface is
 * designed to admit additional providers (Webpay, Stripe) without
 * touching the BFF call sites.
 *
 * Notes for Mercado Pago:
 *   - Subscription = `preapproval` resource (auto-charge mensual).
 *   - Overage     = one-shot `payment` against the saved card_id.
 *   - CLP has no decimals; transaction_amount is integer.
 */

export interface BillingTenantContext {
  /** Internal tenant id. */
  id: number
  slug: string
  name: string
  /** Customer email used for the provider's customer record. */
  email: string
  /** Internal company RUT (optional, for receipts). */
  rut?: string
}

export interface BillingPlanContext {
  code: string
  name: string
  base_price_clp: number
}

export interface CreateSubscriptionInput {
  tenant: BillingTenantContext
  plan: BillingPlanContext
  /** URL the provider will return the user to after card capture. */
  back_url: string
  /** Optional explicit start date — defaults to provider's "now". */
  start_at?: Date
}

export interface CreateSubscriptionResult {
  /** Provider id (e.g. MP `preapproval` id). */
  provider_subscription_id: string
  /** URL where the user enters the card to authorize the preapproval. */
  init_point: string
  /** Native status string from the provider. */
  raw_status: string
}

export interface ChargeOneTimeInput {
  tenant: BillingTenantContext
  /** Amount in CLP (integer). */
  amount_clp: number
  description: string
  /** Idempotency key to dedupe retries. */
  idempotency_key?: string
  /** Saved card token / id from the provider. */
  payment_method_token: string
}

export interface ChargeOneTimeResult {
  provider_txn_id: string
  status: 'pending' | 'approved' | 'rejected' | 'in_process'
  failure_reason?: string
  raw_payload: unknown
}

export interface CancelSubscriptionInput {
  provider_subscription_id: string
}

export interface SetupIntentInput {
  tenant: BillingTenantContext
  plan: BillingPlanContext
  back_url: string
}

export interface SetupIntentResult {
  /** URL where the tenant attaches a card for recurring billing. */
  init_point: string
  /** Provider preapproval id (Mercado Pago) — also the future subscription id. */
  provider_subscription_id: string
}

export interface BillingProvider {
  readonly name: string

  createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult>
  chargeOneTime(input: ChargeOneTimeInput): Promise<ChargeOneTimeResult>
  cancelSubscription(input: CancelSubscriptionInput): Promise<void>
  setupIntent(input: SetupIntentInput): Promise<SetupIntentResult>

  /**
   * Validate a webhook signature and return the parsed event id, or null
   * if the signature is invalid. Implementations are responsible for
   * fetching the resource from the provider afterwards (don't trust
   * webhook bodies — they're notification triggers, not source of truth).
   */
  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string,
  ): WebhookVerification

  /** Fetch a payment by its provider id (e.g. for webhook reconciliation). */
  getPayment(providerTxnId: string): Promise<ProviderPayment>
}

export interface WebhookVerification {
  valid: boolean
  /** When valid, the resource id reported by the webhook (e.g. payment.id). */
  resource_id?: string
  /** Topic / type as reported by the provider. */
  topic?: string
  reason?: string
}

export interface ProviderPayment {
  id: string
  status: 'pending' | 'approved' | 'rejected' | 'refunded' | 'in_process'
  amount_clp: number
  failure_reason?: string
  metadata?: Record<string, unknown>
  raw: unknown
}
