/**
 * CUENTAX — Gestión de Documentos (Ciclo de Vida)
 * Real data via useDTEs hook (SWR + BFF). No mock data.
 */

'use client'

import { useState, useMemo } from 'react'
import {
  Search, Download, RefreshCw, FileText, Eye,
  ArrowUpDown, CheckCircle2, Clock, XCircle,
  AlertTriangle, Loader2, AlertCircle, ChevronLeft, ChevronRight,
  ChevronUp, ChevronDown,
} from 'lucide-react'
import { useDTEs } from '@/hooks'

// ── Types ──────────────────────────────────────────────────────

type DTEEstado = 'borrador' | 'enviado' | 'aceptado' | 'rechazado' | 'anulado'
type TipoDTE = 33 | 39 | 41 | 56 | 61

interface Documento {
  id: string
  tipo_dte: TipoDTE
  folio: number
  track_id?: string
  estado: DTEEstado
  rut_receptor: string
  razon_social_receptor: string
  monto_neto: number
  monto_iva: number
  monto_total: number
  fecha_emision: string
}

// ── Constants ──────────────────────────────────────────────────

const STATUS_CONFIG: Record<DTEEstado, { label: string; icon: typeof CheckCircle2; cls: string }> = {
  borrador:  { label: 'Borrador',  icon: Clock,          cls: 'badge-dte-draft'     },
  enviado:   { label: 'Enviado',   icon: RefreshCw,      cls: 'badge-dte-sent'      },
  aceptado:  { label: 'Aceptado',  icon: CheckCircle2,   cls: 'badge-dte-accepted'  },
  rechazado: { label: 'Rechazado', icon: XCircle,        cls: 'badge-dte-rejected'  },
  anulado:   { label: 'Anulado',   icon: AlertTriangle,  cls: 'badge-dte-cancelled' },
}

const TIPO_LABELS: Record<TipoDTE, string> = {
  33: 'Factura',
  39: 'Boleta',
  41: 'B. No Afecta',
  56: 'Nota D.',
  61: 'Nota C.',
}

const TIPOS: TipoDTE[] = [33, 39, 41, 56, 61]

const PAGE_SIZE = 20

// ── Helpers ────────────────────────────────────────────────────

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const exportCSV = (data: any[], filename: string) => {
  if (!data.length) return
  const headers = Object.keys(data[0])
  const csv = [
    headers.join(','),
    ...data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Sub-components ─────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando documentos...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error al cargar documentos'}</span>
    </div>
  )
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-[var(--cx-text-muted)]">
      <FileText size={28} />
      <p className="text-sm">
        {hasFilters ? 'No hay documentos que coincidan con los filtros' : 'No hay documentos emitidos aún'}
      </p>
    </div>
  )
}

// ── Sort header ─────────────────────────────────────────────

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

// ── Page ───────────────────────────────────────────────────────

