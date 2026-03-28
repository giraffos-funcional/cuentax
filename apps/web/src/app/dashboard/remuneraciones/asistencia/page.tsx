/**
 * CUENTAX — Asistencia
 * Attendance records with check-in/out times, worked hours summary, and CRUD.
 */

'use client'

import { useState } from 'react'
import { Clock, Loader2, AlertCircle, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X } from 'lucide-react'
import {
  useAttendance,
  useEmployees,
  useCreateAttendance,
  useUpdateAttendance,
  useDeleteAttendance,
} from '@/hooks/use-remuneraciones'

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

// ── Types ──────────────────────────────────────────────────────
interface AttendanceFormData {
  employee_id: string
  check_in: string
  check_out: string
}

const EMPTY_FORM: AttendanceFormData = {
  employee_id: '',
  check_in: '',
  check_out: '',
}

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

// ── Attendance Form Modal ─────────────────────────────────────
function AttendanceModal({
  title,
  initial,
  isSaving,
  empleados,
  onSave,
  onClose,
}: {
  title: string
  initial: AttendanceFormData
  isSaving: boolean
  empleados: any[]
  onSave: (data: AttendanceFormData) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<AttendanceFormData>(initial)

  const set = (field: keyof AttendanceFormData, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async () => {
    if (!form.employee_id || !form.check_in) return
    await onSave(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="card p-6 w-full max-w-lg mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-[var(--cx-text-primary)]">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Empleado *</label>
            <select value={form.employee_id} onChange={e => set('employee_id', e.target.value)} className="input-field text-sm w-full">
              <option value="">Seleccionar empleado...</option>
              {(empleados ?? []).map((e: any) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Entrada *</label>
              <input type="datetime-local" value={form.check_in} onChange={e => set('check_in', e.target.value)} className="input-field text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Salida</label>
              <input type="datetime-local" value={form.check_out} onChange={e => set('check_out', e.target.value)} className="input-field text-sm w-full" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={handleSubmit} disabled={isSaving || !form.employee_id || !form.check_in} className="btn-primary flex-1 justify-center">
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
  isLoading: busy,
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
          <button onClick={onConfirm} disabled={busy} className="btn-danger flex-1 justify-center">
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {confirmLabel}
          </button>
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// -- Page --
export default function AsistenciaPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [page, setPage] = useState(1)

  // Modal state
  const [showCreate, setShowCreate] = useState(false)
  const [editingRecord, setEditingRecord] = useState<any>(null)
  const [deletingRecord, setDeletingRecord] = useState<any>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const employeeId = selectedEmployee ? Number(selectedEmployee) : undefined
  const { registros, total, isLoading, error } = useAttendance(employeeId, month, year)
  const { empleados } = useEmployees()
  const { crear, isLoading: isCreating } = useCreateAttendance()
  const { update } = useUpdateAttendance()
  const { remove } = useDeleteAttendance()

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)
  const pageSize = 20
  const totalPages = Math.max(1, Math.ceil((total ?? 0) / pageSize))
  const hasFilter = Boolean(selectedEmployee)

  const handleCreate = async (data: AttendanceFormData) => {
    await crear(data)
    setShowCreate(false)
  }

  const handleEdit = async (data: AttendanceFormData) => {
    if (!editingRecord) return
    setIsEditing(true)
    try {
      await update(editingRecord.id, data)
      setEditingRecord(null)
    } finally { setIsEditing(false) }
  }

  const handleDelete = async () => {
    if (!deletingRecord) return
    setIsDeleting(true)
    try {
      await remove(deletingRecord.id)
      setDeletingRecord(null)
    } finally { setIsDeleting(false) }
  }

  // Convert ISO datetime to datetime-local format for input
  const toLocalDatetime = (d: string) => {
    if (!d) return ''
    try {
      const date = new Date(d)
      return date.toISOString().slice(0, 16)
    } catch { return '' }
  }

  const editInitial: AttendanceFormData = editingRecord ? {
    employee_id: Array.isArray(editingRecord.employee_id) ? String(editingRecord.employee_id[0]) : String(editingRecord.employee_id ?? ''),
    check_in: toLocalDatetime(editingRecord.check_in),
    check_out: toLocalDatetime(editingRecord.check_out),
  } : EMPTY_FORM

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Asistencia</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">Registros de entrada y salida del personal</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={14} /> Registrar Asistencia
        </button>
      </div>

      {/* Employee summary built from registros */}
      {(() => {
        const summaryMap = new Map<string, { total_hours: number; records: number }>()
        for (const r of registros ?? []) {
          const existing = summaryMap.get(r.employee_name) ?? { total_hours: 0, records: 0 }
          existing.total_hours += r.worked_hours ?? 0
          existing.records += 1
          summaryMap.set(r.employee_name, existing)
        }
        const employeeSummary = Array.from(summaryMap.entries()).map(([name, data]) => ({ employee_name: name, ...data }))
        if (employeeSummary.length === 0) return null
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {employeeSummary.map((s) => (
              <div key={s.employee_name} className="card border border-[var(--cx-border-light)] rounded-2xl p-4 text-center">
                <p className="text-xs text-[var(--cx-text-muted)] uppercase tracking-widest font-semibold truncate">{s.employee_name}</p>
                <p className="text-xl font-bold text-[var(--cx-text-primary)] mt-1">{formatHours(s.total_hours)}</p>
                <p className="text-[10px] text-[var(--cx-text-muted)]">{s.records} registro{s.records !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={selectedEmployee}
          onChange={e => { setSelectedEmployee(e.target.value); setPage(1) }}
          className="input-field py-2 text-sm flex-1"
        >
          <option value="">Todos los empleados</option>
          {(empleados ?? []).map((e: any) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <select value={month} onChange={e => { setMonth(Number(e.target.value)); setPage(1) }} className="input-field py-2 text-sm w-auto">
          {MONTHS.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>
        <select value={year} onChange={e => { setYear(Number(e.target.value)); setPage(1) }} className="input-field py-2 text-sm w-auto">
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
          <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-[var(--cx-border-light)] text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest bg-[var(--cx-bg-elevated)]">
            <div className="col-span-3">Empleado</div>
            <div className="col-span-3">Entrada</div>
            <div className="col-span-2">Salida</div>
            <div className="col-span-2 text-right">Horas</div>
            <div className="col-span-2 text-center">Acciones</div>
          </div>

          {(registros ?? []).length === 0 ? (
            <EmptyState hasFilter={hasFilter} />
          ) : (
            <div className="divide-y divide-[var(--cx-border-light)]">
              {(registros ?? []).map((record: any) => (
                <div
                  key={record.id}
                  className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors group"
                >
                  <div className="col-span-3 font-medium text-[var(--cx-text-primary)] truncate">{record.employee_name}</div>
                  <div className="col-span-3 text-[var(--cx-text-secondary)]">{formatDateTime(record.check_in)}</div>
                  <div className="col-span-2 text-[var(--cx-text-secondary)]">
                    {record.check_out ? formatDateTime(record.check_out) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--cx-status-warn-bg)] text-[var(--cx-status-warn-text)] border border-[var(--cx-status-warn-border)]">
                        En curso
                      </span>
                    )}
                  </div>
                  <div className="col-span-2 text-right font-mono text-[var(--cx-text-primary)]">
                    {record.worked_hours != null ? formatHours(record.worked_hours) : '-'}
                  </div>
                  <div className="col-span-2 flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditingRecord(record)}
                      className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors"
                      title="Editar"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => setDeletingRecord(record)}
                      className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-status-error-text)] hover:bg-[var(--cx-status-error-bg)] transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(registros ?? []).length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)]">
              <span className="text-xs text-[var(--cx-text-muted)]">
                {total ?? 0} registro{(total ?? 0) !== 1 ? 's' : ''} encontrado{(total ?? 0) !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn-secondary p-1.5 disabled:opacity-40">
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-[var(--cx-text-secondary)]">Página {page} de {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="btn-secondary p-1.5 disabled:opacity-40">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <AttendanceModal
          title="Registrar Asistencia"
          initial={EMPTY_FORM}
          isSaving={isCreating}
          empleados={empleados ?? []}
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Edit Modal */}
      {editingRecord && (
        <AttendanceModal
          title="Editar Registro"
          initial={editInitial}
          isSaving={isEditing}
          empleados={empleados ?? []}
          onSave={handleEdit}
          onClose={() => setEditingRecord(null)}
        />
      )}

      {/* Delete Confirm */}
      {deletingRecord && (
        <ConfirmDialog
          title="Eliminar registro"
          message={`¿Eliminar el registro de asistencia de ${deletingRecord.employee_name}?`}
          confirmLabel="Eliminar"
          isLoading={isDeleting}
          onConfirm={handleDelete}
          onClose={() => setDeletingRecord(null)}
        />
      )}
    </div>
  )
}
