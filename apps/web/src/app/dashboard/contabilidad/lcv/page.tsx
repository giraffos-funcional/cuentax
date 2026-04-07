/**
 * CUENTAX — Libro de Compras y Ventas (LCV)
 * Dedicated page for viewing, exporting, and managing LCV data.
 * Connected to real data via useLCV hook (Odoo accounting).
 */

'use client'

import { useState } from 'react'
import {
  Download, FileText, Loader2, AlertCircle,
  BookOpen, FileSpreadsheet, Printer, ArrowUpRight,
} from 'lucide-react'
import { useLCV } from '@/hooks'
import { formatCLP, MONTHS } from '@/lib/formatters'

// ── Helpers ──────────────────────────────────────────────────

const MESES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                     'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

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
      <BookOpen size={40} className="text-[var(--cx-text-muted)] mb-3" />
      <p className="text-sm font-medium text-[var(--cx-text-primary)]">Sin registros</p>
      <p className="text-xs text-[var(--cx-text-muted)] mt-1">No hay documentos registrados para este periodo</p>
    </div>
  )
}

function SourceBadge({ source }: { source: string }) {
  if (source === 'odoo') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border border-[var(--cx-status-ok-border)]">
        Odoo
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--cx-status-warn-bg)] text-[var(--cx-status-warn-text)] border border-[var(--cx-status-warn-border)]">
      Local
    </span>
  )
}

// ── CSV export ───────────────────────────────────────────────

