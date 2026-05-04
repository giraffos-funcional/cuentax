/**
 * Mercado Pago provider.
 *
 * Auth: Bearer access token (test-or-production).
 * Currency: CLP, integer amounts.
 * Subscriptions: `preapproval` resource.
 * One-shots:    `/v1/payments` against a saved customer card_id.
 *
 * Webhook signature (Mercado Pago):
 *   Header `x-signature: ts=<timestamp>,v1=<hmacSha256>`
 *   Header `x-request-id`
 *   The signed string is: `id:<dataID>;request-id:<x-request-id>;ts:<ts>;`
 *   HMAC key: the secret you configured in the MP webhooks panel.
 *
 * References:
 *   - https://www.mercadopago.com.cl/developers/en/docs/subscriptions/integration-configuration
 *   - https://www.mercadopago.com.cl/developers/en/docs/your-integrations/notifications/webhooks
 */
import { createHmac, timingSafeEqual } from 'crypto'
import type {
  BillingProvider,
  CancelSubscriptionInput,
  ChargeOneTimeInput,
  ChargeOneTimeResult,
  CreateSubscriptionInput,
  CreateSubscriptionResult,
  ProviderPayment,
  SetupIntentInput,
  SetupIntentResult,
  WebhookVerification,
} from '../types'

const DEFAULT_BASE_URL = 'https://api.mercadopago.com'

export interface MercadoPagoConfig {
  /** Bearer access token (TEST-... in sandbox, APP_USR-... in prod). */
  accessToken: string
  /** Webhook signature secret (configured in MP panel). */
  webhookSecret: string
  /** API base URL. Override only for stubbed tests. */
  baseUrl?: string
  /** URL the provider will POST notifications to. */
  notificationUrl?: string
  /** Optional override of fetch (for tests). */
  fetchImpl?: typeof fetch
}

interface MpPreapproval {
  id: string
  init_point: string
  status: string
}

interface MpPayment {
  id: number | string
  status: 'pending' | 'approved' | 'rejected' | 'refunded' | 'in_process'
  status_detail?: string
  transaction_amount: number
  metadata?: Record<string, unknown>
}

export class MercadoPagoProvider implements BillingProvider {
  readonly name = 'mercadopago'
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(private readonly config: MercadoPagoConfig) {
    if (!config.accessToken) throw new Error('MercadoPagoProvider: accessToken required')
    if (!config.webhookSecret) throw new Error('MercadoPagoProvider: webhookSecret required')
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
    this.fetchImpl = config.fetchImpl ?? fetch
  }

  // ── HTTP helpers ───────────────────────────────────────────────
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'authorization': `Bearer ${this.config.accessToken}`,
        'content-type': 'application/json',
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`MercadoPago ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`)
    }
    return text ? (JSON.parse(text) as T) : ({} as T)
  }

  // ── BillingProvider methods ────────────────────────────────────
  async createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult> {
    const result = await this.request<MpPreapproval>('POST', '/preapproval', {
      reason: `Cuentax — Plan ${input.plan.name}`,
      external_reference: `tenant:${input.tenant.id}`,
      payer_email: input.tenant.email,
      back_url: input.back_url,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: input.plan.base_price_clp,
        currency_id: 'CLP',
        ...(input.start_at ? { start_date: input.start_at.toISOString() } : {}),
      },
      ...(this.config.notificationUrl ? { notification_url: this.config.notificationUrl } : {}),
    })
    return {
      provider_subscription_id: result.id,
      init_point: result.init_point,
      raw_status: result.status,
    }
  }

  async setupIntent(input: SetupIntentInput): Promise<SetupIntentResult> {
    // For MP, setup-intent IS createSubscription with status "pending" — the
    // user enters their card on the init_point; once authorized the
    // preapproval moves to "authorized" and starts charging.
    const sub = await this.createSubscription({
      tenant: input.tenant,
      plan: input.plan,
      back_url: input.back_url,
    })
    return {
      init_point: sub.init_point,
      provider_subscription_id: sub.provider_subscription_id,
    }
  }

  async chargeOneTime(input: ChargeOneTimeInput): Promise<ChargeOneTimeResult> {
    const idempotency: Record<string, string> = input.idempotency_key
      ? { 'x-idempotency-key': input.idempotency_key }
      : {}
    const payload: Record<string, unknown> = {
      transaction_amount: input.amount_clp,
      description: input.description,
      payment_method_id: 'master', // overridden by token; required by API
      token: input.payment_method_token,
      external_reference: `tenant:${input.tenant.id}`,
      payer: { email: input.tenant.email },
    }
    const result = await this.request<MpPayment>('POST', '/v1/payments', payload, idempotency)
    // For one-time charges we never expect 'refunded' as initial result.
    const status = (result.status === 'refunded' ? 'rejected' : result.status) as
      'pending' | 'approved' | 'rejected' | 'in_process'
    return {
      provider_txn_id: String(result.id),
      status,
      failure_reason: result.status_detail,
      raw_payload: result,
    }
  }

  async cancelSubscription(input: CancelSubscriptionInput): Promise<void> {
    await this.request('PUT', `/preapproval/${input.provider_subscription_id}`, {
      status: 'cancelled',
    })
  }

  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string,
  ): WebhookVerification {
    const sig = single(headers['x-signature'])
    const reqId = single(headers['x-request-id'])
    if (!sig || !reqId) {
      return { valid: false, reason: 'missing signature or request id headers' }
    }

    // x-signature format: "ts=<timestamp>,v1=<hmac>"
    const parts = Object.fromEntries(
      sig.split(',').map((kv) => {
        const [k, ...rest] = kv.split('=')
        return [k!.trim(), rest.join('=').trim()]
      }),
    )
    const ts = parts['ts']
    const v1 = parts['v1']
    if (!ts || !v1) return { valid: false, reason: 'malformed x-signature' }

    // The dataID is the resource id — MP sends it as ?data.id=... in the URL
    // OR in the JSON body. Support both.
    let dataId: string | undefined
    try {
      const body = JSON.parse(rawBody) as { data?: { id?: string | number }; type?: string }
      if (body?.data?.id !== undefined) dataId = String(body.data.id)
      const topic = body?.type
      if (!dataId) return { valid: false, reason: 'no data.id in body' }
      const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`
      const hmac = createHmac('sha256', this.config.webhookSecret)
        .update(manifest)
        .digest('hex')
      const a = Buffer.from(hmac, 'hex')
      const b = Buffer.from(v1, 'hex')
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return { valid: false, reason: 'signature mismatch' }
      }
      return { valid: true, resource_id: dataId, topic }
    } catch (err) {
      return { valid: false, reason: `invalid body: ${(err as Error).message}` }
    }
  }

  async getPayment(providerTxnId: string): Promise<ProviderPayment> {
    const p = await this.request<MpPayment>('GET', `/v1/payments/${providerTxnId}`)
    return {
      id: String(p.id),
      status: p.status,
      amount_clp: Math.round(p.transaction_amount),
      failure_reason: p.status_detail,
      metadata: p.metadata,
      raw: p,
    }
  }
}

function single(h: string | string[] | undefined): string | undefined {
  if (Array.isArray(h)) return h[0]
  return h
}
