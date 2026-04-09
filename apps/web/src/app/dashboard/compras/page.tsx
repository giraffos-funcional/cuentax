/**
 * CUENTAX — Compras (Purchase Documents)
 * Shows received purchase documents from the RCV sync.
 * Connected to real data via useLCV hook (libro=compras).
 */

'use client'

import { useState, useMemo } from 'react'
import {
  Download, Loader2, AlertCircle, ShoppingCart,
  Search, FileText, ChevronUp, ChevronDown,
} from 'lucide-react'
import { useLCV } from '@/hooks'
import { formatCLP, MONTHS } from '@/lib/formatters'

// ── Helpers ──────────────────────────────────────────────────

const MESES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                     'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const TIPO_DOC_NAMES: Record<number, string> = {
  33: 'Factura', 34: 'Factura Exenta', 39: 'Boleta',
  41: 'Boleta Exenta', 46: 'Fact. Compra', 56: 'Nota Debito', 61: 'Nota Credito',
}

function tipeName(tipo: number | string) {
  const n = typeof tipo === 'string' ? parseInt(tipo, 10) : tipo
  return TIPO_DOC_NAMES[n] ?? `Tipo ${tipo}`
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
      <ShoppingCart size={40} className="text-[var(--cx-text-muted)] mb-3" />
      <p className="text-sm font-medium text-[var(--cx-text-primary)]">Sin documentos de compra</p>
      <p className="text-xs text-[var(--cx-text-muted)] mt-1">
        No hay documentos recibidos para este periodo. Sincroniza el RCV desde el Libro C/V.
      </p>
    </div>
  )
}

// ── CSV export ───────────────────────────────────────────────

