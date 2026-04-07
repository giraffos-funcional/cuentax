/**
 * CUENTAX — Libro Diario
 * Chronological journal entries with expandable lines and period/journal/state filters.
 */

'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Download, Loader2, AlertCircle, BookText, Plus } from 'lucide-react'
import Link from 'next/link'
import { useJournalEntries } from '@/hooks'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
               'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

type EntryState = 'todos' | 'draft' | 'posted'

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando asientos...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando el libro diario'}</span>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <BookText size={32} className="text-[var(--cx-text-muted)]" />
      <p className="text-sm font-medium text-[var(--cx-text-secondary)]">No hay asientos para este período</p>
      <p className="text-xs text-[var(--cx-text-muted)]">Cambia el período o los filtros para ver más resultados</p>
    </div>
  )
}

function StateBadge({ state }: { state: string }) {
  if (state === 'posted') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border border-[var(--cx-status-ok-border)]">
        Confirmado
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--cx-status-warn-bg)] text-[var(--cx-status-warn-text)] border border-[var(--cx-status-warn-border)]">
      Borrador
    </span>
  )
}

function EntryRow({ asiento }: { asiento: any }) {
  const [expanded, setExpanded] = useState(false)
  const lineas: any[] = asiento.lineas ?? []

  return (
    <>
      {/* Main row */}
      <div
        className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors cursor-pointer select-none"
        onClick={() => setExpanded(prev => !prev)}
      >
        <div className="col-span-1 flex items-center gap-1 text-[var(--cx-text-secondary)] text-xs">
          {lineas.length > 0
            ? expanded
              ? <ChevronDown size={13} className="text-[var(--cx-active-icon)]" />
              : <ChevronRight size={13} />
            : <span className="w-3" />
          }
          {asiento.fecha ? String(asiento.fecha).slice(5) : '-'}
        </div>
        <div className="col-span-2 font-mono text-xs text-[var(--cx-text-primary)]">{asiento.numero ?? asiento.name ?? '-'}</div>
        <div className="col-span-2 text-[var(--cx-text-secondary)] truncate text-xs">{asiento.referencia ?? asiento.ref ?? '-'}</div>
        <div className="col-span-2 text-[var(--cx-text-secondary)] truncate text-xs">{asiento.diario ?? asiento.journal ?? '-'}</div>
        <div className="col-span-2 text-right font-mono text-[var(--cx-text-primary)]">
          {formatCLP(asiento.debe ?? asiento.debit ?? 0)}
        </div>
        <div className="col-span-2 text-right font-mono text-[var(--cx-text-primary)]">
          {formatCLP(asiento.haber ?? asiento.credit ?? 0)}
        </div>
        <div className="col-span-1 flex justify-end">
          <StateBadge state={asiento.estado ?? asiento.state ?? 'draft'} />
        </div>
      </div>

      {/* Expanded lines */}
      {expanded && lineas.length > 0 && (
        <div className="bg-[var(--cx-bg-elevated)] border-t border-b border-[var(--cx-border-light)]">
          {/* Lines sub-header */}
          <div className="grid grid-cols-12 gap-2 px-10 py-2 text-[9px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest border-b border-[var(--cx-border-light)]">
            <div className="col-span-3">Cuenta</div>
            <div className="col-span-5">Descripción</div>
            <div className="col-span-2 text-right">Debe</div>
            <div className="col-span-2 text-right">Haber</div>
          </div>
          {lineas.map((linea: any, i: number) => (
            <div
              key={linea.id ?? i}
              className="grid grid-cols-12 gap-2 px-10 py-2 text-xs border-b last:border-b-0 border-[var(--cx-border-light)] hover:bg-[var(--cx-hover-bg)] transition-colors"
            >
              <div className="col-span-3 font-mono text-[var(--cx-text-secondary)] truncate">
                {linea.cuenta ?? linea.account ?? '-'}
              </div>
              <div className="col-span-5 text-[var(--cx-text-primary)] truncate">
                {linea.descripcion ?? linea.name ?? '-'}
              </div>
              <div className="col-span-2 text-right font-mono text-[var(--cx-text-primary)]">
                {(linea.debe ?? linea.debit ?? 0) > 0 ? formatCLP(linea.debe ?? linea.debit) : '—'}
              </div>
              <div className="col-span-2 text-right font-mono text-[var(--cx-text-primary)]">
                {(linea.haber ?? linea.credit ?? 0) > 0 ? formatCLP(linea.haber ?? linea.credit) : '—'}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── CSV export helper ──────────────────────────────────────────
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

// ── Page ──────────────────────────────────────────────────────
export default function LibroDiarioPage() {
  const now = new Date()
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [journal, setJournal] = useState('')
  const [state, setState] = useState<EntryState>('todos')

  const { asientos, total, isLoading, error } = useJournalEntries(mes, year, journal, state === 'todos' ? '' : state)

  const totalDebe  = asientos?.reduce((s: number, a: any) => s + (a.debe  ?? a.debit  ?? 0), 0) ?? 0
  const totalHaber = asientos?.reduce((s: number, a: any) => s + (a.haber ?? a.credit ?? 0), 0) ?? 0

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Libro Diario</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">Asientos contables en orden cronológico</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/dashboard/contabilidad/asientos" className="btn-primary">
            <Plus size={14} /> Nuevo Asiento
          </Link>
          <button
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl border border-[var(--cx-border-light)] text-[var(--cx-text-secondary)] hover:bg-[var(--cx-hover-bg)] transition-colors"
            onClick={() => window.open(`/api/v1/contabilidad/libro-diario/pdf?year=${year}&mes=${mes}`, '_blank')}
          >
            <Download size={13} />
            PDF
          </button>
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={() => exportCSV(asientos ?? [], 'libro-diario')}
          >
            <Download size={13} /> Exportar
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select value={mes} onChange={e => setMes(Number(e.target.value))} className="input-field py-2 text-sm w-auto">
          {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="input-field py-2 text-sm w-auto">
          {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <input
          type="text"
          placeholder="Filtrar por diario..."
          value={journal}
          onChange={e => setJournal(e.target.value)}
          className="input-field py-2 text-sm w-44"
        />
        <select value={state} onChange={e => setState(e.target.value as EntryState)} className="input-field py-2 text-sm w-auto">
          <option value="todos">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="posted">Confirmado</option>
        </select>
        {total !== undefined && (
          <span className="ml-auto self-center text-xs text-[var(--cx-text-muted)]">
            {total} asiento{total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Table */}
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error?.message} />}

      {!isLoading && !error && (
        <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-[var(--cx-border-light)] text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest bg-[var(--cx-bg-elevated)]">
            <div className="col-span-1">Fecha</div>
            <div className="col-span-2">Número</div>
            <div className="col-span-2">Referencia</div>
            <div className="col-span-2">Diario</div>
            <div className="col-span-2 text-right">Debe</div>
            <div className="col-span-2 text-right">Haber</div>
            <div className="col-span-1 text-right">Estado</div>
          </div>

          {asientos?.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="divide-y divide-[var(--cx-border-light)]">
              {asientos?.map((asiento: any, i: number) => (
                <EntryRow key={asiento.id ?? asiento.numero ?? i} asiento={asiento} />
              ))}
            </div>
          )}

          {/* Totals row */}
          {(asientos?.length ?? 0) > 0 && (
            <div className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)] text-sm font-bold">
              <div className="col-span-7 text-[var(--cx-text-secondary)]">TOTALES</div>
              <div className="col-span-2 text-right text-[var(--cx-text-primary)]">{formatCLP(totalDebe)}</div>
              <div className="col-span-2 text-right text-[var(--cx-text-primary)]">{formatCLP(totalHaber)}</div>
              <div className="col-span-1" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
