/**
 * CUENTAX — Customer Portal de billing.
 *
 * El tenant (contador) ve su suscripción activa, plan, e invoices
 * históricos. La gestión de tarjeta y cambio de plan se habilita una
 * vez configurado MercadoPago en la cuenta de Cuentax.
 *
 * Refs: docs/multitenancy/phase-02-billing.md T2.9
 */
'use client'

import { useEffect, useState } from 'react'
import { Loader2, CreditCard, FileText, AlertCircle, ExternalLink } from 'lucide-react'
import { apiClient } from '@/lib/api-client'

interface Subscription {
  id: number
  plan_id: number
  status: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'paused'
  current_period_end: string | null
  trial_ends_at: string | null
  payment_provider: string
  provider_subscription_id: string | null
  cancel_at_period_end: boolean
}

interface Invoice {
  id: number
  period: string
  status: 'draft' | 'issued' | 'paid' | 'past_due' | 'void'
  subtotal_clp: number
  iva_clp: number
  total_clp: number
  due_at: string | null
  paid_at: string | null
}

const clpFmt = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const statusBadge: Record<string, string> = {
  draft:    'bg-zinc-100 text-zinc-700',
  issued:   'bg-blue-100 text-blue-700',
  paid:     'bg-green-100 text-green-700',
  past_due: 'bg-yellow-100 text-yellow-800',
  void:     'bg-red-100 text-red-700',
  trialing: 'bg-blue-100 text-blue-700',
  active:   'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  paused:   'bg-zinc-100 text-zinc-700',
}

export default function BillingPortalPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [setupLoading, setSetupLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      apiClient.get<Subscription | null>('/api/v1/billing/subscription').then((r) => r.data),
      apiClient.get<{ data: Invoice[] }>('/api/v1/billing/invoices').then((r) => r.data.data),
      // Plans list isn't tenant-scoped; admin endpoint requires admin auth, so
      // for the portal we rely on subscription.plan_id alone for now.
    ])
      .then(([sub, invs]) => {
        setSubscription(sub)
        setInvoices(invs)
      })
      .catch((err) => setError(err?.response?.data?.error ?? 'Error al cargar billing'))
      .finally(() => setLoading(false))
  }, [])

  const startSetup = async (planCode: string) => {
    setSetupLoading(true)
    setError(null)
    try {
      const res = await apiClient.post<{ init_point: string }>('/api/v1/billing/setup-intent', {
        plan_code: planCode,
      })
      window.location.href = res.data.init_point
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error iniciando pago')
    } finally {
      setSetupLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-zinc-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando…
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-blue-600" /> Suscripción y facturación
        </h1>
        <p className="text-sm text-zinc-500 mt-1">Plan, método de pago e invoices de Cuentax.</p>
      </header>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <section className="mb-6 bg-white rounded-lg border border-zinc-200 p-5">
        <h2 className="font-semibold mb-3">Suscripción</h2>
        {subscription ? (
          <div className="space-y-2 text-sm">
            <Row label="Estado">
              <span className={`text-xs px-2 py-0.5 rounded ${statusBadge[subscription.status] ?? ''}`}>
                {subscription.status}
              </span>
            </Row>
            <Row label="Plan">{subscription.plan_id}</Row>
            <Row label="Provider">{subscription.payment_provider}</Row>
            {subscription.trial_ends_at && (
              <Row label="Trial termina">
                {new Date(subscription.trial_ends_at).toLocaleDateString('es-CL')}
              </Row>
            )}
            {subscription.current_period_end && (
              <Row label="Período actual hasta">
                {new Date(subscription.current_period_end).toLocaleDateString('es-CL')}
              </Row>
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm text-zinc-600 mb-3">Sin suscripción activa.</p>
            <div className="flex gap-2">
              {(['starter', 'pro', 'business'] as const).map((code) => (
                <button
                  key={code}
                  disabled={setupLoading}
                  onClick={() => startSetup(code)}
                  className="rounded-md border border-zinc-300 hover:border-blue-500 hover:bg-blue-50 px-4 py-2 text-sm capitalize disabled:opacity-60"
                >
                  Activar {code}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-200">
          <h2 className="font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4" /> Invoices
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="text-left  px-4 py-2">Período</th>
              <th className="text-left  px-4 py-2">Estado</th>
              <th className="text-right px-4 py-2">Subtotal</th>
              <th className="text-right px-4 py-2">IVA</th>
              <th className="text-right px-4 py-2">Total</th>
              <th className="text-left  px-4 py-2">Vence</th>
              <th className="text-left  px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id} className="border-t border-zinc-200">
                <td className="px-4 py-2 font-mono text-xs">{i.period}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${statusBadge[i.status] ?? ''}`}>
                    {i.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-mono">{clpFmt(i.subtotal_clp)}</td>
                <td className="px-4 py-2 text-right font-mono text-zinc-500">{clpFmt(i.iva_clp)}</td>
                <td className="px-4 py-2 text-right font-mono font-semibold">{clpFmt(i.total_clp)}</td>
                <td className="px-4 py-2 text-xs">
                  {i.due_at ? new Date(i.due_at).toLocaleDateString('es-CL') : '—'}
                </td>
                <td className="px-4 py-2">
                  {i.status !== 'draft' && (
                    <a
                      href={`/api/v1/billing/invoices/${i.id}/pdf`}
                      className="text-blue-600 hover:underline inline-flex items-center gap-1 text-xs"
                    >
                      Ver <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-zinc-500">
                  Sin invoices todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-zinc-500">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  )
}
