import { adminFetch, type Plan } from '@/lib/api'

function clpFmt(n: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

export default async function PlansPage() {
  const result = await adminFetch<{ data: Plan[] }>('/plans')

  return (
    <>
      <header className="mb-6">
        <h2 className="text-2xl font-semibold">Planes</h2>
        <p className="text-sm text-muted-foreground">Catálogo de suscripciones</p>
      </header>

      <div className="bg-white border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2">Code</th>
              <th className="text-left px-4 py-2">Nombre</th>
              <th className="text-right px-4 py-2">Base / mes</th>
              <th className="text-right px-4 py-2">DTEs incluidos</th>
              <th className="text-right px-4 py-2">Companies incluidas</th>
              <th className="text-right px-4 py-2">Overage / DTE</th>
            </tr>
          </thead>
          <tbody>
            {result.data.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-4 py-2 font-mono text-xs">{p.code}</td>
                <td className="px-4 py-2 font-medium">{p.name}</td>
                <td className="px-4 py-2 text-right font-mono">{clpFmt(p.base_price_clp)}</td>
                <td className="px-4 py-2 text-right">{p.included_dtes}</td>
                <td className="px-4 py-2 text-right">{p.included_companies}</td>
                <td className="px-4 py-2 text-right font-mono">{clpFmt(p.overage_price_per_dte_clp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
