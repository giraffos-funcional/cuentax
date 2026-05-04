import { adminFetch } from '@/lib/api'

interface AuditEntry {
  id: number
  tenant_id: number | null
  company_id: number | null
  user_id: number | null
  action: string
  resource: string | null
  resource_id: number | null
  ip: string | null
  created_at: string
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: { tenant_id?: string; action?: string }
}) {
  const result = await adminFetch<{ data: AuditEntry[] }>('/audit', {
    query: { tenant_id: searchParams.tenant_id, action: searchParams.action, limit: 100 },
  })

  return (
    <>
      <header className="mb-6">
        <h2 className="text-2xl font-semibold">Audit log</h2>
        <p className="text-sm text-muted-foreground">Eventos cross-tenant</p>
      </header>

      <form className="mb-4 flex gap-2">
        <input
          name="tenant_id"
          defaultValue={searchParams.tenant_id ?? ''}
          placeholder="tenant_id"
          className="rounded-md border border-border px-3 py-2 text-sm bg-white w-32"
        />
        <input
          name="action"
          defaultValue={searchParams.action ?? ''}
          placeholder="action contains..."
          className="rounded-md border border-border px-3 py-2 text-sm bg-white flex-1"
        />
        <button className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm">Filtrar</button>
      </form>

      <div className="bg-white border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2">Fecha</th>
              <th className="text-left px-4 py-2">Tenant</th>
              <th className="text-left px-4 py-2">Action</th>
              <th className="text-left px-4 py-2">Resource</th>
              <th className="text-left px-4 py-2">IP</th>
            </tr>
          </thead>
          <tbody>
            {result.data.map((e) => (
              <tr key={e.id} className="border-t border-border">
                <td className="px-4 py-2 text-xs whitespace-nowrap">
                  {new Date(e.created_at).toLocaleString('es-CL')}
                </td>
                <td className="px-4 py-2 text-xs">{e.tenant_id ?? '—'}</td>
                <td className="px-4 py-2 font-mono text-xs">{e.action}</td>
                <td className="px-4 py-2 text-xs">
                  {e.resource ? `${e.resource}#${e.resource_id ?? '—'}` : '—'}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{e.ip ?? '—'}</td>
              </tr>
            ))}
            {result.data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Sin eventos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
