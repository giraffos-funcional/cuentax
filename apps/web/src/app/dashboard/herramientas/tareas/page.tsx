/**
 * CUENTAX — Tareas Automaticas
 * ==============================
 * Dashboard for viewing automated jobs, triggering manual syncs,
 * monitoring progress, and reviewing job execution history.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw, CheckCircle2, XCircle, Clock, Loader2, AlertCircle,
  Play, Moon, FileText, TrendingUp, Shield,
} from 'lucide-react'
import { apiClient } from '@/lib/api-client'

// ── Types ───────────────────────────────────────────────────

interface QueueStatus {
  key: string
  label: string
  description: string
  schedule: string
  status: string
  counts: {
    active: number
    completed: number
    failed: number
    delayed: number
    waiting: number
  } | null
}

interface JobRecord {
  queue: string
  id: string
  name: string
  status: string
  timestamp: number
  finishedOn: number | null
  duration: number | null
  data: Record<string, unknown>
  result: unknown
  error: string | null
  attempts: number
}

interface ActiveJob {
  queue: string
  queueLabel: string
  id: string
  name: string
  progress: { step?: string; pct?: number; label?: string } | number
  data: Record<string, unknown>
  startedAt: number | null
}

// ── Helpers ─────────────────────────────────────────────────

const MESES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                     'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const QUEUE_ICONS: Record<string, typeof RefreshCw> = {
  'rcv-sync': Moon,
  'dte-status-polling': FileText,
  'previred-sync': TrendingUp,
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60000)}min`
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('es-CL', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed': return <CheckCircle2 size={14} className="text-[var(--cx-status-ok-text)]" />
    case 'failed': return <XCircle size={14} className="text-[var(--cx-status-error-text)]" />
    case 'active': return <Loader2 size={14} className="text-[var(--cx-active-icon)] animate-spin" />
    case 'waiting': case 'delayed': return <Clock size={14} className="text-[var(--cx-text-muted)]" />
    default: return <Clock size={14} className="text-[var(--cx-text-muted)]" />
  }
}

// ── Active Jobs Progress ────────────────────────────────────

function ActiveJobsBanner({ jobs }: { jobs: ActiveJob[] }) {
  if (jobs.length === 0) return null

  return (
    <div className="space-y-2">
      {jobs.map((job) => {
        const progress = typeof job.progress === 'object' ? job.progress : { pct: 0, label: 'Procesando...' }
        const pct = progress.pct ?? 0

        return (
          <div key={job.id} className="card border border-[var(--cx-active-border)] bg-[var(--cx-active-bg)] rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 size={14} className="text-[var(--cx-active-icon)] animate-spin" />
              <span className="text-sm font-semibold text-[var(--cx-active-text)]">{job.queueLabel}</span>
              <span className="text-xs text-[var(--cx-text-muted)] ml-auto">
                {job.startedAt ? `Inicio: ${formatTime(job.startedAt)}` : ''}
              </span>
            </div>
            <p className="text-xs text-[var(--cx-text-secondary)] mb-2">{progress.label ?? 'Procesando...'}</p>
            {/* Progress bar */}
            <div className="w-full h-2 rounded-full bg-[var(--cx-border-light)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--cx-active-icon)] transition-all duration-500"
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
            <p className="text-[11px] text-[var(--cx-text-muted)] mt-1 text-right">{pct}%</p>
          </div>
        )
      })}
    </div>
  )
}

// ── Queue Status Cards ──────────────────────────────────────

