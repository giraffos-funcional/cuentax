/**
 * CUENTAX — Contratos
 * Employment contracts with employee filter, state badges, and salary display.
 */

'use client'

import { useState } from 'react'
import { Search, FileSignature, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { useContracts } from '@/hooks/use-remuneraciones'

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const formatDate = (d: string) => {
  if (!d) return '-'
  const date = new Date(d)
  return date.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const STATE_BADGES: Record<string, string> = {
  draft:  'bg-[var(--cx-bg-elevated)] text-[var(--cx-text-secondary)] border border-[var(--cx-border-light)]',
  open:   'bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border border-[var(--cx-status-ok-border)]',
  close:  'bg-[var(--cx-status-warn-bg)] text-[var(--cx-status-warn-text)] border border-[var(--cx-status-warn-border)]',
  cancel: 'bg-[var(--cx-status-error-bg)] text-[var(--cx-status-error-text)] border border-[var(--cx-status-error-border)]',
}

const STATE_LABELS: Record<string, string> = {
  draft:  'Borrador',
  open:   'Vigente',
  close:  'Finalizado',
  cancel: 'Cancelado',
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
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando contratos...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando contratos'}</span>
    </div>
  )
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <FileSignature size={32} className="text-[var(--cx-text-muted)]" />
      <p className="text-sm font-medium text-[var(--cx-text-secondary)]">
        {hasFilter ? 'No se encontraron contratos con ese criterio' : 'No hay contratos registrados'}
      </p>
      {hasFilter && (
        <p className="text-xs text-[var(--cx-text-muted)]">Prueba con otro empleado o estado</p>
      )}
    </div>
  )
}

// -- Page --
export default function ContratosPage() {
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [state, setState] = useState('')
  const [page, setPage] = useState(1)

  const { contracts, total, isLoading, error } = useContracts(employeeSearch, state)

  const pageSize = 20
  const totalPages = Math.max(1, Math.ceil((total ?? 0) / pageSize))
  const hasFilter = Boolean(employeeSearch) || Boolean(state)

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Contratos</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">Contratos laborales y condiciones de empleo</p>
        </div>
      </div>

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
          value={state}
          onChange={e => { setState(e.target.value); setPage(1) }}
          className="input-field py-2 text-sm w-auto"
        >
          <option value="">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="open">Vigente</option>
          <option value="close">Finalizado</option>
          <option value="cancel">Cancelado</option>
        </select>
      </div>

      {/* Table */}
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error?.message} />}

      {!isLoading && !error && (
        <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-[var(--cx-border-light)] text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest bg-[var(--cx-bg-elevated)]">
            <div className="col-span-2">Empleado</div>
            <div className="col-span-2">Referencia</div>
            <div className="col-span-1">Departamento</div>
            <div className="col-span-1">Cargo</div>
            <div className="col-span-2 text-right">Sueldo</div>
            <div className="col-span-1">Fecha Inicio</div>
            <div className="col-span-1">Fecha Fin</div>
            <div className="col-span-2 text-center">Estado</div>
          </div>

          {(contracts ?? []).length === 0 ? (
            <EmptyState hasFilter={hasFilter} />
          ) : (
            <div className="divide-y divide-[var(--cx-border-light)]">
              {(contracts ?? []).map((contract: any) => (
                <div
                  key={contract.id}
                  className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors"
                >
                  <div className="col-span-2 font-medium text-[var(--cx-text-primary)] truncate">{contract.employee_name}</div>
                  <div className="col-span-2 font-mono text-xs text-[var(--cx-text-secondary)] truncate">{contract.name ?? '-'}</div>
                  <div className="col-span-1 text-[var(--cx-text-secondary)] truncate">{contract.department ?? '-'}</div>
                  <div className="col-span-1 text-[var(--cx-text-secondary)] truncate">{contract.job_title ?? '-'}</div>
                  <div className="col-span-2 text-right font-mono text-[var(--cx-text-primary)]">{formatCLP(contract.wage ?? 0)}</div>
                  <div className="col-span-1 text-[var(--cx-text-secondary)] text-xs">{formatDate(contract.date_start)}</div>
                  <div className="col-span-1 text-[var(--cx-text-secondary)] text-xs">{formatDate(contract.date_end)}</div>
                  <div className="col-span-2 flex justify-center">
                    <StateBadge state={contract.state ?? 'draft'} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination footer */}
          {(contracts ?? []).length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)]">
              <span className="text-xs text-[var(--cx-text-muted)]">
                {total ?? 0} contrato{(total ?? 0) !== 1 ? 's' : ''} encontrado{(total ?? 0) !== 1 ? 's' : ''}
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
