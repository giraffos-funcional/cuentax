import { notFound, redirect } from 'next/navigation'
import { adminFetch, AdminApiError, type Plan, type Tenant } from '@/lib/api'

interface TenantDetail extends Tenant {
  plan: Plan | null
  usage: { companies: number; dtes_last_30d: number }
}

export default async function TenantDetailPage({ params }: { params: { slug: string } }) {
  let tenant: TenantDetail
  try {
    tenant = await adminFetch<TenantDetail>(`/tenants/${params.slug}`)
  } catch (err) {
    if (err instanceof AdminApiError && err.status === 404) notFound()
    throw err
  }

  async function suspend() {
    'use server'
    await adminFetch(`/tenants/${params.slug}/suspend`, { method: 'POST' })
    redirect(`/dashboard/tenants/${params.slug}`)
  }
  async function reactivate() {
    'use server'
    await adminFetch(`/tenants/${params.slug}/reactivate`, { method: 'POST' })
    redirect(`/dashboard/tenants/${params.slug}`)
  }

  async function updateRevShare(formData: FormData) {
    'use server'
    const cont = Number(formData.get('contabilidad'))
    const rem = Number(formData.get('remuneraciones'))
    if (!Number.isFinite(cont) || !Number.isFinite(rem)) return
    await adminFetch(`/tenants/${params.slug}/revenue-share`, {
      method: 'PATCH',
      body: { contabilidad: cont / 100, remuneraciones: rem / 100 },
    })
    redirect(`/dashboard/tenants/${params.slug}`)
  }

  const isSuspended = tenant.status === 'suspended' || tenant.status === 'cancelled'

  return (
    <>
      <header className="mb-6">
        <p className="text-xs text-muted-foreground font-mono">{tenant.slug}.cuentax.cl</p>
        <h2 className="text-2xl font-semibold">{tenant.name}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Estado: <span className="font-medium">{tenant.status}</span> · creado{' '}
          {new Date(tenant.created_at).toLocaleDateString('es-CL')}
        </p>
      </header>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground">Companies (PYMEs)</p>
          <p className="text-2xl font-semibold">{tenant.usage.companies}</p>
        </div>
        <div className="bg-white border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground">DTEs últimos 30d</p>
          <p className="text-2xl font-semibold">{tenant.usage.dtes_last_30d}</p>
        </div>
        <div className="bg-white border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground">Plan</p>
          <p className="text-2xl font-semibold">{tenant.plan?.name ?? '—'}</p>
          {tenant.plan && (
            <p className="text-xs text-muted-foreground">
              {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(tenant.plan.base_price_clp)} /mes
            </p>
          )}
        </div>
      </div>

      <section className="bg-white border border-border rounded-lg p-6 mb-6">
        <h3 className="font-semibold mb-3">Datos</h3>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-muted-foreground">RUT principal</dt>
          <dd className="font-mono">{tenant.primary_rut ?? '—'}</dd>
          <dt className="text-muted-foreground">Email facturación</dt>
          <dd>{tenant.billing_email ?? '—'}</dd>
          <dt className="text-muted-foreground">Trial termina</dt>
          <dd>{tenant.trial_ends_at ? new Date(tenant.trial_ends_at).toLocaleDateString('es-CL') : '—'}</dd>
        </dl>
      </section>

      <section className="bg-white border border-border rounded-lg p-6 mb-6">
        <h3 className="font-semibold mb-3">Revenue share</h3>
        <form action={updateRevShare} className="grid grid-cols-3 gap-4 items-end">
          <label className="block">
            <span className="text-sm font-medium">% Contabilidad</span>
            <input
              type="number"
              name="contabilidad"
              defaultValue={(Number(tenant.revenue_share_rate_contabilidad) * 100).toFixed(2)}
              min="0"
              max="100"
              step="0.01"
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm font-mono"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">% Remuneraciones</span>
            <input
              type="number"
              name="remuneraciones"
              defaultValue={(Number(tenant.revenue_share_rate_remuneraciones) * 100).toFixed(2)}
              min="0"
              max="100"
              step="0.01"
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm font-mono"
            />
          </label>
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Guardar
          </button>
        </form>
      </section>

      <section className="bg-white border border-border rounded-lg p-6">
        <h3 className="font-semibold mb-3">Acciones</h3>
        <div className="flex gap-2">
          {!isSuspended ? (
            <form action={suspend}>
              <button className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground">
                Suspender
              </button>
            </form>
          ) : (
            <form action={reactivate}>
              <button className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white">
                Reactivar
              </button>
            </form>
          )}
        </div>
      </section>
    </>
  )
}
