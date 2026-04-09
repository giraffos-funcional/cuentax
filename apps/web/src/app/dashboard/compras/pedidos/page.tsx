/**
 * CUENTAX — Pedidos de Compra (Confirmados + Recibidos)
 * Vista filtrada que muestra solo pedidos en estados avanzados.
 * Para solicitudes, usar /dashboard/compras/solicitudes.
 */

'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle2, Package, XCircle, Eye, Loader2, AlertCircle,
  ChevronUp, ChevronDown, ClipboardList, Send, Edit, LinkIcon,
} from 'lucide-react'
import { usePedidosCompra, usePedidoCompraAction } from '@/hooks'
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

const FILTER_TABS = ['todas', 'confirmada', 'recibida'] as const

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

export default function PedidosCompraPage() {
  const router = useRouter()
  const [filter, setFilter] = useState<string>('todas')
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)

  // Fetch all pedidos, then filter client-side for confirmed + received
  const { pedidos: allPedidos, total, isLoading, error, mutate } = usePedidosCompra({ page })
  const { execute } = usePedidoCompraAction()

  // Filter to only show advanced-state orders
  const pedidos = useMemo(() => {
    const advanced = allPedidos.filter((p: any) =>
      p.estado === 'confirmada' || p.estado === 'recibida'
    )
    if (filter === 'todas') return advanced
    return advanced.filter((p: any) => p.estado === filter)
  }, [allPedidos, filter])

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

  async function handleRecibir(id: number) {
    try {
      await execute(id, 'recibir')
      mutate()
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Error al marcar como recibida')
    }
  }

  const kpis = useMemo(() => {
    const confirmadas = pedidos.filter((p: any) => p.estado === 'confirmada').length
    const recibidas = pedidos.filter((p: any) => p.estado === 'recibida').length
    const montoTotal = pedidos.reduce((acc: number, p: any) => acc + (p.monto_total ?? 0), 0)
    return { total: pedidos.length, confirmadas, recibidas, montoTotal }
  }, [pedidos])

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Pedidos de Compra</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            Pedidos confirmados y recibidos
          </p>
        </div>
        <Link
          href="/dashboard/compras/solicitudes"
          className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--cx-text-secondary)] border border-[var(--cx-border-light)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors"
        >
          Ver Todas las Solicitudes
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Pedidos', value: kpis.total, color: 'text-[var(--cx-text-primary)]' },
          { label: 'Confirmadas', value: kpis.confirmadas, color: 'text-amber-500' },
          { label: 'Recibidas', value: kpis.recibidas, color: 'text-emerald-500' },
          { label: 'Monto Total', value: formatCLP(kpis.montoTotal), color: 'text-[var(--cx-text-primary)]' },
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
          <span className="text-sm text-[var(--cx-status-error-text)]">Error cargando pedidos</span>
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ClipboardList size={40} className="text-[var(--cx-text-muted)] mb-3" />
          <p className="text-sm font-medium text-[var(--cx-text-primary)]">Sin pedidos confirmados</p>
          <p className="text-xs text-[var(--cx-text-muted)] mt-1">
            Los pedidos apareceran aqui cuando sean confirmados por el proveedor.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--cx-border-light)]">
                  <th className="text-left p-3"><SortHeader label="Nro" sortKey="numero" current={sortKey} dir={sortDir} onSort={toggleSort} /></th>
                  <th className="text-left p-3"><SortHeader label="Proveedor" sortKey="razon_social_proveedor" current={sortKey} dir={sortDir} onSort={toggleSort} /></th>
                  <th className="text-left p-3"><SortHeader label="Fecha" sortKey="fecha" current={sortKey} dir={sortDir} onSort={toggleSort} /></th>
                  <th className="text-left p-3"><SortHeader label="Entrega" sortKey="fecha_entrega" current={sortKey} dir={sortDir} onSort={toggleSort} /></th>
                  <th className="text-right p-3"><SortHeader label="Total" sortKey="monto_total" current={sortKey} dir={sortDir} onSort={toggleSort} className="justify-end" /></th>
                  <th className="text-center p-3"><SortHeader label="Estado" sortKey="estado" current={sortKey} dir={sortDir} onSort={toggleSort} className="justify-center" /></th>
                  <th className="text-center p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">Factura</span>
                  </th>
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
                    <td className="p-3 text-[var(--cx-text-secondary)]">{c.fecha}</td>
                    <td className="p-3 text-[var(--cx-text-secondary)]">{c.fecha_entrega ?? '-'}</td>
                    <td className="p-3 text-right font-semibold text-[var(--cx-text-primary)]">{formatCLP(c.monto_total)}</td>
                    <td className="p-3 text-center"><StatusBadge status={c.estado} /></td>
                    <td className="p-3 text-center">
                      {c.dte_document_id ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                          <LinkIcon size={10} /> Vinculada
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--cx-text-muted)]">-</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => router.push(`/dashboard/compras/solicitudes/${c.id}`)}
                          className="p-1.5 rounded-lg text-[var(--cx-text-secondary)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)]"
                          title="Ver detalle"
                        >
                          <Eye size={14} />
                        </button>
                        {c.estado === 'confirmada' && (
                          <button
                            onClick={() => handleRecibir(c.id)}
                            className="px-2 py-1 rounded-lg text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors flex items-center gap-1"
                            title="Marcar recibida"
                          >
                            <Package size={12} /> Recibir
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
      )}
    </div>
  )
}
