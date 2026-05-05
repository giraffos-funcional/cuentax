/**
 * CUENTAX — Actividad reciente del tenant.
 * Feed combinado de notificaciones + audit_log.
 */
'use client'

import { useEffect, useState } from 'react'
import { Loader2, Activity, AlertCircle, Info, AlertTriangle, CheckCircle2, FileText } from 'lucide-react'
import { apiClient } from '@/lib/api-client'

interface Row {
  source: 'audit' | 'notification'
  id: number
  level: 'info' | 'warning' | 'error' | 'success'
  title: string
  body: string | null
  href: string | null
  created_at: string
  metadata: Record<string, unknown> | null
}

const sourceIcon: Record<string, React.ReactNode> = {
  audit:        <FileText      className="w-4 h-4 text-zinc-500" />,
  notification: <Info          className="w-4 h-4 text-blue-500" />,
}

const levelIcon: Record<string, React.ReactNode> = {
  info:    <Info          className="w-4 h-4 text-blue-600" />,
  success: <CheckCircle2  className="w-4 h-4 text-green-600" />,
  warning: <AlertTriangle className="w-4 h-4 text-yellow-600" />,
  error:   <AlertCircle   className="w-4 h-4 text-red-600" />,
}

export default function ActivityPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiClient.get<{ data: Row[] }>('/api/v1/activity?limit=200')
      .then((r) => setRows(r.data.data))
      .catch((err) => setError(err?.response?.data?.error ?? 'Error al cargar'))
  }, [])

  if (error) return <div className="max-w-3xl mx-auto p-6 text-red-700">{error}</div>
  if (!rows) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-zinc-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…
      </div>
    )
  }

  // Group by date (preserves insertion order without iterator spreads)
  const grouped: Array<[string, Row[]]> = []
  const seen: Record<string, Row[]> = {}
  for (const r of rows) {
    const key = new Date(r.created_at).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    let arr = seen[key]
    if (!arr) {
      arr = []
      seen[key] = arr
      grouped.push([key, arr])
    }
    arr.push(r)
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Activity className="w-6 h-6 text-blue-600" /> Actividad reciente
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Notificaciones y eventos auditados de tu cuenta. {rows.length} entradas.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="bg-white rounded-lg border border-zinc-200 p-8 text-center text-sm text-zinc-500">
          Sin actividad todavía.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([date, items]) => (
            <section key={date}>
              <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">{date}</h2>
              <ul className="bg-white rounded-lg border border-zinc-200 divide-y divide-zinc-100 overflow-hidden">
                {items.map((r) => (
                  <li key={`${r.source}-${r.id}`} className="px-4 py-3 hover:bg-zinc-50/50">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5">
                        {r.source === 'notification' ? levelIcon[r.level] : sourceIcon.audit}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-medium font-mono">{r.title}</p>
                          <span className="text-[11px] text-zinc-400 whitespace-nowrap">
                            {new Date(r.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {r.body && <p className="text-xs text-zinc-600 mt-0.5">{r.body}</p>}
                        {r.metadata && Object.keys(r.metadata).length > 0 && (
                          <details className="mt-1">
                            <summary className="text-[11px] text-zinc-400 cursor-pointer hover:text-zinc-600">
                              ver detalle
                            </summary>
                            <pre className="text-[11px] bg-zinc-50 p-2 rounded mt-1 overflow-x-auto">
                              {JSON.stringify(r.metadata, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
