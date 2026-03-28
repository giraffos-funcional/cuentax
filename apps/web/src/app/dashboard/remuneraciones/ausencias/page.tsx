/**
 * CUENTAX — Ausencias y Vacaciones
 * Leave requests with type summaries, filters, and state badges.
 */

'use client'

import { useState } from 'react'
import { Search, CalendarOff, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { useLeaves, useLeaveTypes } from '@/hooks/use-remuneraciones'

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
  draft:    'bg-[var(--cx-bg-elevated)] text-[var(--cx-text-secondary)] border border-[var(--cx-border-light)]',
  confirm:  'bg-[var(--cx-active-bg)] text-[var(--cx-active-text)] border border-[var(--cx-active-border)]',
  validate: 'bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border border-[var(--cx-status-ok-border)]',
  refuse:   'bg-[var(--cx-status-error-bg)] text-[var(--cx-status-error-text)] border border-[var(--cx-status-error-border)]',
}

const STATE_LABELS: Record<string, string> = {
  draft:    'Borrador',
  confirm:  'Confirmada',
  validate: 'Aprobada',
  refuse:   'Rechazada',
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
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando ausencias...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando ausencias'}</span>
    </div>
  )
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <CalendarOff size={32} className="text-[var(--cx-text-muted)]" />
      <p className="text-sm font-medium text-[var(--cx-text-secondary)]">
        {hasFilter ? 'No se encontraron ausencias con ese criterio' : 'No hay ausencias registradas'}
      </p>
      {hasFilter && (
        <p className="text-xs text-[var(--cx-text-muted)]">Prueba con otros filtros o período</p>
      )}
    </div>
  )
}

// -- Page --
export default function AusenciasPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [leaveTypeId, setLeaveTypeId] = useState('')
  const [state, setState] = useState('')
  const [page, setPage] = useState(1)

  const { leaves, total, summary, isLoading, error } = useLeaves({
    employee_id: employeeSearch,
    state: state || undefined,
    mes: month,
    year,
    page,
  })
  const { leaveTypes } = useLeaveTypes()

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)
  const pageSize = 20
  const totalPages = Math.max(1, Math.ceil((total ?? 0) / pageSize))
  const hasFilter = Boolean(employeeSearch) || Boolean(leaveTypeId) || Boolean(state)

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Ausencias y Vacaciones</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">Solicitudes de ausencia, permisos y vacaciones</p>
        </div>
      </div>

      {/* Summary cards */}
      {summary && summary.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {summary.map((s: any) => (
            <div key={s.type} className="card border border-[var(--cx-border-light)] rounded-2xl p-4 text-center">
              <p className="text-xs text-[var(--cx-text-muted)] uppercase tracking-widest font-semibold truncate">{s.type}</p>
              <p className="text-xl font-bold text-[var(--cx-text-primary)] mt-1">{s.count}</p>
              <p className="text-[10px] text-[var(--cx-text-muted)]">{s.days} día{s.days !== 1 ? 's' : ''}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" />
          <input
            type="text"
            placeholder="Buscar por empleado..."
            value={employeeSearch}
            onChange={e => { setEmployeeSearch(e.target.value); setPage(1) }}
            className="input-field pl-9 py-2 text-sm w-full"
          />
        </div>
        <select
          value={leaveTypeId}
          onChange={e => { setLeaveTypeId(e.target.value); setPage(1) }}
          className="input-field py-2 text-sm w-auto"
        >
          <option value="">Todos los tipos</option>
          {(leaveTypes ?? []).map((lt: any) => (
            <option key={lt.id} value={lt.id}>{lt.name}</option>
          ))}
        </select>
        <select
          value={state}
          onChange={e => { setState(e.target.value); setPage(1) }}
          className="input-field py-2 text-sm w-auto"
        >
          <option value="">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="confirm">Confirmada</option>
          <option value="validate">Aprobada</option>
          <option value="refuse">Rechazada</option>
        </select>
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
            <div className="col-span-3">Empleado</div>
            <div className="col-span-2">Tipo Ausencia</div>
            <div className="col-span-2">Desde</div>
            <div className="col-span-2">Hasta</div>
            <div className="col-span-1 text-right">Días</div>
            <div className="col-span-2 text-center">Estado</div>
          </div>

          {(leaves ?? []).length === 0 ? (
            <EmptyState hasFilter={hasFilter} />
          ) : (
            <div className="divide-y divide-[var(--cx-border-light)]">
              {(leaves ?? []).map((leave: any) => (
                <div
                  key={leave.id}
                  className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors"
                >
                  <div className="col-span-3 font-medium text-[var(--cx-text-primary)] truncate">{leave.employee_name}</div>
                  <div className="col-span-2 text-[var(--cx-text-secondary)] truncate">{leave.leave_type ?? '-'}</div>
                  <div className="col-span-2 text-[var(--cx-text-secondary)]">{formatDate(leave.date_from)}</div>
                  <div className="col-span-2 text-[var(--cx-text-secondary)]">{formatDate(leave.date_to)}</div>
                  <div className="col-span-1 text-right font-mono text-[var(--cx-text-primary)]">{leave.number_of_days ?? 0}</div>
                  <div className="col-span-2 flex justify-center">
                    <StateBadge state={leave.state ?? 'draft'} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination footer */}
          {(leaves ?? []).length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)]">
              <span className="text-xs text-[var(--cx-text-muted)]">
                {total ?? 0} ausencia{(total ?? 0) !== 1 ? 's' : ''} encontrada{(total ?? 0) !== 1 ? 's' : ''}
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
