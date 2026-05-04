import { redirect } from 'next/navigation'
import { adminFetch, AdminApiError, type Plan } from '@/lib/api'

export default async function NewTenantPage({
  searchParams,
}: {
  searchParams: { error?: string; code?: string }
}) {
  const plansResp = await adminFetch<{ data: Plan[] }>('/plans')

  async function create(formData: FormData) {
    'use server'
    const slug = String(formData.get('slug') ?? '').trim().toLowerCase()
    const name = String(formData.get('name') ?? '').trim()
    const primary_rut = String(formData.get('primary_rut') ?? '').trim() || undefined
    const billing_email = String(formData.get('billing_email') ?? '').trim() || undefined
    const plan_code = String(formData.get('plan_code') ?? '') || undefined
    const status = (String(formData.get('status') ?? 'trialing')) as 'trialing' | 'active'

    try {
      await adminFetch('/tenants', {
        method: 'POST',
        body: { slug, name, primary_rut, billing_email, plan_code, status },
      })
    } catch (err) {
      if (err instanceof AdminApiError) {
        const code = (err.body as { error?: string })?.error ?? 'unknown'
        redirect(`/dashboard/tenants/new?error=1&code=${encodeURIComponent(code)}`)
      }
      throw err
    }
    redirect(`/dashboard/tenants/${slug}`)
  }

  return (
    <>
      <header className="mb-6">
        <h2 className="text-2xl font-semibold">Nuevo tenant</h2>
        <p className="text-sm text-muted-foreground">Provisioning manual desde admin</p>
      </header>

      {searchParams.error && (
        <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-800">
          Error: <code>{searchParams.code ?? 'unknown'}</code>
          {searchParams.code === 'slug_taken'    && ' — el slug ya está en uso.'}
          {searchParams.code === 'reserved_slug' && ' — el slug está reservado (ej: admin, api, www).'}
          {searchParams.code === 'invalid_slug'  && ' — el slug debe ser [a-z0-9-], sin empezar/terminar con guión.'}
        </div>
      )}

      <form action={create} className="bg-white border border-border rounded-lg p-6 space-y-4 max-w-xl">
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium">Slug *</span>
            <input
              name="slug"
              required
              pattern="[a-z0-9](-?[a-z0-9])*"
              placeholder="ej: empresa-x"
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm font-mono"
            />
            <span className="text-xs text-muted-foreground">Subdominio: {'<slug>'}.cuentax.cl</span>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Nombre *</span>
            <input
              name="name"
              required
              placeholder="Nombre del despacho"
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium">RUT principal</span>
            <input
              name="primary_rut"
              placeholder="76123456-7"
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm font-mono"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Email facturación</span>
            <input
              type="email"
              name="billing_email"
              placeholder="cuentas@empresa.cl"
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium">Plan</span>
            <select
              name="plan_code"
              defaultValue=""
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
            >
              <option value="">— Sin plan —</option>
              {plansResp.data.map((p) => (
                <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Estado inicial</span>
            <select
              name="status"
              defaultValue="trialing"
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm"
            >
              <option value="trialing">Trial (14 días)</option>
              <option value="active">Activo</option>
            </select>
          </label>
        </div>

        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Crear tenant
        </button>
      </form>
    </>
  )
}