function exportCSV(registros: any[], mes: number, year: number) {
  if (!registros.length) return

  const headers = ['Tipo Doc', 'Folio', 'Fecha', 'RUT Proveedor', 'Razon Social', 'Neto', 'Exento', 'IVA', 'Total']
  const rows = registros.map((r: any) => [
    r.tipo_dte ?? r.tipo ?? '',
    r.folio ?? r.l10n_latam_document_number ?? '',
    r.fecha_emision ?? r.fecha ?? '',
    r.rut_receptor ?? r.rut ?? '',
    `"${(r.razon_social_receptor ?? r.receptor ?? '').replace(/"/g, '""')}"`,
    r.monto_neto ?? r.neto ?? r.amount_untaxed ?? 0,
    r.monto_exento ?? r.exento ?? 0,
    r.monto_iva ?? r.iva ?? r.amount_tax ?? 0,
    r.monto_total ?? r.total ?? r.amount_total ?? 0,
  ])

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Compras_${year}_${String(mes).padStart(2, '0')}.csv`
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

export default function ComprasPage() {
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

  const { registros, totales, isLoading, error } = useLCV(mes, year, 'compras')

  const filtered = useMemo(() => {
    if (!search.trim()) return registros
    const q = search.toLowerCase()
    return registros.filter((r: any) => {
      const rut = (r.rut_receptor ?? r.rut ?? '').toLowerCase()
      const razon = (r.razon_social_receptor ?? r.receptor ?? '').toLowerCase()
      return rut.includes(q) || razon.includes(q)
    })
  }, [registros, search])

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
    if (!search.trim()) return totales
    return filtered.reduce(
      (acc: any, r: any) => ({
        neto: acc.neto + (r.monto_neto ?? r.neto ?? r.amount_untaxed ?? 0),
        iva: acc.iva + (r.monto_iva ?? r.iva ?? r.amount_tax ?? 0),
        total: acc.total + (r.monto_total ?? r.total ?? r.amount_total ?? 0),
      }),
      { neto: 0, iva: 0, total: 0 },
    )
  }, [filtered, totales, search])

  const cards = [
    { label: 'Total Documentos', value: String(filtered.length), sub: 'recibidos' },
    { label: 'Monto Neto', value: formatCLP(kpiTotals.neto), sub: 'monto neto' },
    { label: 'IVA Credito', value: formatCLP(kpiTotals.iva), sub: '19% impuesto' },
    { label: 'Total', value: formatCLP(kpiTotals.total), sub: 'monto total', highlight: true },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Compras</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            Documentos de compra recibidos - {MONTHS[mes - 1]} {year}
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
      {!isLoading && !error && registros.length > 0 && (
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
            <div className="col-span-1"><SortHeader label="Tipo Doc" sortKey="tipo_dte" current={sortKey} dir={sortDir} onSort={toggleSort} /></div>
            <div className="col-span-1"><SortHeader label="Folio" sortKey="folio" current={sortKey} dir={sortDir} onSort={toggleSort} /></div>
            <div className="col-span-1"><SortHeader label="Fecha" sortKey="fecha_emision" current={sortKey} dir={sortDir} onSort={toggleSort} /></div>
            <div className="col-span-2"><SortHeader label="RUT Proveedor" sortKey="rut_receptor" current={sortKey} dir={sortDir} onSort={toggleSort} /></div>
            <div className="col-span-2"><SortHeader label="Razon Social" sortKey="razon_social_receptor" current={sortKey} dir={sortDir} onSort={toggleSort} /></div>
            <div className="col-span-1"><SortHeader label="Neto" sortKey="monto_neto" current={sortKey} dir={sortDir} onSort={toggleSort} className="justify-end" /></div>
            <div className="col-span-1"><SortHeader label="Exento" sortKey="monto_exento" current={sortKey} dir={sortDir} onSort={toggleSort} className="justify-end" /></div>
            <div className="col-span-1"><SortHeader label="IVA" sortKey="monto_iva" current={sortKey} dir={sortDir} onSort={toggleSort} className="justify-end" /></div>
            <div className="col-span-2"><SortHeader label="Total" sortKey="monto_total" current={sortKey} dir={sortDir} onSort={toggleSort} className="justify-end" /></div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-[var(--cx-border-light)]">
            {sorted.map((r: any, i: number) => (
              <div
                key={r.folio ?? r.l10n_latam_document_number ?? i}
                className={`grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors ${
                  i % 2 === 1 ? 'bg-[var(--cx-bg-elevated)]/50' : ''
                }`}
              >
                <div className="col-span-1 text-[var(--cx-text-secondary)] text-xs">
                  {tipeName(r.tipo_dte ?? r.tipo ?? 0)}
                </div>
                <div className="col-span-1 text-[var(--cx-text-primary)] font-mono text-xs">
                  #{r.folio ?? r.l10n_latam_document_number ?? '-'}
                </div>
                <div className="col-span-1 text-[var(--cx-text-secondary)] text-xs">
                  {(r.fecha_emision ?? r.fecha ?? '').slice(5)}
                </div>
                <div className="col-span-2 text-[var(--cx-text-secondary)] font-mono text-xs">
                  {r.rut_receptor ?? r.rut ?? '-'}
                </div>
                <div className="col-span-2 text-[var(--cx-text-primary)] truncate text-xs">
                  {r.razon_social_receptor ?? r.receptor ?? '-'}
                </div>
                <div className="col-span-1 text-right text-[var(--cx-text-primary)]">
                  {formatCLP(r.monto_neto ?? r.neto ?? r.amount_untaxed ?? 0)}
                </div>
                <div className="col-span-1 text-right text-[var(--cx-text-secondary)] text-xs">
                  {formatCLP(r.monto_exento ?? r.exento ?? 0)}
                </div>
                <div className="col-span-1 text-right text-[var(--cx-text-secondary)] text-xs">
                  {formatCLP(r.monto_iva ?? r.iva ?? r.amount_tax ?? 0)}
                </div>
                <div className="col-span-2 text-right text-[var(--cx-text-primary)] font-semibold">
                  {formatCLP(r.monto_total ?? r.total ?? r.amount_total ?? 0)}
                </div>
              </div>
            ))}
          </div>

          {/* Totals row */}
          <div className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)] text-sm font-bold">
            <div className="col-span-7 text-[var(--cx-text-secondary)]">TOTALES</div>
            <div className="col-span-1 text-right text-[var(--cx-text-primary)]">{formatCLP(kpiTotals.neto)}</div>
            <div className="col-span-1 text-right text-[var(--cx-text-secondary)]" />
            <div className="col-span-1 text-right text-[var(--cx-text-secondary)]">{formatCLP(kpiTotals.iva)}</div>
            <div className="col-span-2 text-right text-[var(--cx-active-icon)]">{formatCLP(kpiTotals.total)}</div>
          </div>
        </div>
      )}
    </div>
  )
}
