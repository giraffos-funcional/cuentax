/**
 * CUENTAX — Nóminas Mensuales
 * Monthly payroll run listing with expandable payslip summaries.
 */

'use client'

import { useState } from 'react'
import { ClipboardList, Loader2, AlertCircle, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import { usePayslipRuns } from '@/hooks/use-remuneraciones'

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const formatDate = (d: string) => {
  if (!d) return '-'
  const date = new Date(d)
  return date.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const STATE_BADGES: Record<string, string> = {
  draft: 'bg-[var(--cx-bg-elevated)] text-[var(--cx-text-secondary)] border border-[var(--cx-border-light)]',
  verify: 'bg-[var(--cx-active-bg)] text-[var(--cx-active-text)] border border-[var(--cx-active-border)]',
  close: 'bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border border-[var(--cx-status-ok-border)]',
}

const STATE_LABELS: Record<string, string> = {
  draft:  'Borrador',
  verify: 'Verificada',
  close:  'Cerrada',
}

function StateBadge({ state }: { state: string }) {
  const style = STATE_BADGES[state] ?? STATE_BADGES.draft
  const label = STATE_LABELS[state] ?? state
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold capitalize ${style}`}>
      {label}
    </span>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando nóminas...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando nóminas'}</span>
    </div>
  )
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <ClipboardList size={32} className="text-[var(--cx-text-muted)]" />
      <p className="text-sm font-medium text-[var(--cx-text-secondary)]">
        {hasFilter ? 'No se encontraron nóminas para ese período' : 'No hay nóminas registradas'}
      </p>
      {hasFilter && (
        <p className="text-xs text-[var(--cx-text-muted)]">Prueba con otro mes o año</p>
      )}
    </div>
  )
}

// -- Page --
export default function NominasPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const { runs, total, isLoading, error } = usePayslipRuns(month, year, page)

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)
  const pageSize = 20
  const totalPages = Math.max(1, Math.ceil((total ?? 0) / pageSize))
  const hasFilter = month !== (now.getMonth() + 1) || year !== now.getFullYear()

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Nóminas Mensuales</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">Lotes de procesamiento de liquidaciones</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={month}
          onChange={e => { setMonth(Number(e.target.value)); setPage(1) }}
          className="input-field py-2 text-sm w-auto"
        >
          {MONTHS.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={e => { setYear(Number(e.target.value)); setPage(1) }}
          className="input-field py-2 text-sm w-auto"
        >
          {years.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error?.message} />}

      {!isLoading && !error && (
        <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-[var(--cx-border-light)] text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest bg-[var(--cx-bg-elevated)]">
            <div className="col-span-4">Nombre</div>
            <div className="col-span-2">Fecha Inicio</div>
            <div className="col-span-2">Fecha Fin</div>
            <div className="col-span-2 text-center">Estado</div>
            <div className="col-span-2 text-right">N° Liquidaciones</div>
          </div>

          {(runs ?? []).length === 0 ? (
            <EmptyState hasFilter={hasFilter} />
          ) : (
            <div className="divide-y divide-[var(--cx-border-light)]">
              {(runs ?? []).map((run: any) => (
                <div key={run.id}>
                  <div
                    className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors cursor-pointer"
                    onClick={() => setExpandedId(expandedId === run.id ? null : run.id)}
                  >
                    <div className="col-span-4 flex items-center gap-1 font-medium text-[var(--cx-text-primary)] truncate">
                      {expandedId === run.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {run.name}
                    </div>
                    <div className="col-span-2 text-[var(--cx-text-secondary)]">{formatDate(run.date_start)}</div>
                    <div className="col-span-2 text-[var(--cx-text-secondary)]">{formatDate(run.date_end)}</div>
                    <div className="col-span-2 flex justify-center">
                      <StateBadge state={run.state ?? 'draft'} />
                    </div>
                    <div className="col-span-2 text-right font-mono text-[var(--cx-text-primary)]">
                      {run.payslip_count ?? 0}
                    </div>
                  </div>

                  {/* Expanded summary */}
                  {expandedId === run.id && run.payslips && (
                    <div className="px-8 py-4 bg-[var(--cx-bg-elevated)]">
                      <div className="card border border-[var(--cx-border-lighter)] rounded-xl overflow-hidden">
                        <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-[var(--cx-border-lighter)] text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest bg-[var(--cx-bg-surface)]">
                          <div className="col-span-4">Empleado</div>
                          <div className="col-span-3 text-right">Sueldo Bruto</div>
                          <div className="col-span-3 text-right">Sueldo Líquido</div>
                          <div className="col-span-2 text-center">Estado</div>
                        </div>
                        <div className="divide-y divide-[var(--cx-border-lighter)]">
                          {run.payslips.map((ps: any) => (
                            <div key={ps.id} className="grid grid-cols-12 gap-2 px-4 py-2 text-xs hover:bg-[var(--cx-hover-bg)] transition-colors">
                              <div className="col-span-4 text-[var(--cx-text-primary)] truncate">{ps.employee_name}</div>
                              <div className="col-span-3 text-right font-mono text-[var(--cx-text-primary)]">{formatCLP(ps.gross_wage ?? 0)}</div>
                              <div className="col-span-3 text-right font-mono text-[var(--cx-text-primary)]">{formatCLP(ps.net_wage ?? 0)}</div>
                              <div className="col-span-2 flex justify-center">
                                <StateBadge state={ps.state ?? 'draft'} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination footer */}
          {(runs ?? []).length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)]">
              <span className="text-xs text-[var(--cx-text-muted)]">
                {total ?? 0} nómina{(total ?? 0) !== 1 ? 's' : ''} encontrada{(total ?? 0) !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="btn-secondary p-1.5 disabled:opacity-40"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-[var(--cx-text-secondary)]">
                  Página {page} de {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="btn-secondary p-1.5 disabled:opacity-40"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
