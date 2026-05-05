import { adminFetch, type CronHealth } from '@/lib/api'

const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago' }) : '—'

export const dynamic = 'force-dynamic'  // re-fetch every request

export default async function CronsPage() {
  const result = await adminFetch<{ data: CronHealth[] }>('/crons/health')

  return (
    <>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Crons / background jobs</h2>
          <p className="text-sm text-muted-foreground">Estado en tiempo real (BullMQ + Redis)</p>
        </div>
        <form action="/dashboard/crons">
          <button className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm">Refrescar</button>
        </form>
      </header>

      <div className="space-y-3">
        {result.data.map((c) => {
          const stale = c.last_completed_at
            ? (Date.now() - new Date(c.last_completed_at).getTime()) > 7 * 24 * 60 * 60 * 1000
            : true
          const hasFailure = c.counts.failed > 0
          const status = hasFailure ? 'failed' : c.counts.active > 0 ? 'running' : stale ? 'stale' : 'ok'
          const statusColor: Record<string, string> = {
            ok:      'bg-green-100 text-green-700',
            running: 'bg-blue-100 text-blue-700',
            stale:   'bg-zinc-100 text-zinc-600',
            failed:  'bg-red-100 text-red-700',
          }

          return (
            <div key={c.name} className="bg-white border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <code className="text-sm font-mono">{c.name}</code>
                  <span className={`text-xs px-2 py-0.5 rounded ${statusColor[status]}`}>{status}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  next: <span className="font-mono">{fmtDate(c.next_run_at)}</span>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-2 text-xs mb-3">
                <Stat label="waiting"   value={c.counts.waiting}   />
                <Stat label="active"    value={c.counts.active}    color={c.counts.active > 0 ? 'text-blue-600' : ''} />
                <Stat label="completed" value={c.counts.completed} color="text-green-600" />
                <Stat label="failed"    value={c.counts.failed}    color={c.counts.failed > 0 ? 'text-red-600' : 'text-muted-foreground'} />
                <Stat label="delayed"   value={c.counts.delayed}   />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Último OK</p>
                  <p className="font-mono">{fmtDate(c.last_completed_at)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Último fallo</p>
                  <p className="font-mono">{fmtDate(c.last_failed_at)}</p>
                </div>
              </div>

              {c.last_failure && (
                <div className="mt-3 p-2 rounded bg-red-50 border border-red-200">
                  <p className="text-xs text-red-700 font-mono break-words">
                    {c.last_failure.reason}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-zinc-50 rounded p-2">
      <p className="text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${color ?? ''}`}>{value}</p>
    </div>
  )
}
