import Link from 'next/link'
import { adminFetch, type Tenant } from '@/lib/api'

const statusBadge: Record<string, string> = {
  active:    'bg-green-100 text-green-700',
  trialing:  'bg-blue-100 text-blue-700',
  past_due:  'bg-yellow-100 text-yellow-800',
  suspended: 'bg-red-100 text-red-700',
  cancelled: 'bg-zinc-200 text-zinc-700',
}

export default async function TenantsListPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string }
}) {
  const result = await adminFetch<{ data: Tenant[]; total: number }>('/tenants', {
    query: { q: searchParams.q, status: searchParams.status, limit: 100 },
  })

  return (
    <>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold">Tenants</h2>
          <p className="text-sm text-muted-foreground">{result.total} en total</p>
        </div>
        <Link
          href="/dashboard/tenants/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          + Nuevo tenant
        </Link>
      </header>

      <form className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={searchParams.q ?? ''}
          placeholder="Buscar por slug o nombre..."
          className="flex-1 rounded-md border border-border px-3 py-2 text-sm bg-white"
        />
        <select
          name="status"
          defaultValue={searchParams.status ?? ''}
          className="rounded-md border border-border px-3 py-2 text-sm bg-white"
        >
          <option value="">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="trialing">Trial</option>
          <option value="past_due">Mora</option>
          <option value="suspended">Suspendidos</option>
          <option value="cancelled">Cancelados</option>
        </select>
        <button className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm">Filtrar</button>
      </form>

      <div className="bg-white border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2">Slug</th>
              <th className="text-left px-4 py-2">Nombre</th>
              <th className="text-left px-4 py-2">Estado</th>
              <th className="text-left px-4 py-2">RUT</th>
              <th className="text-left px-4 py-2">Plan</th>
              <th className="text-right px-4 py-2">Rev-share</th>
            </tr>
          </thead>
          <tbody>
            {result.data.map((t) => (
              <tr key={t.id} className="border-t border-border hover:bg-muted/50">
                <td className="px-4 py-2 font-mono text-xs">
                  <Link href={`/dashboard/tenants/${t.slug}`} className="text-primary hover:underline">
                    {t.slug}
                  </Link>
                </td>
                <td className="px-4 py-2">{t.name}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${statusBadge[t.status] ?? 'bg-zinc-100'}`}>
                    {t.status}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-xs">{t.primary_rut ?? '—'}</td>
                <td className="px-4 py-2">{t.plan_id ?? '—'}</td>
                <td className="px-4 py-2 text-right font-mono text-xs">
                  {(Number(t.revenue_share_rate_contabilidad) * 100).toFixed(1)}% / {(Number(t.revenue_share_rate_remuneraciones) * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
            {result.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Sin resultados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
