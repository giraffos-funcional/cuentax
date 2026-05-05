import { adminFetch, type MetricsOverview, type TrendPoint } from '@/lib/api'
import { Sparkline } from '@/components/sparkline'

function clpFmt(n: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

export default async function OverviewPage() {
  const [m, trends] = await Promise.all([
    adminFetch<MetricsOverview>('/metrics/overview'),
    adminFetch<{ data: TrendPoint[] }>('/metrics/trends').catch(() => ({ data: [] as TrendPoint[] })),
  ])

  const cards = [
    { label: 'Tenants total',     value: m.tenants.total },
    { label: 'Activos',           value: m.tenants.active },
    { label: 'Trialing',          value: m.tenants.trialing },
    { label: 'Suspendidos',       value: m.tenants.suspended },
    { label: 'Companies (PYMEs)', value: m.companies_total },
    { label: 'MRR',               value: clpFmt(m.mrr_clp) },
    { label: 'ARR',               value: clpFmt(m.arr_clp) },
  ]

  const tenantsCreatedSeries  = trends.data.map((t) => t.tenants_created)
  const invoicesPaidSeries    = trends.data.map((t) => t.invoices_paid_clp)
  const invoicesTotalSeries   = trends.data.map((t) => t.invoices_total_clp)
  const dtesSeries            = trends.data.map((t) => t.dtes_emitted)

  const sumLast12 = (arr: number[]) => arr.reduce((a, b) => a + b, 0)

  return (
    <>
      <header className="mb-8">
        <h2 className="text-2xl font-semibold">Overview</h2>
        <p className="text-sm text-muted-foreground">Métricas globales de Cuentax</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="text-2xl font-semibold mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      {trends.data.length > 0 && (
        <>
          <h3 className="font-semibold text-zinc-700 mb-3">Últimos 12 meses</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <TrendCard
              label="Tenants creados"
              total={String(sumLast12(tenantsCreatedSeries))}
              series={tenantsCreatedSeries}
              color="#2563eb"
            />
            <TrendCard
              label="Invoices emitidos"
              total={clpFmt(sumLast12(invoicesTotalSeries))}
              series={invoicesTotalSeries}
              color="#9333ea"
            />
            <TrendCard
              label="Invoices pagados"
              total={clpFmt(sumLast12(invoicesPaidSeries))}
              series={invoicesPaidSeries}
              color="#16a34a"
            />
            <TrendCard
              label="DTEs emitidos"
              total={String(sumLast12(dtesSeries))}
              series={dtesSeries}
              color="#ea580c"
            />
          </div>

          <p className="text-xs text-muted-foreground mt-3 font-mono">
            {trends.data[0]?.period} … {trends.data[trends.data.length - 1]?.period}
          </p>
        </>
      )}
    </>
  )
}

function TrendCard({
  label, total, series, color,
}: {
  label: string
  total: string
  series: number[]
  color: string
}) {
  return (
    <div className="bg-white border border-border rounded-lg p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold mt-1">{total}</p>
      <div className="mt-2" style={{ color }}>
        <Sparkline values={series} stroke={color} fill={color} className="w-full h-8" />
      </div>
    </div>
  )
}
