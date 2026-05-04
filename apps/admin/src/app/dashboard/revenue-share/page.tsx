import { redirect } from 'next/navigation'
import { adminFetch, type RevenueShareRun } from '@/lib/api'

const clpFmt = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

export default async function RevenueSharePage({
  searchParams,
}: {
  searchParams: { period?: string }
}) {
  const result = await adminFetch<{ data: RevenueShareRun[] }>('/revenue-share/runs', {
    query: { period: searchParams.period },
  })

  const grand = result.data.reduce(
    (acc, r) => {
      acc.contabilidad += r.share_contabilidad_clp
      acc.remuneraciones += r.share_remuneraciones_clp
      acc.total += r.total_share_clp
      return acc
    },
    { contabilidad: 0, remuneraciones: 0, total: 0 },
  )

  async function closeAll(formData: FormData) {
    'use server'
    const period = String(formData.get('period') ?? '').trim()
    if (!/^\d{4}-\d{2}$/.test(period)) redirect('/dashboard/revenue-share?err=period')
    // Trigger close per tenant from current admin (bulk endpoint not exposed yet — so we list & call individually)
    const tenants = await adminFetch<{ data: Array<{ id: number }> }>('/tenants', { query: { limit: 200 } })
    for (const t of tenants.data) {
      try {
        await adminFetch('/revenue-share/close', {
          method: 'POST',
          body: { tenant_id: t.id, period },
        })
      } catch {
        // best-effort; UI can show errors per tenant in future
      }
    }
    redirect(`/dashboard/revenue-share?period=${period}`)
  }

  return (
    <>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Revenue share</h2>
          <p className="text-sm text-muted-foreground">Cierres mensuales cross-tenant</p>
        </div>
        <form action={closeAll} className="flex gap-2 items-end">
          <label className="block">
            <span className="block text-xs text-muted-foreground">Cerrar período</span>
            <input
              name="period"
              required
              pattern="\d{4}-\d{2}"
              placeholder="2026-04"
              defaultValue={searchParams.period ?? ''}
              className="mt-1 rounded-md border border-border px-3 py-2 text-sm bg-white font-mono w-32"
            />
          </label>
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Cerrar todos
          </button>
        </form>
      </header>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card label="Total contabilidad"   value={clpFmt(grand.contabilidad)} />
        <Card label="Total remuneraciones" value={clpFmt(grand.remuneraciones)} />
        <Card label="Total revenue share"  value={clpFmt(grand.total)} primary />
      </div>

      <form className="mb-4 flex gap-2">
        <input
          name="period"
          defaultValue={searchParams.period ?? ''}
          placeholder="YYYY-MM (todos si vacío)"
          className="rounded-md border border-border px-3 py-2 text-sm bg-white w-48 font-mono"
        />
        <button className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm">Filtrar</button>
      </form>

      <div className="bg-white border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left  px-4 py-2">Período</th>
              <th className="text-left  px-4 py-2">Tenant</th>
              <th className="text-left  px-4 py-2">Estado</th>
              <th className="text-right px-4 py-2">Cont fees</th>
              <th className="text-right px-4 py-2">Rem fees</th>
              <th className="text-right px-4 py-2">Share cont</th>
              <th className="text-right px-4 py-2">Share rem</th>
              <th className="text-right px-4 py-2">Total share</th>
              <th className="text-left  px-4 py-2">Calculado</th>
            </tr>
          </thead>
          <tbody>
            {result.data.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-2 font-mono text-xs">{r.period}</td>
                <td className="px-4 py-2 text-xs">{r.tenant_id}</td>
                <td className="px-4 py-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-zinc-100">{r.status}</span>
                </td>
                <td className="px-4 py-2 text-right font-mono text-muted-foreground">{clpFmt(r.total_contabilidad_clp)}</td>
                <td className="px-4 py-2 text-right font-mono text-muted-foreground">{clpFmt(r.total_remuneraciones_clp)}</td>
                <td className="px-4 py-2 text-right font-mono">{clpFmt(r.share_contabilidad_clp)}</td>
                <td className="px-4 py-2 text-right font-mono">{clpFmt(r.share_remuneraciones_clp)}</td>
                <td className="px-4 py-2 text-right font-mono font-semibold">{clpFmt(r.total_share_clp)}</td>
                <td className="px-4 py-2 text-xs">
                  {r.calculated_at ? new Date(r.calculated_at).toLocaleString('es-CL') : '—'}
                </td>
              </tr>
            ))}
            {result.data.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Sin runs.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Card({ label, value, primary }: { label: string; value: string; primary?: boolean }) {
  return (
    <div className={`border rounded-lg p-4 ${primary ? 'bg-primary text-primary-foreground border-primary' : 'bg-white border-border'}`}>
      <p className={`text-xs ${primary ? 'opacity-80' : 'text-muted-foreground'}`}>{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
    </div>
  )
}
