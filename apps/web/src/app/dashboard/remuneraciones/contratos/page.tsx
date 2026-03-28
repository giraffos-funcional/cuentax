/**
 * CUENTAX — Contratos
 * Employment contracts with employee filter, state badges, salary display, and CRUD.
 */

'use client'

import { useState } from 'react'
import { FileSignature, Loader2, AlertCircle, ChevronLeft, ChevronRight, Plus, Pencil, Lock, X, Download } from 'lucide-react'
import {
  useContracts,
  useEmployees,
  useCreateContract,
  useUpdateContract,
  useCloseContract,
} from '@/hooks/use-remuneraciones'
import { formatCLP, formatDate } from '@/lib/formatters'

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

// ── Types ──────────────────────────────────────────────────────
interface ContractFormData {
  employee_id: string
  wage: string
  type: string
  gratification_type: string
  colacion: string
  movilizacion: string
  date_start: string
  date_end: string
  structure_type_id: string
  job_title: string
  jornada: string
  rep_legal_nombre: string
  rep_legal_rut: string
  domicilio_legal: string
}

const EMPTY_FORM: ContractFormData = {
  employee_id: '',
  wage: '',
  type: 'indefinido',
  gratification_type: 'art47',
  colacion: '',
  movilizacion: '',
  date_start: '',
  date_end: '',
  structure_type_id: '',
  job_title: '',
  jornada: 'completa',
  rep_legal_nombre: '',
  rep_legal_rut: '',
  domicilio_legal: '',
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

// ── Contract Form Modal ───────────────────────────────────────
function ContractModal({
  title,
  initial,
  isSaving,
  empleados,
  onSave,
  onClose,
}: {
  title: string
  initial: ContractFormData
  isSaving: boolean
  empleados: any[]
  onSave: (data: ContractFormData) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<ContractFormData>(initial)

  const set = (field: keyof ContractFormData, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async () => {
    if (!form.employee_id || !form.wage || !form.date_start) return
    await onSave(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="card p-6 w-full max-w-2xl mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-[var(--cx-text-primary)]">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-5">
          {/* ── Empleado ────────────────────────────────────────── */}
          <div>
            <h3 className="text-xs font-bold text-[var(--cx-text-muted)] uppercase tracking-widest mb-2">Empleado</h3>
            <select value={form.employee_id} onChange={e => set('employee_id', e.target.value)} className="input-field text-sm w-full">
              <option value="">Seleccionar empleado...</option>
              {(empleados ?? []).map((e: any) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>

          {/* ── Detalles del Contrato ───────────────────────────── */}
          <div>
            <h3 className="text-xs font-bold text-[var(--cx-text-muted)] uppercase tracking-widest mb-2">Detalles del Contrato</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Cargo *</label>
                  <input value={form.job_title} onChange={e => set('job_title', e.target.value)} placeholder="Ej: Desarrollador Senior" className="input-field text-sm w-full" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Tipo Contrato</label>
                  <select value={form.type} onChange={e => set('type', e.target.value)} className="input-field text-sm w-full">
                    <option value="indefinido">Indefinido</option>
                    <option value="plazo_fijo">Plazo Fijo</option>
                    <option value="obra_faena">Obra o Faena</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Fecha Ingreso *</label>
                  <input type="date" value={form.date_start} onChange={e => set('date_start', e.target.value)} className="input-field text-sm w-full" />
                </div>
                {(form.type === 'plazo_fijo' || form.type === 'obra_faena') && (
                  <div>
                    <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Fecha Término</label>
                    <input type="date" value={form.date_end} onChange={e => set('date_end', e.target.value)} className="input-field text-sm w-full" />
                  </div>
                )}
                {form.type === 'indefinido' && <div />}
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Jornada Laboral</label>
                <select value={form.jornada} onChange={e => set('jornada', e.target.value)} className="input-field text-sm w-full">
                  <option value="completa">Jornada Completa (45 hrs)</option>
                  <option value="art22">Art. 22 Inc. 2 (Sin limite)</option>
                  <option value="parcial">Jornada Parcial</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── Remuneraciones ──────────────────────────────────── */}
          <div>
            <h3 className="text-xs font-bold text-[var(--cx-text-muted)] uppercase tracking-widest mb-2">Remuneraciones</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Sueldo Base (CLP) *</label>
                  <input type="number" value={form.wage} onChange={e => set('wage', e.target.value)} placeholder="500000" className="input-field text-sm w-full" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Gratificacion</label>
                  <select value={form.gratification_type} onChange={e => set('gratification_type', e.target.value)} className="input-field text-sm w-full">
                    <option value="art47">Art. 47 (mensual)</option>
                    <option value="art50">Art. 50 (anual)</option>
                    <option value="none">Sin gratificacion</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Colacion</label>
                  <input type="number" value={form.colacion} onChange={e => set('colacion', e.target.value)} placeholder="0" className="input-field text-sm w-full" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Movilizacion</label>
                  <input type="number" value={form.movilizacion} onChange={e => set('movilizacion', e.target.value)} placeholder="0" className="input-field text-sm w-full" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Estructura Salarial</label>
                <input value={form.structure_type_id} onChange={e => set('structure_type_id', e.target.value)} placeholder="ID estructura" className="input-field text-sm w-full" />
              </div>
            </div>
          </div>

          {/* ── Prevision (read-only from employee) ─────────────── */}
          {form.employee_id && (
            <div>
              <h3 className="text-xs font-bold text-[var(--cx-text-muted)] uppercase tracking-widest mb-2">Prevision</h3>
              <p className="text-xs text-[var(--cx-text-muted)] italic">AFP y sistema de salud se obtienen de la ficha del empleado seleccionado.</p>
            </div>
          )}

          {/* ── Datos Empresa / Representante Legal ─────────────── */}
          <div>
            <h3 className="text-xs font-bold text-[var(--cx-text-muted)] uppercase tracking-widest mb-2">Representante Legal</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Nombre Rep. Legal</label>
                  <input value={form.rep_legal_nombre} onChange={e => set('rep_legal_nombre', e.target.value)} placeholder="Nombre completo" className="input-field text-sm w-full" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">RUT Rep. Legal</label>
                  <input value={form.rep_legal_rut} onChange={e => set('rep_legal_rut', e.target.value)} placeholder="12.345.678-9" className="input-field text-sm w-full" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Domicilio Legal (comuna)</label>
                <input value={form.domicilio_legal} onChange={e => set('domicilio_legal', e.target.value)} placeholder="Ej: Santiago" className="input-field text-sm w-full" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={handleSubmit} disabled={isSaving || !form.employee_id || !form.wage || !form.date_start} className="btn-primary flex-1 justify-center">
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
          <div className="w-9 h-9 rounded-xl bg-[var(--cx-status-warn-bg)] border border-[var(--cx-status-warn-border)] flex items-center justify-center flex-shrink-0">
            <Lock size={15} className="text-[var(--cx-status-warn-text)]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[var(--cx-text-primary)]">{title}</h2>
            <p className="text-xs text-[var(--cx-text-secondary)] mt-0.5">{message}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onConfirm} disabled={busy} className="btn-primary flex-1 justify-center">
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
export default function ContratosPage() {
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [state, setState] = useState('')
  const [page, setPage] = useState(1)

  // Modal state
  const [showCreate, setShowCreate] = useState(false)
  const [editingContract, setEditingContract] = useState<any>(null)
  const [closingContract, setClosingContract] = useState<any>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  const employeeId = selectedEmployee ? Number(selectedEmployee) : undefined
  const { contratos, total, isLoading, error } = useContracts(employeeId, state || undefined)
  const { empleados } = useEmployees()
  const { crear, isLoading: isCreating } = useCreateContract()
  const { update } = useUpdateContract()
  const { close } = useCloseContract()

  const pageSize = 20
  const totalPages = Math.max(1, Math.ceil((total ?? 0) / pageSize))
  const hasFilter = Boolean(selectedEmployee) || Boolean(state)

  const handleCreate = async (data: ContractFormData) => {
    await crear(data)
    setShowCreate(false)
  }

  const handleEdit = async (data: ContractFormData) => {
    if (!editingContract) return
    setIsEditing(true)
    try {
      await update(editingContract.id, data)
      setEditingContract(null)
    } finally { setIsEditing(false) }
  }

  const handleClose = async () => {
    if (!closingContract) return
    setIsClosing(true)
    try {
      await close(closingContract.id)
      setClosingContract(null)
    } finally { setIsClosing(false) }
  }

  // Extract ID from Odoo Many2one fields (can be [id, name] or just id)
  const m2oId = (val: unknown) => {
    if (Array.isArray(val)) return String(val[0])
    if (typeof val === 'number') return String(val)
    return ''
  }

  const editInitial: ContractFormData = editingContract ? {
    employee_id: m2oId(editingContract.employee_id),
    wage: editingContract.wage ? String(editingContract.wage) : '',
    type: editingContract.l10n_cl_contract_type ?? editingContract.type ?? 'indefinido',
    gratification_type: editingContract.l10n_cl_gratificacion_type ?? editingContract.gratification_type ?? 'art47',
    colacion: editingContract.l10n_cl_colacion ? String(editingContract.l10n_cl_colacion) : (editingContract.colacion ? String(editingContract.colacion) : '0'),
    movilizacion: editingContract.l10n_cl_movilizacion ? String(editingContract.l10n_cl_movilizacion) : (editingContract.movilizacion ? String(editingContract.movilizacion) : '0'),
    date_start: editingContract.date_start ?? '',
    date_end: editingContract.date_end ?? '',
    structure_type_id: m2oId(editingContract.struct_id) || m2oId(editingContract.structure_type_id),
    job_title: editingContract.job_title ?? '',
    jornada: editingContract.jornada ?? 'completa',
    rep_legal_nombre: editingContract.rep_legal_nombre ?? '',
    rep_legal_rut: editingContract.rep_legal_rut ?? '',
    domicilio_legal: editingContract.domicilio_legal ?? '',
  } : EMPTY_FORM

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Contratos</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">Contratos laborales y condiciones de empleo</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={14} /> Nuevo Contrato
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
          <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-[var(--cx-border-light)] text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest bg-[var(--cx-bg-elevated)]">
            <div className="col-span-2">Empleado</div>
            <div className="col-span-2">Referencia</div>
            <div className="col-span-1">Departamento</div>
            <div className="col-span-1">Cargo</div>
            <div className="col-span-1 text-right">Sueldo</div>
            <div className="col-span-1">F. Inicio</div>
            <div className="col-span-1">F. Fin</div>
            <div className="col-span-1 text-center">Estado</div>
            <div className="col-span-2 text-center">Acciones</div>
          </div>

          {(contratos ?? []).length === 0 ? (
            <EmptyState hasFilter={hasFilter} />
          ) : (
            <div className="divide-y divide-[var(--cx-border-light)]">
              {(contratos ?? []).map((contract: any) => (
                <div
                  key={contract.id}
                  className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors group"
                >
                  <div className="col-span-2 font-medium text-[var(--cx-text-primary)] truncate">{contract.employee_name}</div>
                  <div className="col-span-2 font-mono text-xs text-[var(--cx-text-secondary)] truncate">{contract.name ?? '-'}</div>
                  <div className="col-span-1 text-[var(--cx-text-secondary)] truncate">{contract.department ?? '-'}</div>
                  <div className="col-span-1 text-[var(--cx-text-secondary)] truncate">{contract.job_title ?? '-'}</div>
                  <div className="col-span-1 text-right font-mono text-[var(--cx-text-primary)]">{formatCLP(contract.wage ?? 0)}</div>
                  <div className="col-span-1 text-[var(--cx-text-secondary)] text-xs">{formatDate(contract.date_start)}</div>
                  <div className="col-span-1 text-[var(--cx-text-secondary)] text-xs">{formatDate(contract.date_end)}</div>
                  <div className="col-span-1 flex justify-center">
                    <StateBadge state={contract.state ?? 'draft'} />
                  </div>
                  <div className="col-span-2 flex justify-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditingContract(contract)}
                      className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors"
                      title="Editar"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => {
                        const bffUrl = process.env['NEXT_PUBLIC_BFF_URL'] ?? 'http://localhost:4000'
                        const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') ?? '' : ''
                        window.open(`${bffUrl}/api/v1/remuneraciones/contratos/${contract.id}/pdf?token=${token}`, '_blank')
                      }}
                      className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-active-icon)] hover:bg-[var(--cx-active-bg)] transition-colors"
                      title="Descargar PDF"
                    >
                      <Download size={12} />
                    </button>
                    {(contract.state === 'open' || contract.state === 'draft') && (
                      <button
                        onClick={() => setClosingContract(contract)}
                        className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-status-warn-text)] hover:bg-[var(--cx-status-warn-bg)] transition-colors"
                        title="Cerrar contrato"
                      >
                        <Lock size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {(contratos ?? []).length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)]">
              <span className="text-xs text-[var(--cx-text-muted)]">
                {total ?? 0} contrato{(total ?? 0) !== 1 ? 's' : ''} encontrado{(total ?? 0) !== 1 ? 's' : ''}
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
        <ContractModal title="Nuevo Contrato" initial={EMPTY_FORM} isSaving={isCreating} empleados={empleados ?? []} onSave={handleCreate} onClose={() => setShowCreate(false)} />
      )}

      {/* Edit Modal */}
      {editingContract && (
        <ContractModal title="Editar Contrato" initial={editInitial} isSaving={isEditing} empleados={empleados ?? []} onSave={handleEdit} onClose={() => setEditingContract(null)} />
      )}

      {/* Close Confirm */}
      {closingContract && (
        <ConfirmDialog
          title="Cerrar Contrato"
          message={`¿Cerrar el contrato de ${closingContract.employee_name}? Esta acción finalizará el contrato vigente.`}
          confirmLabel="Cerrar Contrato"
          isLoading={isClosing}
          onConfirm={handleClose}
          onClose={() => setClosingContract(null)}
        />
      )}
    </div>
  )
}
