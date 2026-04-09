/**
 * CUENTAX — Solicitudes de Compra
 * Lista de pedidos de compra con filtros, KPIs, y acciones.
 * Conectado a datos reales via usePedidosCompra hook.
 */

'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  FileText, Plus, Send, CheckCircle2, XCircle,
  Eye, Trash2, Edit, Loader2, AlertCircle,
  ChevronUp, ChevronDown, ShoppingCart, Package, Ban,
} from 'lucide-react'
import { usePedidosCompra, usePedidoCompraAction, useDeletePedidoCompra } from '@/hooks'
import { formatCLP } from '@/lib/formatters'

// ── Types & Config ──────────────────────────────────────────

type PedidoStatus = 'solicitud' | 'enviada' | 'confirmada' | 'recibida' | 'cancelada'

const STATUS_CONFIG: Record<PedidoStatus, { label: string; cls: string; icon: typeof Edit }> = {
  solicitud:   { label: 'Solicitud',   cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',             icon: Edit },
  enviada:     { label: 'Enviada',     cls: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',               icon: Send },
  confirmada:  { label: 'Confirmada',  cls: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',           icon: CheckCircle2 },
  recibida:    { label: 'Recibida',    cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',   icon: Package },
  cancelada:   { label: 'Cancelada',   cls: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',                   icon: XCircle },
}

const FILTER_TABS = ['todas', 'solicitud', 'enviada', 'confirmada', 'recibida', 'cancelada'] as const

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
  const config = STATUS_CONFIG[status as PedidoStatus] ?? STATUS_CONFIG.solicitud
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${config.cls}`}>
      <Icon size={10} />
      {config.label}
    </span>
  )
}

// ── Page ─────────────────────────────────────────────────────

export default function SolicitudesCompraPage() {
  const router = useRouter()
  const [filter, setFilter] = useState<string>('todas')
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)

  const { pedidos, total, isLoading, error, mutate } = usePedidosCompra({
    estado: filter !== 'todas' ? filter : undefined,
    page,
  })

  const { execute } = usePedidoCompraAction()
  const { remove } = useDeletePedidoCompra()

  // Sort client-side
  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return pedidos
    return [...pedidos].sort((a: any, b: any) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [pedidos, sortKey, sortDir])

  function toggleSort(key: string) {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc') }
    else if (sortDir === 'asc') { setSortDir('desc') }
    else { setSortKey(null); setSortDir(null) }
  }

  // KPI calculations
  const kpis = useMemo(() => {
    const totalCount = total
    const solicitudes = pedidos.filter((c: any) => c.estado === 'solicitud').length
    const enviadas = pedidos.filter((c: any) => c.estado === 'enviada').length
    const confirmadas = pedidos.filter((c: any) => c.estado === 'confirmada').length
    return { totalCount, solicitudes, enviadas, confirmadas }
  }, [pedidos, total])

  async function handleAction(id: number, action: string) {
    try {
      await execute(id, action)
      mutate()
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Error al ejecutar la accion')
    }
  }

  async function handleDelete(id: number, numero: number) {
    if (!confirm(`Eliminar solicitud #${numero}?`)) return
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
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Solicitudes de Compra</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            {total} pedidos en total
          </p>
        </div>
        <Link href="/dashboard/compras/solicitudes/nuevo" className="btn-primary flex items-center gap-2">
          <Plus size={14} /> Nueva Solicitud
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total', value: kpis.totalCount, color: 'text-[var(--cx-text-primary)]' },
          { label: 'Solicitudes', value: kpis.solicitudes, color: 'text-slate-500' },
          { label: 'Enviadas', value: kpis.enviadas, color: 'text-blue-500' },
          { label: 'Confirmadas', value: kpis.confirmadas, color: 'text-amber-500' },
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
            {f === 'todas' ? 'Todas' : STATUS_CONFIG[f as PedidoStatus]?.label ?? f}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
          <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando pedidos...</span>
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
          <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
          <span className="text-sm text-[var(--cx-status-error-text)]">Error cargando pedidos de compra</span>
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShoppingCart size={40} className="text-[var(--cx-text-muted)] mb-3" />
          <p className="text-sm font-medium text-[var(--cx-text-primary)]">Sin solicitudes de compra</p>
          <p className="text-xs text-[var(--cx-text-muted)] mt-1 mb-4">
            Crea tu primera solicitud para comenzar.
          </p>
          <Link href="/dashboard/compras/solicitudes/nuevo" className="btn-primary flex items-center gap-2 text-sm py-2 px-4">
            <Plus size={14} /> Nueva Solicitud
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
                    <th className="text-left p-3"><SortHeader label="Proveedor" sortKey="razon_social_proveedor" current={sortKey} dir={sortDir} onSort={toggleSort} /></th>
                    <th className="text-left p-3"><SortHeader label="RUT" sortKey="rut_proveedor" current={sortKey} dir={sortDir} onSort={toggleSort} /></th>
                    <th className="text-left p-3"><SortHeader label="Fecha" sortKey="fecha" current={sortKey} dir={sortDir} onSort={toggleSort} /></th>
                    <th className="text-left p-3"><SortHeader label="Entrega" sortKey="fecha_entrega" current={sortKey} dir={sortDir} onSort={toggleSort} /></th>
                    <th className="text-right p-3"><SortHeader label="Total" sortKey="monto_total" current={sortKey} dir={sortDir} onSort={toggleSort} className="justify-end" /></th>
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
                      <td className="p-3 text-[var(--cx-text-primary)] max-w-[200px] truncate">{c.razon_social_proveedor}</td>
                      <td className="p-3 text-[var(--cx-text-secondary)] font-mono text-xs">{c.rut_proveedor}</td>
                      <td className="p-3 text-[var(--cx-text-secondary)]">{c.fecha}</td>
                      <td className="p-3 text-[var(--cx-text-secondary)]">{c.fecha_entrega ?? '-'}</td>
                      <td className="p-3 text-right font-semibold text-[var(--cx-text-primary)]">{formatCLP(c.monto_total)}</td>
                      <td className="p-3 text-center"><StatusBadge status={c.estado} /></td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => router.push(`/dashboard/compras/solicitudes/${c.id}`)}
                            className="p-1.5 rounded-lg text-[var(--cx-text-secondary)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)]"
                            title="Ver detalle"
                          >
                            <Eye size={14} />
                          </button>
                          {c.estado === 'solicitud' && (
                            <button
                              onClick={() => handleAction(c.id, 'enviar')}
                              className="p-1.5 rounded-lg text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                              title="Enviar al proveedor"
                            >
                              <Send size={14} />
                            </button>
                          )}
                          {c.estado === 'enviada' && (
                            <button
                              onClick={() => handleAction(c.id, 'confirmar')}
                              className="px-2 py-1 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors flex items-center gap-1"
                              title="Confirmar"
                            >
                              <CheckCircle2 size={12} /> Confirmar
                            </button>
                          )}
                          {(c.estado === 'solicitud' || c.estado === 'enviada') && (
                            <button
                              onClick={() => handleAction(c.id, 'cancelar')}
                              className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                              title="Cancelar"
                            >
                              <Ban size={14} />
                            </button>
                          )}
                          {c.estado === 'solicitud' && (
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