function exportCSV(registros: any[], libro: string, mes: number, year: number) {
  if (!registros.length) return

  const headers = ['N', 'Tipo Doc', 'Folio', 'Fecha', 'RUT', 'Razon Social', 'Neto', 'IVA', 'Total']
  const rows = registros.map((r: any, i: number) => [
    i + 1,
    r.tipo_dte ?? r.tipo ?? '',
    r.folio ?? r.l10n_latam_document_number ?? '',
    r.fecha_emision ?? r.fecha ?? '',
    r.rut_receptor ?? r.rut ?? '',
    `"${(r.razon_social_receptor ?? r.receptor ?? '').replace(/"/g, '""')}"`,
    r.monto_neto ?? r.neto ?? r.amount_untaxed ?? 0,
    r.monto_iva ?? r.iva ?? r.amount_tax ?? 0,
    r.monto_total ?? r.total ?? r.amount_total ?? 0,
  ])

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `LCV_${libro}_${year}_${String(mes).padStart(2, '0')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── LCV Table ────────────────────────────────────────────────

function LCVTable({ mes, year, libro }: { mes: number; year: number; libro: 'ventas' | 'compras' }) {
  const { registros, totales, source, isLoading, error } = useLCV(mes, year, libro)

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState />
  if (!isLoading && !error && registros.length === 0) return <EmptyState />

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--cx-text-muted)]">
            {registros.length} {registros.length === 1 ? 'registro' : 'registros'}
          </span>
          <SourceBadge source={source} />
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary flex items-center gap-2 text-xs py-1.5 px-3"
            onClick={() => exportCSV(registros, libro, mes, year)}
          >
            <Download size={12} /> Descargar CSV
          </button>
          <button
            className="btn-secondary flex items-center gap-2 text-xs py-1.5 px-3"
            onClick={() => window.open(`/api/v1/reportes/lcv/pdf?mes=${mes}&year=${year}&libro=${libro}`, '_blank')}
          >
            <Printer size={12} /> Descargar PDF
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-[var(--cx-border-light)] text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest">
          <div className="col-span-1">N.</div>
          <div className="col-span-1">Tipo</div>
          <div className="col-span-1">Folio</div>
          <div className="col-span-1">Fecha</div>
          <div className="col-span-2">RUT</div>
          <div className="col-span-2">Razon Social</div>
          <div className="col-span-2 text-right">Neto</div>
          <div className="col-span-1 text-right">IVA</div>
          <div className="col-span-1 text-right">Total</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-[var(--cx-border-light)]">
          {registros.map((r: any, i: number) => (
            <div
              key={r.folio ?? r.l10n_latam_document_number ?? i}
              className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors"
            >
              <div className="col-span-1 text-[var(--cx-text-muted)] text-xs">{i + 1}</div>
              <div className="col-span-1 text-[var(--cx-text-secondary)] text-xs">{r.tipo_dte ?? r.tipo ?? '-'}</div>
              <div className="col-span-1 text-[var(--cx-text-primary)] font-mono text-xs">#{r.folio ?? r.l10n_latam_document_number ?? '-'}</div>
              <div className="col-span-1 text-[var(--cx-text-secondary)] text-xs">{(r.fecha_emision ?? r.fecha ?? '').slice(5)}</div>
              <div className="col-span-2 text-[var(--cx-text-secondary)] font-mono text-xs">{r.rut_receptor ?? r.rut ?? '-'}</div>
              <div className="col-span-2 text-[var(--cx-text-primary)] truncate text-xs">{r.razon_social_receptor ?? r.receptor ?? '-'}</div>
              <div className="col-span-2 text-right text-[var(--cx-text-primary)]">{formatCLP(r.monto_neto ?? r.neto ?? r.amount_untaxed ?? 0)}</div>
              <div className="col-span-1 text-right text-[var(--cx-text-secondary)] text-xs">{formatCLP(r.monto_iva ?? r.iva ?? r.amount_tax ?? 0)}</div>
              <div className="col-span-1 text-right text-[var(--cx-text-primary)] font-semibold">{formatCLP(r.monto_total ?? r.total ?? r.amount_total ?? 0)}</div>
            </div>
          ))}
        </div>

        {/* Totals row */}
        <div className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)] text-sm font-bold">
          <div className="col-span-8 text-[var(--cx-text-secondary)]">TOTALES</div>
          <div className="col-span-2 text-right text-[var(--cx-text-primary)]">{formatCLP(totales.neto)}</div>
          <div className="col-span-1 text-right text-[var(--cx-text-secondary)]">{formatCLP(totales.iva)}</div>
          <div className="col-span-1 text-right text-[var(--cx-active-icon)]">{formatCLP(totales.total)}</div>
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────

export default function LibroComprasVentasPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [libro, setLibro] = useState<'ventas' | 'compras'>('ventas')

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Libro de Compras y Ventas</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            Registro tributario de {libro === 'ventas' ? 'ventas' : 'compras'} - {MONTHS[month - 1]} {year}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="input-field py-2 text-sm w-auto"
          >
            {MESES_SHORT.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="input-field py-2 text-sm w-auto"
          >
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Libro tabs */}
      <div className="flex items-center gap-2">
        {(['ventas', 'compras'] as const).map(b => (
          <button
            key={b}
            onClick={() => setLibro(b)}
            className={`
              flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
              ${libro === b
                ? 'bg-[var(--cx-active-bg)] text-[var(--cx-active-text)] border border-[var(--cx-active-border)]'
                : 'text-[var(--cx-text-secondary)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)]'
              }
            `}
          >
            {b === 'ventas' ? <ArrowUpRight size={13} /> : <FileSpreadsheet size={13} />}
            {b === 'ventas' ? 'Libro de Ventas' : 'Libro de Compras'}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <SummaryCards mes={month} year={year} libro={libro} />

      {/* Table */}
      <LCVTable mes={month} year={year} libro={libro} />

      {/* SII notice */}
      <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--cx-status-warn-bg)] border border-[var(--cx-status-warn-border)]">
        <span className="text-[var(--cx-status-warn-text)] text-xs font-medium">
          Los datos del Libro de {libro === 'ventas' ? 'Ventas' : 'Compras'} deben ser verificados antes de presentar al SII.
        </span>
      </div>
    </div>
  )
}

// ── Summary Cards ────────────────────────────────────────────

function SummaryCards({ mes, year, libro }: { mes: number; year: number; libro: 'ventas' | 'compras' }) {
  const { registros, totales, isLoading } = useLCV(mes, year, libro)

  if (isLoading) return null

  const cards = [
    { label: 'Total Documentos', value: String(registros.length), sub: `${libro === 'ventas' ? 'emitidos' : 'recibidos'}` },
    { label: 'Neto', value: formatCLP(totales.neto), sub: 'monto neto' },
    { label: 'IVA', value: formatCLP(totales.iva), sub: '19% impuesto' },
    { label: 'Total', value: formatCLP(totales.total), sub: 'monto total', highlight: true },
  ]

  return (
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
  )
}
