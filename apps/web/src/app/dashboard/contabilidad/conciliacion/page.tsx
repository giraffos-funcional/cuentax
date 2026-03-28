/**
 * CUENTAX — Conciliación Bancaria
 * Bank reconciliation — extracto vs movimientos sin conciliar.
 */

'use client'

import { useState } from 'react'
import { Download, Printer, CheckCircle2, Clock, Loader2, AlertCircle, Landmark } from 'lucide-react'
import { useBankReconciliation, useJournals } from '@/hooks'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
               'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

// Journals are fetched from Odoo via useJournals hook (see page component)

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando conciliación...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando conciliación'}</span>
    </div>
  )
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      <Clock size={28} className="text-[var(--cx-text-muted)]" />
      <p className="text-sm text-[var(--cx-text-muted)]">{message}</p>
    </div>
  )
}

function TableHeader({ columns }: { columns: string[] }) {
  return (
    <div className={`grid gap-2 px-4 py-3 border-b border-[var(--cx-border-light)] text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]`}
         style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
      {columns.map(col => (
        <div key={col} className={col === 'Monto' ? 'text-right' : ''}>{col}</div>
      ))}
    </div>
  )
}

// ── Extracto Bancario panel ────────────────────────────────────
function ExtractoPanel({ extracto }: { extracto: { fecha: string; referencia: string; monto: number; conciliado: boolean }[] }) {
  if (extracto.length === 0) return <EmptyPanel message="Sin movimientos en el extracto" />

  return (
    <div className="divide-y divide-[var(--cx-border-light)]">
      {extracto.map((row, i) => (
        <div key={i} className="grid grid-cols-4 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors">
          <div className="text-[var(--cx-text-secondary)] text-xs font-mono">{row.fecha}</div>
          <div className="text-[var(--cx-text-primary)] truncate col-span-1">{row.referencia}</div>
          <div className="text-right text-[var(--cx-text-primary)] tabular-nums">{formatCLP(row.monto)}</div>
          <div className="flex justify-center items-center">
            {row.conciliado
              ? <CheckCircle2 size={15} className="text-[var(--cx-status-ok-text)]" />
              : <Clock size={15} className="text-[var(--cx-text-muted)]" />
            }
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Sin Conciliar panel ────────────────────────────────────────
function SinConciliarPanel({ items }: { items: { fecha: string; documento: string; descripcion: string; monto: number }[] }) {
  if (items.length === 0) return <EmptyPanel message="Sin movimientos pendientes" />

  return (
    <div className="divide-y divide-[var(--cx-border-light)]">
      {items.map((row, i) => (
        <div key={i} className="grid grid-cols-4 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors">
          <div className="text-[var(--cx-text-secondary)] text-xs font-mono">{row.fecha}</div>
          <div className="text-[var(--cx-text-primary)] truncate font-mono text-xs">{row.documento}</div>
          <div className="text-[var(--cx-text-secondary)] truncate text-xs">{row.descripcion}</div>
          <div className="text-right text-[var(--cx-text-primary)] tabular-nums">{formatCLP(row.monto)}</div>
        </div>
      ))}
    </div>
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
export default function ConciliacionPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [journalId, setJournalId] = useState<number | null>(null)

  const { journals } = useJournals()
  const bankJournals = journals.filter((j: any) => j.tipo === 'bank')

  const { extracto, sin_conciliar, total_extracto, total_sin_conciliar, isLoading, error } =
    useBankReconciliation(journalId, month, year)

  const diferencia = total_extracto - total_sin_conciliar
  const cuadra = diferencia === 0

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Conciliación Bancaria</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            Extracto bancario vs movimientos contables · {MESES[month - 1]} {year}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={journalId ?? ''}
            onChange={e => setJournalId(e.target.value ? Number(e.target.value) : null)}
            className="input-field py-2 text-sm w-auto"
          >
            <option value="">Seleccionar cuenta...</option>
            {bankJournals.map((j: any) => (
              <option key={j.id} value={j.id}>{j.nombre}</option>
            ))}
          </select>
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="input-field py-2 text-sm w-auto"
          >
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="input-field py-2 text-sm w-auto"
          >
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={() => window.print()}
          >
            <Printer size={13} /> Imprimir
          </button>
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={() => exportCSV(extracto ?? [], 'conciliacion-extracto')}
          >
            <Download size={13} /> Exportar
          </button>
        </div>
      </div>

      {/* No journal selected */}
      {!journalId && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[var(--cx-bg-elevated)] border border-[var(--cx-border-light)] flex items-center justify-center">
            <Landmark size={28} className="text-[var(--cx-text-muted)]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--cx-text-primary)]">Selecciona una cuenta bancaria</p>
            <p className="text-xs text-[var(--cx-text-muted)] mt-1">
              Elige una cuenta del selector para ver la conciliación del período
            </p>
          </div>
        </div>
      )}

      {/* Data */}
      {journalId && (
        <>
          {isLoading && <LoadingState />}
          {error && <ErrorState message={typeof error === 'string' ? error : undefined} />}

          {!isLoading && !error && (
            <div className="space-y-5">
              {/* Two-panel layout */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Extracto Bancario */}
                <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)]">
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">
                      Extracto Bancario
                    </h3>
                  </div>
                  <TableHeader columns={['Fecha', 'Referencia', 'Monto', 'Estado']} />
                  <ExtractoPanel extracto={extracto ?? []} />
                </div>

                {/* Movimientos Sin Conciliar */}
                <div className="card border border-[var(--cx-status-warn-border)] rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-[var(--cx-border-light)] bg-[var(--cx-status-warn-bg)]">
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">
                      Movimientos Sin Conciliar
                    </h3>
                  </div>
                  <TableHeader columns={['Fecha', 'Documento', 'Descripción', 'Monto']} />
                  <SinConciliarPanel items={sin_conciliar ?? []} />
                </div>
              </div>

              {/* Summary bar */}
              <div className={`grid grid-cols-3 gap-4 p-4 rounded-2xl border ${
                cuadra
                  ? 'bg-[var(--cx-status-ok-bg)] border-[var(--cx-status-ok-border)]'
                  : 'bg-[var(--cx-status-warn-bg)] border-[var(--cx-status-warn-border)]'
              }`}>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-[var(--cx-text-muted)] mb-1">
                    Total Extracto
                  </p>
                  <p className="text-base font-bold text-[var(--cx-text-primary)] tabular-nums">
                    {formatCLP(total_extracto ?? 0)}
                  </p>
                </div>
                <div className="text-center border-x border-[var(--cx-border-light)]">
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-[var(--cx-text-muted)] mb-1">
                    Total Sin Conciliar
                  </p>
                  <p className="text-base font-bold text-[var(--cx-status-warn-text)] tabular-nums">
                    {formatCLP(total_sin_conciliar ?? 0)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-[var(--cx-text-muted)] mb-1">
                    Diferencia
                  </p>
                  <p className={`text-base font-bold tabular-nums ${
                    cuadra
                      ? 'text-[var(--cx-status-ok-text)]'
                      : 'text-[var(--cx-status-error-text)]'
                  }`}>
                    {cuadra ? '—' : formatCLP(Math.abs(diferencia))}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