function QueueCards({ queues }: { queues: QueueStatus[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {queues.map((q) => {
        const Icon = QUEUE_ICONS[q.key] ?? RefreshCw
        const isActive = q.status === 'active'
        const hasErrors = (q.counts?.failed ?? 0) > 0

        return (
          <div key={q.key} className="card border border-[var(--cx-border-light)] rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                isActive ? 'bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)]' : 'bg-[var(--cx-bg-elevated)] text-[var(--cx-text-muted)]'
              }`}>
                <Icon size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--cx-text-primary)] truncate">{q.label}</p>
                <p className="text-[10px] text-[var(--cx-text-muted)]">{q.schedule}</p>
              </div>
            </div>
            <p className="text-xs text-[var(--cx-text-secondary)] mb-3">{q.description}</p>
            {q.counts && (
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-[var(--cx-status-ok-text)]">{q.counts.completed} completados</span>
                {hasErrors && <span className="text-[var(--cx-status-error-text)]">{q.counts.failed} errores</span>}
                {q.counts.active > 0 && <span className="text-[var(--cx-active-text)]">{q.counts.active} activo</span>}
              </div>
            )}
            {!isActive && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 mt-2 rounded-md text-[10px] font-semibold bg-[var(--cx-status-warn-bg)] text-[var(--cx-status-warn-text)] border border-[var(--cx-status-warn-border)]">
                Inactivo
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Manual Sync Section ─────────────────────────────────────

function ManualSyncSection() {
  const now = new Date()
  const [syncMonth, setSyncMonth] = useState(now.getMonth() + 1)
  const [syncYear, setSyncYear] = useState(now.getFullYear())
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const handleSync = async (mes: number, year: number) => {
    setSyncing(true)
    setMsg(null)
    try {
      const { data } = await apiClient.post('/api/v1/rcv/sync', { mes, year })
      setMsg({ type: 'ok', text: data.message ?? `Sincronizacion ${mes}/${year} iniciada` })
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.error ?? 'Error al iniciar sincronizacion' })
    } finally {
      setSyncing(false)
      setTimeout(() => setMsg(null), 5000)
    }
  }

  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth()
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()

  return (
    <div className="card border border-[var(--cx-border-light)] rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Shield size={16} className="text-[var(--cx-active-icon)]" />
        <h3 className="text-sm font-semibold text-[var(--cx-text-primary)]">Sincronizacion Manual RCV</h3>
      </div>
      <p className="text-xs text-[var(--cx-text-muted)]">
        Sincroniza compras y ventas desde el SII. Los documentos nuevos se crean automaticamente como DTEs en el sistema.
      </p>

      {msg && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs border ${
          msg.type === 'ok'
            ? 'bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border-[var(--cx-status-ok-border)]'
            : 'bg-[var(--cx-status-error-bg)] text-[var(--cx-status-error-text)] border-[var(--cx-status-error-border)]'
        }`}>
          {msg.type === 'ok' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
          {msg.text}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => handleSync(now.getMonth() + 1, now.getFullYear())}
          disabled={syncing}
          className="btn-primary flex items-center gap-2 text-xs py-2 px-3"
        >
          {syncing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          Sync Mes Actual ({MESES_SHORT[now.getMonth()]} {now.getFullYear()})
        </button>
        <button
          onClick={() => handleSync(prevMonth, prevYear)}
          disabled={syncing}
          className="btn-secondary flex items-center gap-2 text-xs py-2 px-3"
        >
          <Clock size={12} />
          Sync Mes Anterior ({MESES_SHORT[prevMonth - 1]} {prevYear})
        </button>

        <div className="flex items-center gap-1 ml-auto">
          <select value={syncMonth} onChange={e => setSyncMonth(Number(e.target.value))} className="input-field py-1.5 text-xs w-auto">
            {MESES_SHORT.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={syncYear} onChange={e => setSyncYear(Number(e.target.value))} className="input-field py-1.5 text-xs w-auto">
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={() => handleSync(syncMonth, syncYear)}
            disabled={syncing}
            className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3"
          >
            {syncing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            Sync
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Job History Table ───────────────────────────────────────

function JobHistory({ jobs, loading }: { jobs: JobRecord[]; loading: boolean }) {
  const [filter, setFilter] = useState<string>('all')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={18} className="animate-spin text-[var(--cx-active-icon)]" />
        <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando historial...</span>
      </div>
    )
  }

  const filtered = filter === 'all' ? jobs : jobs.filter(j => j.queue === filter)
  const queueNames = Array.from(new Set(jobs.map(j => j.queue)))

  return (
    <div className="space-y-3">
      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            filter === 'all'
              ? 'bg-[var(--cx-active-bg)] text-[var(--cx-active-text)] border border-[var(--cx-active-border)]'
              : 'text-[var(--cx-text-secondary)] hover:bg-[var(--cx-hover-bg)]'
          }`}
        >
          Todos ({jobs.length})
        </button>
        {queueNames.map(q => {
          const count = jobs.filter(j => j.queue === q).length
          return (
            <button
              key={q}
              onClick={() => setFilter(q)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === q
                  ? 'bg-[var(--cx-active-bg)] text-[var(--cx-active-text)] border border-[var(--cx-active-border)]'
                  : 'text-[var(--cx-text-secondary)] hover:bg-[var(--cx-hover-bg)]'
              }`}
            >
              {q} ({count})
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-[var(--cx-border-light)] text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest">
          <div className="col-span-1">Estado</div>
          <div className="col-span-2">Tarea</div>
          <div className="col-span-3">Detalle</div>
          <div className="col-span-2">Fecha</div>
          <div className="col-span-1">Duracion</div>
          <div className="col-span-1">Intentos</div>
          <div className="col-span-2">Resultado</div>
        </div>

        <div className="divide-y divide-[var(--cx-border-light)] max-h-[500px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Clock size={32} className="text-[var(--cx-text-muted)] mb-2" />
              <p className="text-sm text-[var(--cx-text-primary)]">Sin historial</p>
              <p className="text-xs text-[var(--cx-text-muted)]">Las tareas ejecutadas apareceran aqui</p>
            </div>
          ) : (
            filtered.map((job) => {
              const data = job.data ?? {}
              const detail = data.mes && data.year
                ? `${MESES_SHORT[(data.mes as number) - 1]} ${data.year}`
                : job.name

              return (
                <div key={`${job.queue}-${job.id}`} className="grid grid-cols-12 gap-2 px-4 py-3 text-xs hover:bg-[var(--cx-hover-bg)] transition-colors">
                  <div className="col-span-1 flex items-center">
                    <StatusIcon status={job.status} />
                  </div>
                  <div className="col-span-2">
                    <span className="text-[var(--cx-text-primary)] font-medium">{job.queue}</span>
                  </div>
                  <div className="col-span-3 text-[var(--cx-text-secondary)] truncate">{detail}</div>
                  <div className="col-span-2 text-[var(--cx-text-muted)]">
                    {job.timestamp ? formatTime(job.timestamp) : '-'}
                  </div>
                  <div className="col-span-1 text-[var(--cx-text-muted)]">
                    {job.duration ? formatDuration(job.duration) : '-'}
                  </div>
                  <div className="col-span-1 text-[var(--cx-text-muted)]">{job.attempts}</div>
                  <div className="col-span-2 truncate">
                    {job.status === 'failed' ? (
                      <span className="text-[var(--cx-status-error-text)]" title={job.error ?? ''}>{job.error ?? 'Error'}</span>
                    ) : job.status === 'completed' ? (
                      <span className="text-[var(--cx-status-ok-text)]">OK</span>
                    ) : (
                      <span className="text-[var(--cx-text-muted)]">-</span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────

export default function TareasAutomaticasPage() {
  const [queues, setQueues] = useState<QueueStatus[]>([])
  const [jobs, setJobs] = useState<JobRecord[]>([])
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    try {
      const [statusRes, historyRes, activeRes] = await Promise.all([
        apiClient.get('/api/v1/jobs/status'),
        apiClient.get('/api/v1/jobs/history?limit=50'),
        apiClient.get('/api/v1/jobs/active'),
      ])
      setQueues(statusRes.data.queues ?? [])
      setJobs(historyRes.data.jobs ?? [])
      setActiveJobs(activeRes.data.jobs ?? [])
    } catch {
      // Non-critical
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Poll active jobs every 3 seconds when there are active jobs
  useEffect(() => {
    if (activeJobs.length === 0) return
    const interval = setInterval(async () => {
      try {
        const { data } = await apiClient.get('/api/v1/jobs/active')
        setActiveJobs(data.jobs ?? [])
        // If no more active jobs, refresh everything
        if ((data.jobs ?? []).length === 0) {
          fetchAll()
        }
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(interval)
  }, [activeJobs.length, fetchAll])

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Tareas Automaticas</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            Visualiza y controla las tareas automaticas del sistema
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchAll() }}
          className="btn-secondary flex items-center gap-2 text-xs"
        >
          <RefreshCw size={12} /> Actualizar
        </button>
      </div>

      {/* Active jobs with progress */}
      <ActiveJobsBanner jobs={activeJobs} />

      {/* Queue status cards */}
      <QueueCards queues={queues} />

      {/* Manual sync */}
      <ManualSyncSection />

      {/* History */}
      <div>
        <h2 className="text-sm font-semibold text-[var(--cx-text-primary)] uppercase tracking-wider mb-3">
          Historial de Ejecuciones
        </h2>
        <JobHistory jobs={jobs} loading={loading} />
      </div>
    </div>
  )
}
