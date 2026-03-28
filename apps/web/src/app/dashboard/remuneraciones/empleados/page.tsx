/**
 * CUENTAX — Lista de Empleados
 * Employee directory with search, department filter, pagination, and CRUD.
 */

'use client'

import { useState } from 'react'
import { Search, Users, Loader2, AlertCircle, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X } from 'lucide-react'
import {
  useEmployees,
  useDepartments,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
} from '@/hooks/use-remuneraciones'

// ── Types ──────────────────────────────────────────────────────
interface EmployeeFormData {
  name: string
  job_title: string
  department_id: string
  work_email: string
  work_phone: string
  identification_id: string
  afp: string
  plan_salud: string
  isapre: string
  cotizacion_isapre_uf: string
  cargas_familiares: string
}

const EMPTY_FORM: EmployeeFormData = {
  name: '',
  job_title: '',
  department_id: '',
  work_email: '',
  work_phone: '',
  identification_id: '',
  afp: '',
  plan_salud: 'fonasa',
  isapre: '',
  cotizacion_isapre_uf: '',
  cargas_familiares: '0',
}

// AFP IDs from Odoo l10n_cl.afp model (standard Chilean data)
const AFP_OPTIONS = [
  { id: 1, name: 'Capital' },
  { id: 2, name: 'Cuprum' },
  { id: 3, name: 'Habitat' },
  { id: 4, name: 'Modelo' },
  { id: 5, name: 'PlanVital' },
  { id: 6, name: 'ProVida' },
  { id: 7, name: 'Uno' },
]
// Isapre IDs from Odoo l10n_cl.isapre model (standard Chilean data)
const ISAPRE_OPTIONS = [
  { id: 1, name: 'Banmedica' },
  { id: 2, name: 'Colmena' },
  { id: 3, name: 'Cruz Blanca' },
  { id: 4, name: 'Vida Tres' },
  { id: 5, name: 'Nueva Masvida' },
  { id: 6, name: 'Esencial' },
]

// ── Sub-components ────────────────────────────────────────────
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