export default function DocumentosPage() {
  // Filters (server-side via hook)
  const [estadoFilter, setEstadoFilter] = useState<DTEEstado | 'todos'>('todos')
  const [tipoFilter, setTipoFilter]     = useState<TipoDTE | 'todos'>('todos')
  const [page, setPage]                 = useState(1)

  // Client-side search (folio or receptor name)
  const [search, setSearch] = useState('')

  // Sort state
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)

  function toggleSort(key: string) {
    if (sortKey !== key) {
      setSortKey(key)
      setSortDir('asc')
    } else if (sortDir === 'asc') {
      setSortDir('desc')
    } else {
      setSortKey(null)
      setSortDir(null)
    }
  }

  // Batch selection
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Fetch from hook — server-side filters by estado + tipo_dte + page
  const { documentos, total, isLoading, error } = useDTEs({
    status:   estadoFilter !== 'todos' ? estadoFilter : undefined,
    tipo_dte: tipoFilter   !== 'todos' ? tipoFilter   : undefined,
    page,
  })

  // Client-side search filter on top of server results
  const filtered = useMemo<Documento[]>(() => {
    if (!search.trim()) return documentos
    const q = search.toLowerCase().trim()
    return documentos.filter((d: Documento) =>
      String(d.folio).includes(q) ||
      d.razon_social_receptor.toLowerCase().includes(q)
    )
  }, [documentos, search])

  const sorted = useMemo<Documento[]>(() => {
    if (!sortKey || !sortDir) return filtered
    return [...filtered].sort((a: Documento, b: Documento) => {
      const av = a[sortKey as keyof Documento] ?? ''
      const bv = b[sortKey as keyof Documento] ?? ''
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'es-CL', { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir])

  const totalAmount = filtered.reduce((s: number, d: Documento) => s + d.monto_total, 0)
  const totalPages  = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters  = estadoFilter !== 'todos' || tipoFilter !== 'todos' || search.trim() !== ''

  // Selection handlers
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((d: Documento) => d.id)))
    }
  }

  // Reset page when filters change
  const handleEstadoChange = (v: string) => {
    setEstadoFilter(v as DTEEstado | 'todos')
    setPage(1)
    setSelected(new Set())
  }

  const handleTipoChange = (v: string) => {
    setTipoFilter(v === 'todos' ? 'todos' : (Number(v) as TipoDTE))
    setPage(1)
    setSelected(new Set())
  }

  const handleSearchChange = (v: string) => {
    setSearch(v)
    setSelected(new Set())
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Documentos</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            {isLoading
              ? 'Cargando...'
              : `${total} documentos · ${formatCLP(totalAmount)} total`}
          </p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <button
              className="btn-secondary flex items-center gap-2"
              onClick={() => exportCSV(
                filtered.filter((d: Documento) => selected.has(d.id)),
                'documentos'
              )}
            >
              <Download size={13} />
              {selected.size} seleccionado{selected.size !== 1 ? 's' : ''}
            </button>
          )}
          <button
            className="btn-primary"
            onClick={() => { window.location.href = '/dashboard/emitir' }}
          >
            + Nuevo DTE
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" />
          <input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar por receptor, folio..."
            className="input-field pl-8 py-2 text-sm"
          />
        </div>

        <select
          value={estadoFilter}
          onChange={(e) => handleEstadoChange(e.target.value)}
          className="input-field w-auto py-2 text-sm pr-8"
        >
          <option value="todos">Todos los estados</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <select
          value={tipoFilter}
          onChange={(e) => handleTipoChange(e.target.value)}
          className="input-field w-auto py-2 text-sm pr-8"
        >
          <option value="todos">Todos los tipos</option>
          {TIPOS.map(t => (
            <option key={t} value={t}>{TIPO_LABELS[t]}</option>
          ))}
        </select>
      </div>

      {/* Error state */}
      {error && <ErrorState message={error?.message} />}

      {/* Table */}
      {!error && (
        <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-[var(--cx-border-light)]">
            <div className="col-span-1">
              <input
                type="checkbox"
                className="rounded"
                checked={filtered.length > 0 && selected.size === filtered.length}
                onChange={toggleSelectAll}
              />
            </div>
            <div className="col-span-1"><SortHeader label="Folio" sortKey="folio" current={sortKey} dir={sortDir} onSort={toggleSort} /></div>
            <div className="col-span-1"><SortHeader label="Tipo" sortKey="tipo_dte" current={sortKey} dir={sortDir} onSort={toggleSort} /></div>
            <div className="col-span-3"><SortHeader label="Receptor" sortKey="razon_social_receptor" current={sortKey} dir={sortDir} onSort={toggleSort} /></div>
            <div className="col-span-2"><SortHeader label="RUT" sortKey="rut_receptor" current={sortKey} dir={sortDir} onSort={toggleSort} /></div>
            <div className="col-span-1"><SortHeader label="Fecha" sortKey="fecha_emision" current={sortKey} dir={sortDir} onSort={toggleSort} /></div>
            <div className="col-span-1"><SortHeader label="Monto" sortKey="monto_total" current={sortKey} dir={sortDir} onSort={toggleSort} className="justify-end" /></div>
            <div className="col-span-1"><SortHeader label="Estado" sortKey="estado" current={sortKey} dir={sortDir} onSort={toggleSort} className="justify-center" /></div>
            <div className="col-span-1 text-center text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">Acciones</div>
          </div>

          {/* Body */}
          {isLoading ? (
            <LoadingState />
          ) : filtered.length === 0 ? (
            <EmptyState hasFilters={hasFilters} />
          ) : (
            <div className="divide-y divide-[var(--cx-border-light)]">
              {sorted.map((doc: Documento) => {
                const statusConf = STATUS_CONFIG[doc.estado] ?? STATUS_CONFIG['borrador']
                const StatusIcon = statusConf.icon
                return (
                  <div
                    key={doc.id}
                    className={`grid grid-cols-12 gap-3 px-4 py-3.5 items-center hover:bg-[var(--cx-hover-bg)] transition-colors group ${
                      selected.has(doc.id) ? 'bg-[var(--cx-active-bg)]' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <div className="col-span-1">
                      <input
                        type="checkbox"
                        checked={selected.has(doc.id)}
                        onChange={() => toggleSelect(doc.id)}
                        className="rounded border-[var(--cx-border)] accent-[var(--cx-active-icon)]"
                      />
                    </div>

                    {/* Folio */}
                    <div className="col-span-1 text-sm font-mono text-[var(--cx-text-primary)] font-semibold">
                      #{doc.folio}
                    </div>

                    {/* Tipo */}
                    <div className="col-span-1">
                      <span className="badge-dte bg-[var(--cx-bg-elevated)] text-[var(--cx-text-secondary)] border border-[var(--cx-border-light)] text-[10px]">
                        {TIPO_LABELS[doc.tipo_dte] ?? doc.tipo_dte}
                      </span>
                    </div>

                    {/* Receptor */}
                    <div className="col-span-3 min-w-0">
                      <p className="text-sm text-[var(--cx-text-primary)] truncate font-medium">
                        {doc.razon_social_receptor}
                      </p>
                    </div>

                    {/* RUT */}
                    <div className="col-span-2 text-xs font-mono text-[var(--cx-text-muted)]">
                      {doc.rut_receptor}
                    </div>

                    {/* Fecha */}
                    <div className="col-span-1 text-xs text-[var(--cx-text-secondary)]">
                      {doc.fecha_emision?.slice(0, 10) ?? '-'}
                    </div>

                    {/* Monto */}
                    <div className="col-span-1 text-right text-sm font-semibold text-[var(--cx-text-primary)]">
                      {formatCLP(doc.monto_total)}
                    </div>

                    {/* Estado */}
                    <div className="col-span-1 flex items-center justify-center">
                      <span className={statusConf.cls}>{statusConf.label}</span>
                    </div>

                    {/* Acciones */}
                    <div className="col-span-1 flex items-center justify-center gap-1">
                      {doc.track_id && (
                        <a
                          href={`/api/v1/dte/${doc.track_id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Ver PDF"
                          className="p-1 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors"
                        >
                          <FileText size={13} />
                        </a>
                      )}
                      <a
                        href={`/dashboard/documentos/${doc.id}`}
                        title="Ver estado"
                        className="p-1 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors"
                      >
                        <Eye size={13} />
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Footer — total + pagination */}
          {!isLoading && filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-[var(--cx-border-light)] flex items-center justify-between gap-4">
              <p className="text-xs text-[var(--cx-text-muted)]">
                {filtered.length} de {total} documentos
              </p>

              {/* Pagination */}
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-[var(--cx-border-light)] text-[var(--cx-text-secondary)] hover:bg-[var(--cx-hover-bg)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={13} />
                </button>
                <span className="text-xs text-[var(--cx-text-secondary)] tabular-nums">
                  {page} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-lg border border-[var(--cx-border-light)] text-[var(--cx-text-secondary)] hover:bg-[var(--cx-hover-bg)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={13} />
                </button>
              </div>

              <p className="text-sm font-semibold text-[var(--cx-text-primary)]">
                Total: {formatCLP(totalAmount)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
