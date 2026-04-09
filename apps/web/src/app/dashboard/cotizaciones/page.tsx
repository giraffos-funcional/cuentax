/**
 * CUENTAX — Cotizaciones (Presupuestos)
 * Lista de cotizaciones con filtros, KPIs, y acciones.
 * Conectado a datos reales via useCotizaciones hook.
 */

'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  FileText, Plus, Send, CheckCircle2, Clock, XCircle,
  ArrowRight, Eye, Trash2, Edit, Loader2, AlertCircle,
  ChevronUp, ChevronDown, Receipt,
} from 'lucide-react'
import { useCotizaciones, useCotizacionAction, useDeleteCotizacion } from '@/hooks'
import { formatCLP } from '@/lib/formatters'

// ── Types & Config ──────────────────────────────────────────

type CotizacionStatus = 'borrador' | 'enviada' | 'aceptada' | 'rechazada' | 'expirada' | 'convertida'

const STATUS_CONFIG: Record<CotizacionStatus, { label: string; cls: string; icon: typeof Edit }> = {
  borrador:   { label: 'Borrador',    cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',       icon: Edit },
  enviada:    { label: 'Enviada',     cls: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',         icon: Send },
  aceptada:   { label: 'Aceptada',    cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400', icon: CheckCircle2 },
  rechazada:  { label: 'Rechazada',   cls: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',             icon: XCircle },
  expirada:   { label: 'Expirada',    cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',           icon: Clock },
  convertida: { label: 'Convertida',  cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400', icon: ArrowRight },
}

const FILTER_TABS = ['todas', 'borrador', 'enviada', 'aceptada', 'rechazada', 'expirada', 'convertida'] as const

// ── Sort Header ─────────────────────────────────────────────

type SortDir = 'asc' | 'desc' | null

function SortHeader({ label, sortKey: key, current, dir, onSort, className }: {
  label: string; sortKey: string; current: string | null; dir: SortDir; onSort: (key: string) => void; className?: string
}) {
  const active = current === key
  return (
    <button
      onClick={() => onSort(key)}
      className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] transition-colors cursor-pointer select-none ${className ?? ''}`}
    >
      {label}
      {active && dir === 'asc' && <ChevronUp size={12} />}
      {active && dir === 'desc' && <ChevronDown size={12} />}
    </button>
  )
}

// ── Status Badge ────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status as CotizacionStatus] ?? STATUS_CONFIG.borrador
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${config.cls}`}>
      <Icon size={10} />
      {config.label}
    </span>
  )
}

// ── Page ─────────────────────────────────────────────────────

export default function CotizacionesPage() {
  const router = useRouter()
  const [filter, setFilter] = useState<string>('todas')
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)

  const { cotizaciones, total, isLoading, error, mutate } = useCotizaciones({
    estado: filter !== 'todas' ? filter : undefined,
    page,
  })

  const { ejecutar } = useCotizacionAction()
  const { remove } = useDeleteCotizacion()

  // Sort client-side
  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return cotizaciones
    return [...cotizaciones].sort((a: any, b: any) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [cotizaciones, sortKey, sortDir])

  function toggleSort(key: string) {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc') }
    else if (sortDir === 'asc') { setSortDir('desc') }
    else { setSortKey(null); setSortDir(null) }
  }

  // KPI calculations
  const allCotizaciones = cotizaciones
  const kpis = useMemo(() => {
    const totalCount = total
    const borradores = allCotizaciones.filter((c: any) => c.estado === 'borrador').length
    const enviadas = allCotizaciones.filter((c: any) => c.estado === 'enviada').length
    const aceptadas = allCotizaciones.filter((c: any) => c.estado === 'aceptada').length
    return { totalCount, borradores, enviadas, aceptadas }
  }, [allCotizaciones, total])

  async function handleAction(id: number, action: 'enviar' | 'aceptar' | 'rechazar' | 'facturar') {
    try {
      await ejecutar(id, action)
      mutate()
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Error al ejecutar la accion')
    }
  }

  async function handleDelete(id: number, numero: number) {
    if (!confirm(`Eliminar presupuesto #${numero}?`)) return
    try {
      await remove(id)
      mutate()
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Error al eliminar')
    }
  }

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Presupuestos</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            {total} cotizaciones en total
          </p>
        </div>
        <Link href="/dashboard/cotizaciones/nuevo" className="btn-primary flex items-center gap-2">
          <Plus size={14} /> Nuevo Presupuesto
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total', value: kpis.totalCount, color: 'text-[var(--cx-text-primary)]' },
          { label: 'Borradores', value: kpis.borradores, color: 'text-slate-500' },
          { label: 'Enviadas', value: kpis.enviadas, color: 'text-blue-500' },
          { label: 'Pendientes Facturar', value: kpis.aceptadas, color: 'text-emerald-500' },
        ].map(k => (
          <div key={k.label} className="card p-4">
            <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-wide mb-1">{k.label}</p>
            <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {FILTER_TABS.map(f => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1) }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
              filter === f
                ? 'bg-[var(--cx-active-bg)] text-[var(--cx-active-icon)] border border-[var(--cx-active-border)]'
                : 'bg-[var(--cx-bg-elevated)] text-[var(--cx-text-secondary)] border border-[var(--cx-border-light)] hover:text-[var(--cx-text-primary)]'
            }`}
          >
            {f === 'todas' ? 'Todas' : STATUS_CONFIG[f as CotizacionStatus]?.label ?? f}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
          <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando cotizaciones...</span>
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
          <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
          <span className="text-sm text-[var(--cx-status-error-text)]">Error cargando cotizaciones</span>
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText size={40} className="text-[var(--cx-text-muted)] mb-3" />
          <p className="text-sm font-medium text-[var(--cx-text-primary)]">Sin presupuestos</p>
          <p className="text-xs text-[var(--cx-text-muted)] mt-1 mb-4">
            Crea tu primer presupuesto para comenzar.
          </p>
          <Link href="/dashboard/cotizaciones/nuevo" className="btn-primary flex items-center gap-2 text-sm py-2 px-4">
            <Plus size={14} /> Nuevo Presupuesto
          </Link>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--cx-border-light)]">
                    <th className="text-left p-3"><SortHeader label="Nro" sortKey="numero" current={sortKey} dir={sortDir} onSort={toggleSort} /></th>
                    <th className="text-left p-3"><SortHeader label="Cliente" sortKey="razon_social_receptor" current={sortKey} dir={sortDir} onSort={toggleSort} /></th>
                    <th className="text-left p-3"><SortHeader label="RUT" sortKey="rut_receptor" current={sortKey} dir={sortDir} onSort={toggleSort} /></th>
                    <th className="text-left p-3"><SortHeader label="Fecha" sortKey="fecha" current={sortKey} dir={sortDir} onSort={toggleSort} /></th>
                    <th className="text-left p-3"><SortHeader label="Valida hasta" sortKey="valida_hasta" current={sortKey} dir={sortDir} onSort={toggleSort} /></th>
                    <th className="text-right p-3"><SortHeader label="Monto" sortKey="monto_total" current={sortKey} dir={sortDir} onSort={toggleSort} className="justify-end" /></th>
                    <th className="text-center p-3"><SortHeader label="Estado" sortKey="estado" current={sortKey} dir={sortDir} onSort={toggleSort} className="justify-center" /></th>
                    <th className="text-right p-3">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c: any) => (
                    <tr
                      key={c.id}
                      className="border-b border-[var(--cx-border-light)] last:border-0 hover:bg-[var(--cx-hover-bg)] transition-colors"
                    >
                      <td className="p-3 font-semibold text-[var(--cx-text-primary)]">#{c.numero}</td>
                      <td className="p-3 text-[var(--cx-text-primary)] max-w-[200px] truncate">{c.razon_social_receptor}</td>
                      <td className="p-3 text-[var(--cx-text-secondary)] font-mono text-xs">{c.rut_receptor}</td>
                      <td className="p-3 text-[var(--cx-text-secondary)]">{c.fecha}</td>
                      <td className="p-3 text-[var(--cx-text-secondary)]">{c.valida_hasta}</td>
                      <td className="p-3 text-right font-semibold text-[var(--cx-text-primary)]">{formatCLP(c.monto_total)}</td>
                      <td className="p-3 text-center"><StatusBadge status={c.estado} /></td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => router.push(`/dashboard/cotizaciones/${c.id}`)}
                            className="p-1.5 rounded-lg text-[var(--cx-text-secondary)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)]"
                            title="Ver detalle"
                          >
                            <Eye size={14} />
                          </button>
                          {c.estado === 'borrador' && (
                            <button
                              onClick={() => handleAction(c.id, 'enviar')}
                              className="p-1.5 rounded-lg text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                              title="Enviar"
                            >
                              <Send size={14} />
                            </button>
                          )}
                          {c.estado === 'aceptada' && (
                            <button
                              onClick={() => handleAction(c.id, 'facturar')}
                              className="px-2 py-1 rounded-lg text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors flex items-center gap-1"
                              title="Facturar"
                            >
                              <Receipt size={12} /> Facturar
                            </button>
                          )}
                          {c.estado === 'borrador' && (
                            <button
                              onClick={() => handleDelete(c.id, c.numero)}
                              className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                              title="Eliminar"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-[var(--cx-text-muted)]">
                Pagina {page} de {totalPages} ({total} resultados)
              </p>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--cx-bg-elevated)] text-[var(--cx-text-secondary)] border border-[var(--cx-border-light)] hover:text-[var(--cx-text-primary)] disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--cx-bg-elevated)] text-[var(--cx-text-secondary)] border border-[var(--cx-border-light)] hover:text-[var(--cx-text-primary)] disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
