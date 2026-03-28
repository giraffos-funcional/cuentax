/**
 * CUENTAX — Ausencias y Vacaciones
 * Leave requests with type summaries, filters, state badges, and CRUD actions.
 */

'use client'

import { useState } from 'react'
import { CalendarOff, Loader2, AlertCircle, ChevronLeft, ChevronRight, Plus, Check, X as XIcon, X } from 'lucide-react'
import {
  useLeaves,
  useLeaveTypes,
  useEmployees,
  useCreateLeave,
  useApproveLeave,
  useRefuseLeave,
  useCancelLeave,
} from '@/hooks/use-remuneraciones'

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

// ── Types ──────────────────────────────────────────────────────
interface LeaveFormData {
  employee_id: string
  holiday_status_id: string
  date_from: string
  date_to: string
  name: string
}

const EMPTY_FORM: LeaveFormData = {
  employee_id: '',
  holiday_status_id: '',
  date_from: '',
  date_to: '',
  name: '',
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

// ── Leave Form Modal ──────────────────────────────────────────
function LeaveModal({
  title,
  initial,
  isSaving,
  empleados,
  tipos,
  onSave,
  onClose,
}: {
  title: string
  initial: LeaveFormData
  isSaving: boolean
  empleados: any[]
  tipos: any[]
  onSave: (data: LeaveFormData) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<LeaveFormData>(initial)

  const set = (field: keyof LeaveFormData, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async () => {
    if (!form.employee_id || !form.holiday_status_id || !form.date_from || !form.date_to) return
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Empleado *</label>
              <select value={form.employee_id} onChange={e => set('employee_id', e.target.value)} className="input-field text-sm w-full">
                <option value="">Seleccionar...</option>
                {(empleados ?? []).map((e: any) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Tipo Ausencia *</label>
              <select value={form.holiday_status_id} onChange={e => set('holiday_status_id', e.target.value)} className="input-field text-sm w-full">
                <option value="">Seleccionar...</option>
                {(tipos ?? []).map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Fecha Desde *</label>
              <input type="date" value={form.date_from} onChange={e => set('date_from', e.target.value)} className="input-field text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Fecha Hasta *</label>
              <input type="date" value={form.date_to} onChange={e => set('date_to', e.target.value)} className="input-field text-sm w-full" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Descripción / Motivo</label>
            <textarea value={form.name} onChange={e => set('name', e.target.value)} placeholder="Motivo de la ausencia..." rows={2} className="input-field text-sm w-full resize-none" />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={handleSubmit} disabled={isSaving || !form.employee_id || !form.holiday_status_id || !form.date_from || !form.date_to} className="btn-primary flex-1 justify-center">
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : null}
            Guardar
          </button>
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// -- Page --
export default function AusenciasPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [leaveTypeId, setLeaveTypeId] = useState('')
  const [state, setState] = useState('')
  const [page, setPage] = useState(1)

  // Modal state
  const [showCreate, setShowCreate] = useState(false)
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  const employeeId = selectedEmployee ? Number(selectedEmployee) : undefined
  const { ausencias, total, isLoading, error } = useLeaves({
    employee_id: employeeId,
    holiday_status_id: leaveTypeId ? Number(leaveTypeId) : undefined,
    state: state || undefined,
    mes: month,
    year,
    page,
  })
  const { tipos } = useLeaveTypes()
  const { empleados } = useEmployees()
  const { crear, isLoading: isCreating } = useCreateLeave()
  const { approve } = useApproveLeave()
  const { refuse } = useRefuseLeave()
  const { cancel } = useCancelLeave()

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)
  const pageSize = 20
  const totalPages = Math.max(1, Math.ceil((total ?? 0) / pageSize))
  const hasFilter = Boolean(selectedEmployee) || Boolean(leaveTypeId) || Boolean(state)

  const handleCreate = async (data: LeaveFormData) => {
    await crear(data)
    setShowCreate(false)
  }

  const handleAction = async (id: number, action: 'approve' | 'refuse' | 'cancel') => {
    setActionLoading(id)
    try {
      if (action === 'approve') await approve(id)
      else if (action === 'refuse') await refuse(id)
      else await cancel(id)
    } finally { setActionLoading(null) }
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Ausencias y Vacaciones</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">Solicitudes de ausencia, permisos y vacaciones</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={14} /> Solicitar Ausencia
        </button>
      </div>

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
        <select value={leaveTypeId} onChange={e => { setLeaveTypeId(e.target.value); setPage(1) }} className="input-field py-2 text-sm w-auto">
          <option value="">Todos los tipos</option>
          {(tipos ?? []).map((lt: any) => (
            <option key={lt.id} value={lt.id}>{lt.name}</option>
          ))}
        </select>
        <select value={state} onChange={e => { setState(e.target.value); setPage(1) }} className="input-field py-2 text-sm w-auto">
          <option value="">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="confirm">Confirmada</option>
          <option value="validate">Aprobada</option>
          <option value="refuse">Rechazada</option>
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
            <div className="col-span-2">Empleado</div>
            <div className="col-span-2">Tipo Ausencia</div>
            <div className="col-span-2">Desde</div>
            <div className="col-span-2">Hasta</div>
            <div className="col-span-1 text-right">Días</div>
            <div className="col-span-1 text-center">Estado</div>
            <div className="col-span-2 text-center">Acciones</div>
          </div>

          {(ausencias ?? []).length === 0 ? (
            <EmptyState hasFilter={hasFilter} />
          ) : (
            <div className="divide-y divide-[var(--cx-border-light)]">
              {(ausencias ?? []).map((leave: any) => (
                <div
                  key={leave.id}
                  className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors group"
                >
                  <div className="col-span-2 font-medium text-[var(--cx-text-primary)] truncate">{leave.employee_name}</div>
                  <div className="col-span-2 text-[var(--cx-text-secondary)] truncate">{leave.leave_type ?? '-'}</div>
                  <div className="col-span-2 text-[var(--cx-text-secondary)]">{formatDate(leave.date_from)}</div>
                  <div className="col-span-2 text-[var(--cx-text-secondary)]">{formatDate(leave.date_to)}</div>
                  <div className="col-span-1 text-right font-mono text-[var(--cx-text-primary)]">{leave.number_of_days ?? 0}</div>
                  <div className="col-span-1 flex justify-center">
                    <StateBadge state={leave.state ?? 'draft'} />
                  </div>
                  <div className="col-span-2 flex justify-center gap-1">
                    {(leave.state === 'confirm' || leave.state === 'draft') && (
                      <>
                        <button
                          onClick={() => handleAction(leave.id, 'approve')}
                          disabled={actionLoading === leave.id}
                          className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-status-ok-text)] hover:bg-[var(--cx-status-ok-bg)] transition-colors"
                          title="Aprobar"
                        >
                          {actionLoading === leave.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        </button>
                        <button
                          onClick={() => handleAction(leave.id, 'refuse')}
                          disabled={actionLoading === leave.id}
                          className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-status-error-text)] hover:bg-[var(--cx-status-error-bg)] transition-colors"
                          title="Rechazar"
                        >
                          <XIcon size={12} />
                        </button>
                      </>
                    )}
                    {(leave.state === 'draft' || leave.state === 'confirm') && (
                      <button
                        onClick={() => handleAction(leave.id, 'cancel')}
                        disabled={actionLoading === leave.id}
                        className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-status-warn-text)] hover:bg-[var(--cx-status-warn-bg)] transition-colors"
                        title="Cancelar"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {(ausencias ?? []).length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)]">
              <span className="text-xs text-[var(--cx-text-muted)]">
                {total ?? 0} ausencia{(total ?? 0) !== 1 ? 's' : ''} encontrada{(total ?? 0) !== 1 ? 's' : ''}
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
        <LeaveModal
          title="Solicitar Ausencia"
          initial={EMPTY_FORM}
          isSaving={isCreating}
          empleados={empleados ?? []}
          tipos={tipos ?? []}
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}
