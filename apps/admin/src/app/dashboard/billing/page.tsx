import { adminFetch, type Invoice } from '@/lib/api'

const clpFmt = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const statusBadge: Record<string, string> = {
  draft:    'bg-zinc-100 text-zinc-700',
  issued:   'bg-blue-100 text-blue-700',
  paid:     'bg-green-100 text-green-700',
  past_due: 'bg-yellow-100 text-yellow-800',
  void:     'bg-red-100 text-red-700',
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { status?: string; period?: string }
}) {
  const result = await adminFetch<{ data: Invoice[] }>('/invoices', {
    query: { status: searchParams.status, period: searchParams.period, limit: 200 },
  })

  const totals = result.data.reduce(
    (acc, i) => {
      acc.count += 1
      acc.total += i.total_clp
      if (i.status === 'paid') acc.paid += i.total_clp
      if (i.status === 'issued' || i.status === 'past_due') acc.outstanding += i.total_clp
      return acc
    },
    { count: 0, total: 0, paid: 0, outstanding: 0 },
  )

  return (
    <>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Billing</h2>
          <p className="text-sm text-muted-foreground">Invoices cross-tenant</p>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card label="Invoices"        value={String(totals.count)} />
        <Card label="Total emitido"   value={clpFmt(totals.total)} />
        <Card label="Pagado"          value={clpFmt(totals.paid)} />
        <Card label="Por cobrar"      value={clpFmt(totals.outstanding)} />
      </div>

      <form className="mb-4 flex gap-2">
        <input
          name="period"
          defaultValue={searchParams.period ?? ''}
          placeholder="YYYY-MM"
          className="rounded-md border border-border px-3 py-2 text-sm bg-white w-32 font-mono"
        />
        <select
          name="status"
          defaultValue={searchParams.status ?? ''}
          className="rounded-md border border-border px-3 py-2 text-sm bg-white"
        >
          <option value="">Todos los estados</option>
          <option value="draft">Draft</option>
          <option value="issued">Issued</option>
          <option value="paid">Paid</option>
          <option value="past_due">Past due</option>
          <option value="void">Void</option>
        </select>
        <button className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm">Filtrar</button>
      </form>

      <div className="bg-white border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left  px-4 py-2">Período</th>
              <th className="text-left  px-4 py-2">Tenant</th>
              <th className="text-left  px-4 py-2">Estado</th>
              <th className="text-right px-4 py-2">Subtotal</th>
              <th className="text-right px-4 py-2">IVA</th>
              <th className="text-right px-4 py-2">Total</th>
              <th className="text-left  px-4 py-2">Vence</th>
            </tr>
          </thead>
          <tbody>
            {result.data.map((i) => (
              <tr key={i.id} className="border-t border-border">
                <td className="px-4 py-2 font-mono text-xs">{i.period}</td>
                <td className="px-4 py-2 text-xs">{i.tenant_id}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${statusBadge[i.status] ?? ''}`}>
                    {i.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-mono">{clpFmt(i.subtotal_clp)}</td>
                <td className="px-4 py-2 text-right font-mono text-muted-foreground">{clpFmt(i.iva_clp)}</td>
                <td className="px-4 py-2 text-right font-mono font-semibold">{clpFmt(i.total_clp)}</td>
                <td className="px-4 py-2 text-xs">
                  {i.due_at ? new Date(i.due_at).toLocaleDateString('es-CL') : '—'}
                </td>
              </tr>
            ))}
            {result.data.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Sin invoices.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-border rounded-lg p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
    </div>
  )
}