// ── Employee Form Modal ───────────────────────────────────────
function EmployeeModal({
  title,
  initial,
  isSaving,
  departamentos,
  onSave,
  onClose,
}: {
  title: string
  initial: EmployeeFormData
  isSaving: boolean
  departamentos: any[]
  onSave: (data: EmployeeFormData) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<EmployeeFormData>(initial)

  const set = (field: keyof EmployeeFormData, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async () => {
    if (!form.name.trim()) return
    await onSave(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="card p-6 w-full max-w-lg mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-[var(--cx-text-primary)]">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Nombre *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Juan Pérez" className="input-field text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">RUT</label>
              <input value={form.identification_id} onChange={e => set('identification_id', e.target.value)} placeholder="12.345.678-9" className="input-field text-sm w-full" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Cargo</label>
              <input value={form.job_title} onChange={e => set('job_title', e.target.value)} placeholder="Desarrollador" className="input-field text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Departamento</label>
              <select value={form.department_id} onChange={e => set('department_id', e.target.value)} className="input-field text-sm w-full">
                <option value="">Seleccionar...</option>
                {(departamentos ?? []).map((d: any) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Email</label>
              <input type="email" value={form.work_email} onChange={e => set('work_email', e.target.value)} placeholder="correo@empresa.cl" className="input-field text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Teléfono</label>
              <input value={form.work_phone} onChange={e => set('work_phone', e.target.value)} placeholder="+56 9 1234 5678" className="input-field text-sm w-full" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">AFP</label>
              <select value={form.afp} onChange={e => set('afp', e.target.value)} className="input-field text-sm w-full">
                <option value="">Seleccionar...</option>
                {AFP_OPTIONS.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Plan de Salud</label>
              <select value={form.plan_salud} onChange={e => set('plan_salud', e.target.value)} className="input-field text-sm w-full">
                <option value="fonasa">Fonasa</option>
                <option value="isapre">Isapre</option>
              </select>
            </div>
          </div>

          {form.plan_salud === 'isapre' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Isapre</label>
                <select value={form.isapre} onChange={e => set('isapre', e.target.value)} className="input-field text-sm w-full">
                  <option value="">Seleccionar...</option>
                  {ISAPRE_OPTIONS.map(i => <option key={i.id} value={String(i.id)}>{i.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Cotización UF</label>
                <input type="number" step="0.01" value={form.cotizacion_isapre_uf} onChange={e => set('cotizacion_isapre_uf', e.target.value)} placeholder="4.2" className="input-field text-sm w-full" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Cargas Familiares</label>
            <input type="number" min="0" value={form.cargas_familiares} onChange={e => set('cargas_familiares', e.target.value)} className="input-field text-sm w-full" />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={handleSubmit} disabled={isSaving || !form.name.trim()} className="btn-primary flex-1 justify-center">
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : null}
            Guardar
          </button>
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ── Confirm Dialog ────────────────────────────────────────────
function ConfirmDialog({
  title,
  message,
  confirmLabel,
  isLoading,
  onConfirm,
  onClose,
}: {
  title: string
  message: string
  confirmLabel: string
  isLoading: boolean
  onConfirm: () => Promise<void>
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="card p-6 w-full max-w-sm mx-4 shadow-xl">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)] flex items-center justify-center flex-shrink-0">
            <Trash2 size={15} className="text-[var(--cx-status-error-text)]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[var(--cx-text-primary)]">{title}</h2>
            <p className="text-xs text-[var(--cx-text-secondary)] mt-0.5">{message}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onConfirm} disabled={isLoading} className="btn-danger flex-1 justify-center">
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : null}
            {confirmLabel}
          </button>
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// -- Page --
export default function EmpleadosPage() {
  const [search, setSearch] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [page, setPage] = useState(1)

  // Modal state
  const [showCreate, setShowCreate] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<any>(null)
  const [deletingEmployee, setDeletingEmployee] = useState<any>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Data hooks
  const { empleados, total, isLoading, error } = useEmployees(search, departmentId ? Number(departmentId) : undefined, page)
  const { departamentos } = useDepartments()
  const { crear, isLoading: isCreating } = useCreateEmployee()
  const { update } = useUpdateEmployee()
  const { remove } = useDeleteEmployee()

  const pageSize = 20
  const totalPages = Math.max(1, Math.ceil((total ?? 0) / pageSize))

  // Handlers
  const handleCreate = async (data: EmployeeFormData) => {
    await crear(data)
    setShowCreate(false)
  }

  const handleEdit = async (data: EmployeeFormData) => {
    if (!editingEmployee) return
    setIsEditing(true)
    try {
      await update(editingEmployee.id, data)
      setEditingEmployee(null)
    } finally { setIsEditing(false) }
  }

  const handleDelete = async () => {
    if (!deletingEmployee) return
    setIsDeleting(true)
    try {
      await remove(deletingEmployee.id)
      setDeletingEmployee(null)
    } finally { setIsDeleting(false) }
  }

  const editInitial: EmployeeFormData = editingEmployee ? {
    name: editingEmployee.name ?? '',
    job_title: editingEmployee.job_title ?? '',
    department_id: editingEmployee.department_id ? String(editingEmployee.department_id) : '',
    work_email: editingEmployee.work_email ?? '',
    work_phone: editingEmployee.work_phone ?? '',
    identification_id: editingEmployee.identification_id ?? '',
    afp: editingEmployee.l10n_cl_afp_id ? String(Array.isArray(editingEmployee.l10n_cl_afp_id) ? editingEmployee.l10n_cl_afp_id[0] : editingEmployee.l10n_cl_afp_id) : '',
    plan_salud: editingEmployee.l10n_cl_health_plan ?? editingEmployee.plan_salud ?? 'fonasa',
    isapre: editingEmployee.l10n_cl_isapre_id ? String(Array.isArray(editingEmployee.l10n_cl_isapre_id) ? editingEmployee.l10n_cl_isapre_id[0] : editingEmployee.l10n_cl_isapre_id) : '',
    cotizacion_isapre_uf: editingEmployee.l10n_cl_isapre_cotizacion_uf ? String(editingEmployee.l10n_cl_isapre_cotizacion_uf) : (editingEmployee.cotizacion_isapre_uf ? String(editingEmployee.cotizacion_isapre_uf) : ''),
    cargas_familiares: editingEmployee.l10n_cl_cargas_familiares ? String(editingEmployee.l10n_cl_cargas_familiares) : (editingEmployee.cargas_familiares ? String(editingEmployee.cargas_familiares) : '0'),
  } : EMPTY_FORM

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Empleados</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">Directorio del personal de la empresa</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={14} /> Nuevo Empleado
        </button>
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
            <div className="col-span-1">Teléfono</div>
            <div className="col-span-1 text-center">Estado</div>
            <div className="col-span-1 text-center">Acciones</div>
          </div>

          {(empleados ?? []).length === 0 ? (
            <EmptyState search={search} departmentId={departmentId} />
          ) : (
            <div className="divide-y divide-[var(--cx-border-light)]">
              {(empleados ?? []).map((emp: any) => (
                <div
                  key={emp.id}
                  className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors group"
                >
                  <div className="col-span-3 font-medium text-[var(--cx-text-primary)] truncate">{emp.name}</div>
                  <div className="col-span-2 text-[var(--cx-text-secondary)] truncate">{emp.job_title ?? '-'}</div>
                  <div className="col-span-2 text-[var(--cx-text-secondary)] truncate">{emp.department_name ?? '-'}</div>
                  <div className="col-span-2 text-[var(--cx-text-secondary)] truncate">{emp.work_email ?? '-'}</div>
                  <div className="col-span-1 text-[var(--cx-text-secondary)] truncate">{emp.work_phone ?? '-'}</div>
                  <div className="col-span-1 flex justify-center">
                    <StatusBadge active={emp.active !== false} />
                  </div>
                  <div className="col-span-1 flex justify-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditingEmployee(emp)}
                      className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors"
                      title="Editar"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => setDeletingEmployee(emp)}
                      className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-status-error-text)] hover:bg-[var(--cx-status-error-bg)] transition-colors"
                      title="Desactivar"
                    >
                      <Trash2 size={12} />
                    </button>
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

      {/* Create Modal */}
      {showCreate && (
        <EmployeeModal
          title="Nuevo Empleado"
          initial={EMPTY_FORM}
          isSaving={isCreating}
          departamentos={departamentos ?? []}
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Edit Modal */}
      {editingEmployee && (
        <EmployeeModal
          title="Editar Empleado"
          initial={editInitial}
          isSaving={isEditing}
          departamentos={departamentos ?? []}
          onSave={handleEdit}
          onClose={() => setEditingEmployee(null)}
        />
      )}

      {/* Delete Confirm */}
      {deletingEmployee && (
        <ConfirmDialog
          title="Desactivar empleado"
          message={`¿Desactivar a ${deletingEmployee.name}? Podrá reactivarse después.`}
          confirmLabel="Desactivar"
          isLoading={isDeleting}
          onConfirm={handleDelete}
          onClose={() => setDeletingEmployee(null)}
        />
      )}
    </div>
  )
}
