/**
 * CUENTAX — Asistencia
 * Attendance records with check-in/out times and worked hours summary.
 */

'use client'

import { useState } from 'react'
import { Search, Clock, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAttendance } from '@/hooks/use-remuneraciones'

const formatDateTime = (d: string) => {
  if (!d) return '-'
  const date = new Date(d)
  return date.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' +
    date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

const formatHours = (h: number) => {
  if (h == null) return '-'
  const hours = Math.floor(h)
  const minutes = Math.round((h - hours) * 60)
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando asistencia...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando asistencia'}</span>
    </div>
  )
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Clock size={32} className="text-[var(--cx-text-muted)]" />
      <p className="text-sm font-medium text-[var(--cx-text-secondary)]">
        {hasFilter ? 'No se encontraron registros de asistencia con ese criterio' : 'No hay registros de asistencia'}
      </p>
      {hasFilter && (
        <p className="text-xs text-[var(--cx-text-muted)]">Prueba con otro período o empleado</p>
      )}
    </div>
  )
}

// -- Page --
export default function AsistenciaPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [page, setPage] = useState(1)

  const { attendance, total, employeeSummary, isLoading, error } = useAttendance(employeeSearch, month, year)

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)
  const pageSize = 20
  const totalPages = Math.max(1, Math.ceil((total ?? 0) / pageSize))
  const hasFilter = Boolean(employeeSearch)

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Asistencia</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">Registros de entrada y salida del personal</p>
        </div>
      </div>

      {/* Summary cards */}
      {employeeSummary && employeeSummary.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {employeeSummary.map((s: any) => (
            <div key={s.employee_name} className="card border border-[var(--cx-border-light)] rounded-2xl p-4 text-center">
              <p className="text-xs text-[var(--cx-text-muted)] uppercase tracking-widest font-semibold truncate">{s.employee_name}</p>
              <p className="text-xl font-bold text-[var(--cx-text-primary)] mt-1">{formatHours(s.total_hours)}</p>
              <p className="text-[10px] text-[var(--cx-text-muted)]">{s.records} registro{s.records !== 1 ? 's' : ''}</p>
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
            <div className="col-span-3">Entrada</div>
            <div className="col-span-3">Salida</div>
            <div className="col-span-3 text-right">Horas Trabajadas</div>
          </div>

          {(attendance ?? []).length === 0 ? (
            <EmptyState hasFilter={hasFilter} />
          ) : (
            <div className="divide-y divide-[var(--cx-border-light)]">
              {(attendance ?? []).map((record: any) => (
                <div
                  key={record.id}
                  className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors"
                >
                  <div className="col-span-3 font-medium text-[var(--cx-text-primary)] truncate">{record.employee_name}</div>
                  <div className="col-span-3 text-[var(--cx-text-secondary)]">{formatDateTime(record.check_in)}</div>
                  <div className="col-span-3 text-[var(--cx-text-secondary)]">
                    {record.check_out ? formatDateTime(record.check_out) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--cx-status-warn-bg)] text-[var(--cx-status-warn-text)] border border-[var(--cx-status-warn-border)]">
                        En curso
                      </span>
                    )}
                  </div>
                  <div className="col-span-3 text-right font-mono text-[var(--cx-text-primary)]">
                    {record.worked_hours != null ? formatHours(record.worked_hours) : '-'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination footer */}
          {(attendance ?? []).length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)]">
              <span className="text-xs text-[var(--cx-text-muted)]">
                {total ?? 0} registro{(total ?? 0) !== 1 ? 's' : ''} encontrado{(total ?? 0) !== 1 ? 's' : ''}
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
