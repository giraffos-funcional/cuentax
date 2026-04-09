/**
 * CUENTAX — Ventas (Sales Documents)
 * Shows emitted sales documents (DTEs) with status tracking.
 * Connected to real data via useDTEs hook.
 */

'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Download, Loader2, AlertCircle, TrendingUp,
  Search, Send, Clock, RefreshCw, CheckCircle2,
  XCircle, AlertTriangle, ChevronUp, ChevronDown,
} from 'lucide-react'
import { useDTEs } from '@/hooks'
import { formatCLP, MONTHS } from '@/lib/formatters'

// ── Helpers ──────────────────────────────────────────────────

const MESES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                     'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const TIPO_DTE_NAMES: Record<number, string> = {
  33: 'Factura', 34: 'Factura Exenta', 39: 'Boleta',
  41: 'Boleta Exenta', 56: 'Nota Debito', 61: 'Nota Credito',
}

const SALES_TYPES = new Set([33, 39, 41, 56, 61])

function tipeName(tipo: number | string) {
  const n = typeof tipo === 'string' ? parseInt(tipo, 10) : tipo
  return TIPO_DTE_NAMES[n] ?? `Tipo ${tipo}`
}

interface StatusConfig {
  label: string
  icon: typeof Clock
  cls: string
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  borrador:  { label: 'Borrador',  icon: Clock,          cls: 'bg-slate-100 text-slate-600' },
  enviado:   { label: 'Enviado',   icon: RefreshCw,      cls: 'bg-blue-50 text-blue-600' },
  aceptado:  { label: 'Aceptado',  icon: CheckCircle2,   cls: 'bg-emerald-50 text-emerald-600' },
  rechazado: { label: 'Rechazado', icon: XCircle,        cls: 'bg-red-50 text-red-600' },
  anulado:   { label: 'Anulado',   icon: AlertTriangle,  cls: 'bg-gray-100 text-gray-500' },
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.borrador
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${config.cls}`}>
      <Icon size={10} />
      {config.label}
    </span>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando datos...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando datos'}</span>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <TrendingUp size={40} className="text-[var(--cx-text-muted)] mb-3" />
      <p className="text-sm font-medium text-[var(--cx-text-primary)]">Sin documentos de venta</p>
      <p className="text-xs text-[var(--cx-text-muted)] mt-1 mb-4">
        No hay documentos emitidos para este periodo.
      </p>
      <Link
        href="/dashboard/emitir"
        className="btn-primary flex items-center gap-2 text-sm py-2 px-4"
      >
        <Send size={14} /> Emitir DTE
      </Link>
    </div>
  )
}

// ── CSV export ───────────────────────────────────────────────

function exportCSV(docs: any[], mes: number, year: number) {
  if (!docs.length) return

  const headers = ['Estado', 'Tipo Doc', 'Folio', 'Fecha', 'RUT Receptor', 'Razon Social', 'Neto', 'IVA', 'Total']
  const rows = docs.map((d: any) => [
    d.status ?? '',
    d.tipo_dte ?? '',
    d.folio ?? '',
    d.fecha_emision ?? '',
    d.rut_receptor ?? '',
    `"${(d.razon_social_receptor ?? '').replace(/"/g, '""')}"`,
    d.monto_neto ?? 0,
    d.monto_iva ?? 0,
    d.monto_total ?? 0,
  ])

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Ventas_${year}_${String(mes).padStart(2, '0')}.csv`
  a.click()
  URL.revokeObjectURL(url)
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

// ── Page ─────────────────────────────────────────────────────

export default function VentasPage() {
  const now = new Date()
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [search, setSearch] = useState('')
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

  const { documentos, isLoading, error } = useDTEs()

  // Filter to sales types and by selected period
  const salesDocs = useMemo(() => {
    return documentos.filter((d: any) => {
      const tipo = typeof d.tipo_dte === 'string' ? parseInt(d.tipo_dte, 10) : d.tipo_dte
      if (!SALES_TYPES.has(tipo)) return false

      // Filter by period using fecha_emision
      const fecha = d.fecha_emision ?? d.fecha ?? ''
      if (!fecha) return true // Include docs without date
      const docDate = new Date(fecha)
      return docDate.getMonth() + 1 === mes && docDate.getFullYear() === year
    })
  }, [documentos, mes, year])

  // Client-side search
  const filtered = useMemo(() => {
    if (!search.trim()) return salesDocs
    const q = search.toLowerCase()
    return salesDocs.filter((d: any) => {
      const rut = (d.rut_receptor ?? '').toLowerCase()
      const razon = (d.razon_social_receptor ?? '').toLowerCase()
      return rut.includes(q) || razon.includes(q)
    })
  }, [salesDocs, search])

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered
    return [...filtered].sort((a: any, b: any) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'es-CL', { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir])

  // KPI totals from filtered data
  const kpiTotals = useMemo(() => {
    return filtered.reduce(
      (acc: any, d: any) => ({
        neto: acc.neto + (d.monto_neto ?? 0),
        iva: acc.iva + (d.monto_iva ?? 0),
        total: acc.total + (d.monto_total ?? 0),
      }),
      { neto: 0, iva: 0, total: 0 },
    )
  }, [filtered])

  const cards = [
    { label: 'Total Documentos', value: String(filtered.length), sub: 'emitidos' },
    { label: 'Monto Neto', value: formatCLP(kpiTotals.neto), sub: 'monto neto' },
    { label: 'IVA Debito', value: formatCLP(kpiTotals.iva), sub: '19% impuesto' },
    { label: 'Total', value: formatCLP(kpiTotals.total), sub: 'monto total', highlight: true },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Ventas</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            Documentos de venta emitidos - {MONTHS[mes - 1]} {year}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={mes}
            onChange={e => setMes(Number(e.target.value))}
            className="input-field py-2 text-sm w-auto"
          >
            {MESES_SHORT.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="input-field py-2 text-sm w-auto"
          >
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      {!isLoading && !error && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map(c => (
            <div
              key={c.label}
              className={`card border border-[var(--cx-border-light)] rounded-2xl p-5 ${
                c.highlight ? 'bg-[var(--cx-active-bg)] border-[var(--cx-active-border)]' : ''
              }`}
            >
              <p className="text-[10px] uppercase tracking-widest text-[var(--cx-text-muted)] font-semibold">{c.label}</p>
              <p className={`text-lg font-bold mt-1 ${c.highlight ? 'text-[var(--cx-active-text)]' : 'text-[var(--cx-text-primary)]'}`}>
                {c.value}
              </p>
              <p className="text-[10px] text-[var(--cx-text-muted)] mt-0.5">{c.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search + Export bar */}
      {!isLoading && !error && salesDocs.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por RUT o razon social..."
              className="input-field pl-9 py-2 text-sm w-full"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--cx-text-muted)]">
              {filtered.length} {filtered.length === 1 ? 'registro' : 'registros'}
            </span>
            <button
              className="btn-secondary flex items-center gap-2 text-xs py-1.5 px-3"
              onClick={() => exportCSV(filtered, mes, year)}
            >
              <Download size={12} /> Descargar CSV
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading && <LoadingState />}
      {error && <ErrorState />}
      {!isLoading && !error && filtered.length === 0 && <EmptyState />}

      {/* Table */}
      {!isLoading && !error && filtered.length > 0 && (
        <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-[var(--cx-border-light)] sticky top-0 bg-white z-10">
            <div className="col-span-1"><SortHeader label="Estado" sortKey="status" current={sortKey} dir={sortDir} onSort={toggleSort} /></div>
            <div className="col-span-1"><SortHeader label="Tipo Doc" sortKey="tipo_dte" current={sortKey} dir={sortDir} onSort={toggleSort} /></div>
            <div className="col-span-1"><SortHeader label="Folio" sortKey="folio" current={sortKey} dir={sortDir} onSort={toggleSort} /></div>
            <div className="col-span-1"><SortHeader label="Fecha" sortKey="fecha_emision" current={sortKey} dir={sortDir} onSort={toggleSort} /></div>
            <div className="col-span-2"><SortHeader label="RUT Receptor" sortKey="rut_receptor" current={sortKey} dir={sortDir} onSort={toggleSort} /></div>
            <div className="col-span-2"><SortHeader label="Razon Social" sortKey="razon_social_receptor" current={sortKey} dir={sortDir} onSort={toggleSort} /></div>
            <div className="col-span-1"><SortHeader label="Neto" sortKey="monto_neto" current={sortKey} dir={sortDir} onSort={toggleSort} className="justify-end" /></div>
            <div className="col-span-1"><SortHeader label="IVA" sortKey="monto_iva" current={sortKey} dir={sortDir} onSort={toggleSort} className="justify-end" /></div>
            <div className="col-span-2"><SortHeader label="Total" sortKey="monto_total" current={sortKey} dir={sortDir} onSort={toggleSort} className="justify-end" /></div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-[var(--cx-border-light)]">
            {sorted.map((d: any, i: number) => (
              <div
                key={d.id ?? d.folio ?? i}
                className={`grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors ${
                  i % 2 === 1 ? 'bg-[var(--cx-bg-elevated)]/50' : ''
                }`}
              >
                <div className="col-span-1">
                  <StatusBadge status={d.status ?? 'borrador'} />
                </div>
                <div className="col-span-1 text-[var(--cx-text-secondary)] text-xs">
                  {tipeName(d.tipo_dte ?? 0)}
                </div>
                <div className="col-span-1 text-[var(--cx-text-primary)] font-mono text-xs">
                  #{d.folio ?? '-'}
                </div>
                <div className="col-span-1 text-[var(--cx-text-secondary)] text-xs">
                  {(d.fecha_emision ?? d.fecha ?? '').slice(5)}
                </div>
                <div className="col-span-2 text-[var(--cx-text-secondary)] font-mono text-xs">
                  {d.rut_receptor ?? '-'}
                </div>
                <div className="col-span-2 text-[var(--cx-text-primary)] truncate text-xs">
                  {d.razon_social_receptor ?? '-'}
                </div>
                <div className="col-span-1 text-right text-[var(--cx-text-primary)]">
                  {formatCLP(d.monto_neto ?? 0)}
                </div>
                <div className="col-span-1 text-right text-[var(--cx-text-secondary)] text-xs">
                  {formatCLP(d.monto_iva ?? 0)}
                </div>
                <div className="col-span-2 text-right text-[var(--cx-text-primary)] font-semibold">
                  {formatCLP(d.monto_total ?? 0)}
                </div>
              </div>
            ))}
          </div>

          {/* Totals row */}
          <div className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)] text-sm font-bold">
            <div className="col-span-8 text-[var(--cx-text-secondary)]">TOTALES</div>
            <div className="col-span-1 text-right text-[var(--cx-text-primary)]">{formatCLP(kpiTotals.neto)}</div>
            <div className="col-span-1 text-right text-[var(--cx-text-secondary)]">{formatCLP(kpiTotals.iva)}</div>
            <div className="col-span-2 text-right text-[var(--cx-active-icon)]">{formatCLP(kpiTotals.total)}</div>
          </div>
        </div>
      )}
    </div>
  )
}
