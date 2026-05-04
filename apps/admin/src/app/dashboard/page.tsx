import { adminFetch, type MetricsOverview } from '@/lib/api'

function clpFmt(n: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

export default async function OverviewPage() {
  const m = await adminFetch<MetricsOverview>('/metrics/overview')

  const cards = [
    { label: 'Tenants total',     value: m.tenants.total },
    { label: 'Activos',           value: m.tenants.active },
    { label: 'Trialing',          value: m.tenants.trialing },
    { label: 'Suspendidos',       value: m.tenants.suspended },
    { label: 'Companies (PYMEs)', value: m.companies_total },
    { label: 'MRR',               value: clpFmt(m.mrr_clp) },
    { label: 'ARR',               value: clpFmt(m.arr_clp) },
  ]

  return (
    <>
      <header className="mb-8">
        <h2 className="text-2xl font-semibold">Overview</h2>
        <p className="text-sm text-muted-foreground">Métricas globales de Cuentax</p>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="text-2xl font-semibold mt-1">{c.value}</p>
          </div>
        ))}
      </div>
    </>
  )
}
