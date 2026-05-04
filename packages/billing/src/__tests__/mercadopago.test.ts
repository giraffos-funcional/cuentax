import { describe, it, expect, vi } from 'vitest'
import { createHmac } from 'crypto'
import { MercadoPagoProvider } from '../providers/mercadopago'

const SECRET = 'test-webhook-secret'

function makeProvider(fetchImpl?: typeof fetch) {
  return new MercadoPagoProvider({
    accessToken: 'TEST-token',
    webhookSecret: SECRET,
    baseUrl: 'https://mp.local',
    fetchImpl: fetchImpl ?? (vi.fn() as unknown as typeof fetch),
  })
}

describe('MercadoPagoProvider — webhook verification', () => {
  it('accepts a valid x-signature', () => {
    const dataId = '12345'
    const reqId = 'req-abc'
    const ts = '1700000000'
    const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`
    const v1 = createHmac('sha256', SECRET).update(manifest).digest('hex')

    const result = makeProvider().verifyWebhook(
      { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': reqId },
      JSON.stringify({ type: 'payment', data: { id: dataId } }),
    )
    expect(result).toEqual({ valid: true, resource_id: dataId, topic: 'payment' })
  })

  it('rejects an invalid signature', () => {
    const result = makeProvider().verifyWebhook(
      { 'x-signature': 'ts=1700000000,v1=deadbeef', 'x-request-id': 'r1' },
      JSON.stringify({ type: 'payment', data: { id: '1' } }),
    )
    expect(result.valid).toBe(false)
  })

  it('rejects when headers are missing', () => {
    const r = makeProvider().verifyWebhook({}, '{"data":{"id":"1"}}')
    expect(r.valid).toBe(false)
    expect(r.reason).toMatch(/missing/)
  })

  it('rejects when body lacks data.id', () => {
    const reqId = 'req-1'
    const ts = '1700000000'
    const v1 = createHmac('sha256', SECRET).update(`id:0;request-id:${reqId};ts:${ts};`).digest('hex')
    const r = makeProvider().verifyWebhook(
      { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': reqId },
      '{}',
    )
    expect(r.valid).toBe(false)
  })
})

describe('MercadoPagoProvider — createSubscription', () => {
  it('POSTs to /preapproval with CLP integer amount and tenant external_reference', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'pre-1', init_point: 'https://mp.local/cb', status: 'pending' }), {
        status: 200,
      }),
    )
    const p = makeProvider(fetchSpy as unknown as typeof fetch)
    const result = await p.createSubscription({
      tenant: { id: 42, slug: 'demo', name: 'Demo', email: 'billing@demo.cl' },
      plan: { code: 'pro', name: 'Pro', base_price_clp: 49000 },
      back_url: 'https://demo.cuentax.cl/billing/return',
    })
    expect(result.provider_subscription_id).toBe('pre-1')
    expect(result.init_point).toBe('https://mp.local/cb')

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toBe('https://mp.local/preapproval')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.payer_email).toBe('billing@demo.cl')
    expect(body.external_reference).toBe('tenant:42')
    expect(body.auto_recurring.transaction_amount).toBe(49000)
    expect(body.auto_recurring.currency_id).toBe('CLP')
    expect(body.auto_recurring.frequency).toBe(1)
    expect(body.auto_recurring.frequency_type).toBe('months')
  })
})

describe('MercadoPagoProvider — chargeOneTime', () => {
  it('POSTs /v1/payments with idempotency header', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ id: 999, status: 'approved', transaction_amount: 5000 }), { status: 200 }),
    )
    const p = makeProvider(fetchSpy as unknown as typeof fetch)
    const r = await p.chargeOneTime({
      tenant: { id: 1, slug: 'a', name: 'A', email: 'a@a' },
      amount_clp: 5000,
      description: 'Overage',
      idempotency_key: 'inv-7-overage',
      payment_method_token: 'card-tok',
    })
    expect(r.provider_txn_id).toBe('999')
    expect(r.status).toBe('approved')
    const init = fetchSpy.mock.calls[0]![1] as RequestInit
    expect((init.headers as Record<string, string>)['x-idempotency-key']).toBe('inv-7-overage')
  })
})
