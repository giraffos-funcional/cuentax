/**
 * CUENTAX — Lista de Empleados
 * Employee directory with search, department filter, and pagination.
 */

'use client'

import { useState } from 'react'
import { Search, Users, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEmployees, useDepartments } from '@/hooks/use-remuneraciones'

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando empleados...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando empleados'}</span>
    </div>
  )
}

function EmptyState({ search, departmentId }: { search: string; departmentId: string }) {
  const hasFilter = search || departmentId
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Users size={32} className="text-[var(--cx-text-muted)]" />
      <p className="text-sm font-medium text-[var(--cx-text-secondary)]">
        {hasFilter ? 'No se encontraron empleados con ese criterio' : 'No hay empleados registrados'}
      </p>
      {hasFilter && (
        <p className="text-xs text-[var(--cx-text-muted)]">Prueba con otra búsqueda o cambia el filtro de departamento</p>
      )}
    </div>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border border-[var(--cx-status-ok-border)]">
      Activo
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--cx-bg-elevated)] text-[var(--cx-text-secondary)] border border-[var(--cx-border-light)]">
      Inactivo
    </span>
  )
}

// -- Page --
export default function EmpleadosPage() {
  const [search, setSearch] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [page, setPage] = useState(1)

  const { empleados, total, isLoading, error } = useEmployees(search, departmentId ? Number(departmentId) : undefined, page)
  const { departamentos } = useDepartments()

  const pageSize = 20
  const totalPages = Math.max(1, Math.ceil((total ?? 0) / pageSize))

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Empleados</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">Directorio del personal de la empresa</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" />
          <input
            type="text"
            placeholder="Buscar por nombre, cargo o email..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="input-field pl-9 py-2 text-sm w-full"
          />
        </div>
        <select
          value={departmentId}
          onChange={e => { setDepartmentId(e.target.value); setPage(1) }}
          className="input-field py-2 text-sm w-auto"
        >
          <option value="">Todos los departamentos</option>
          {(departamentos ?? []).map((d: any) => (
            <option key={d.id} value={d.id}>{d.name}</option>
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
            <div className="col-span-3">Nombre</div>
            <div className="col-span-2">Cargo</div>
            <div className="col-span-2">Departamento</div>
            <div className="col-span-2">Email</div>
            <div className="col-span-2">Teléfono</div>
            <div className="col-span-1 text-center">Estado</div>
          </div>

          {(empleados ?? []).length === 0 ? (
            <EmptyState search={search} departmentId={departmentId} />
          ) : (
            <div className="divide-y divide-[var(--cx-border-light)]">
              {(empleados ?? []).map((emp: any) => (
                <div
                  key={emp.id}
                  className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors"
                >
                  <div className="col-span-3 font-medium text-[var(--cx-text-primary)] truncate">{emp.name}</div>
                  <div className="col-span-2 text-[var(--cx-text-secondary)] truncate">{emp.job_title ?? '-'}</div>
                  <div className="col-span-2 text-[var(--cx-text-secondary)] truncate">{emp.department ?? '-'}</div>
                  <div className="col-span-2 text-[var(--cx-text-secondary)] truncate">{emp.email ?? '-'}</div>
                  <div className="col-span-2 text-[var(--cx-text-secondary)] truncate">{emp.phone ?? '-'}</div>
                  <div className="col-span-1 flex justify-center">
                    <StatusBadge active={emp.active !== false} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination footer */}
          {(empleados ?? []).length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)]">
              <span className="text-xs text-[var(--cx-text-muted)]">
                {total ?? 0} empleado{(total ?? 0) !== 1 ? 's' : ''} encontrado{(total ?? 0) !== 1 ? 's' : ''}
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
