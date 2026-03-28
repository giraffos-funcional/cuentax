/**
 * CUENTAX — Liquidaciones de Sueldo
 * Payslip listing with expandable detail rows, CRUD, and workflow actions.
 */

'use client'

import { useState } from 'react'
import { FileText, Loader2, AlertCircle, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, Calculator, CheckCircle, X, Download } from 'lucide-react'
import {
  usePayslips,
  usePayslipDetail,
  useEmployees,
  useCreatePayslip,
  useComputePayslip,
  useConfirmPayslip,
  useCancelPayslip,
} from '@/hooks/use-remuneraciones'
import { formatCLP, MONTHS } from '@/lib/formatters'

const STATE_BADGES: Record<string, string> = {
  draft:    'bg-[var(--cx-bg-elevated)] text-[var(--cx-text-secondary)] border border-[var(--cx-border-light)]',
  verify:   'bg-[var(--cx-active-bg)] text-[var(--cx-active-text)] border border-[var(--cx-active-border)]',
  done:     'bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border border-[var(--cx-status-ok-border)]',
  cancel:   'bg-[var(--cx-status-error-bg)] text-[var(--cx-status-error-text)] border border-[var(--cx-status-error-border)]',
}

const STATE_LABELS: Record<string, string> = {
  draft:  'Borrador',
  verify: 'Verificado',
  done:   'Confirmado',
  cancel: 'Cancelado',
}

// ── Types ──────────────────────────────────────────────────────
interface PayslipFormData {
  employee_id: string
  date_from: string
  date_to: string
  struct_id: string
}

const EMPTY_FORM: PayslipFormData = {
  employee_id: '',
  date_from: '',
  date_to: '',
  struct_id: '',
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
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando liquidaciones...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando liquidaciones'}</span>
    </div>
  )
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <FileText size={32} className="text-[var(--cx-text-muted)]" />
      <p className="text-sm font-medium text-[var(--cx-text-secondary)]">
        {hasFilter ? 'No se encontraron liquidaciones con ese criterio' : 'No hay liquidaciones registradas'}
      </p>
      {hasFilter && (
        <p className="text-xs text-[var(--cx-text-muted)]">Prueba con otro período o empleado</p>
      )}
    </div>
  )
}

function PayslipDetailRow({ payslipId }: { payslipId: number }) {
  const { liquidacion, lineas, isLoading, error } = usePayslipDetail(payslipId)

  if (isLoading) {
    return (
      <div className="px-8 py-4 bg-[var(--cx-bg-elevated)]">
        <div className="flex items-center gap-2">
          <Loader2 size={14} className="animate-spin text-[var(--cx-active-icon)]" />
          <span className="text-xs text-[var(--cx-text-secondary)]">Cargando detalle...</span>
        </div>
      </div>
    )
  }

  if (error || !lineas?.length) {
    return (
      <div className="px-8 py-4 bg-[var(--cx-bg-elevated)]">
        <span className="text-xs text-[var(--cx-text-muted)]">Sin líneas de detalle disponibles</span>
      </div>
    )
  }

  return (
    <div className="px-8 py-4 bg-[var(--cx-bg-elevated)]">
      <div className="card border border-[var(--cx-border-lighter)] rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-[var(--cx-border-lighter)] text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest bg-[var(--cx-bg-surface)]">
          <div className="col-span-4">Concepto</div>
          <div className="col-span-2">Código</div>
          <div className="col-span-2">Categoría</div>
          <div className="col-span-1 text-right">Cantidad</div>
          <div className="col-span-1 text-right">Tasa</div>
          <div className="col-span-2 text-right">Monto</div>
        </div>
        <div className="divide-y divide-[var(--cx-border-lighter)]">
          {lineas.map((line: any, idx: number) => (
            <div key={idx} className="grid grid-cols-12 gap-2 px-4 py-2 text-xs hover:bg-[var(--cx-hover-bg)] transition-colors">
              <div className="col-span-4 text-[var(--cx-text-primary)] truncate">{line.name}</div>
              <div className="col-span-2 font-mono text-[var(--cx-text-secondary)]">{line.code ?? '-'}</div>
              <div className="col-span-2 text-[var(--cx-text-secondary)]">{line.category ?? '-'}</div>
              <div className="col-span-1 text-right text-[var(--cx-text-secondary)]">{line.quantity ?? '-'}</div>
              <div className="col-span-1 text-right text-[var(--cx-text-secondary)]">{line.rate != null ? `${line.rate}%` : '-'}</div>
              <div className="col-span-2 text-right font-mono text-[var(--cx-text-primary)]">{formatCLP(line.amount ?? 0)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Payslip Form Modal ────────────────────────────────────────
function PayslipModal({
  title,
  initial,
  isSaving,
  empleados,
  onSave,
  onClose,
}: {
  title: string
  initial: PayslipFormData
  isSaving: boolean
  empleados: any[]
  onSave: (data: PayslipFormData) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<PayslipFormData>(initial)

  const set = (field: keyof PayslipFormData, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async () => {
    if (!form.employee_id || !form.date_from || !form.date_to) return
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
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Período Desde *</label>
              <input type="date" value={form.date_from} onChange={e => set('date_from', e.target.value)} className="input-field text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Período Hasta *</label>
              <input type="date" value={form.date_to} onChange={e => set('date_to', e.target.value)} className="input-field text-sm w-full" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Estructura Salarial</label>
            <input value={form.struct_id} onChange={e => set('struct_id', e.target.value)} placeholder="ID estructura (opcional)" className="input-field text-sm w-full" />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={handleSubmit} disabled={isSaving || !form.employee_id || !form.date_from || !form.date_to} className="btn-primary flex-1 justify-center">
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
export default function LiquidacionesPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // Modal state
  const [showCreate, setShowCreate] = useState(false)
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  const employeeId = selectedEmployee ? Number(selectedEmployee) : undefined
  const { liquidaciones, total, isLoading, error } = usePayslips({ employee_id: employeeId, mes: month, year, page })
  const { empleados } = useEmployees()
  const { crear, isLoading: isCreating } = useCreatePayslip()
  const { compute } = useComputePayslip()
  const { confirm } = useConfirmPayslip()
  const { cancel } = useCancelPayslip()

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)
  const pageSize = 20
  const totalPages = Math.max(1, Math.ceil((total ?? 0) / pageSize))
  const hasFilter = Boolean(selectedEmployee) || month !== (now.getMonth() + 1) || year !== now.getFullYear()

  const handleCreate = async (data: PayslipFormData) => {
    await crear(data)
    setShowCreate(false)
  }

  const handleAction = async (id: number, action: 'compute' | 'confirm' | 'cancel') => {
    setActionLoading(id)
    try {
      if (action === 'compute') await compute(id)
      else if (action === 'confirm') await confirm(id)
      else await cancel(id)
    } finally { setActionLoading(null) }
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Liquidaciones de Sueldo</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">Detalle de liquidaciones por período y empleado</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={14} /> Nueva Liquidación
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
            <div className="col-span-1">N°</div>
            <div className="col-span-3">Empleado</div>
            <div className="col-span-2">Período</div>
            <div className="col-span-2">Nombre</div>
            <div className="col-span-1 text-center">Estado</div>
            <div className="col-span-3 text-center">Acciones</div>
          </div>

          {(liquidaciones ?? []).length === 0 ? (
            <EmptyState hasFilter={hasFilter} />
          ) : (
            <div className="divide-y divide-[var(--cx-border-light)]">
              {(liquidaciones ?? []).map((ps: any) => (
                <div key={ps.id}>
                  <div
                    className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors cursor-pointer group"
                    onClick={() => setExpandedId(expandedId === ps.id ? null : ps.id)}
                  >
                    <div className="col-span-1 flex items-center gap-1 text-[var(--cx-text-secondary)]">
                      {expandedId === ps.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      <span className="font-mono text-xs">{ps.number ?? ps.id}</span>
                    </div>
                    <div className="col-span-3 font-medium text-[var(--cx-text-primary)] truncate">{ps.employee_name}</div>
                    <div className="col-span-2 text-[var(--cx-text-secondary)]">{ps.date_from} - {ps.date_to}</div>
                    <div className="col-span-2 text-[var(--cx-text-secondary)] truncate">{ps.name ?? '-'}</div>
                    <div className="col-span-1 flex justify-center">
                      <StateBadge state={ps.state ?? 'draft'} />
                    </div>
                    <div className="col-span-3 flex justify-center gap-1" onClick={e => e.stopPropagation()}>
                      {ps.state === 'draft' && (
                        <button
                          onClick={() => handleAction(ps.id, 'compute')}
                          disabled={actionLoading === ps.id}
                          className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-active-icon)] hover:bg-[var(--cx-active-bg)] transition-colors"
                          title="Calcular"
                        >
                          {actionLoading === ps.id ? <Loader2 size={12} className="animate-spin" /> : <Calculator size={12} />}
                        </button>
                      )}
                      {ps.state === 'verify' && (
                        <button
                          onClick={() => handleAction(ps.id, 'confirm')}
                          disabled={actionLoading === ps.id}
                          className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-status-ok-text)] hover:bg-[var(--cx-status-ok-bg)] transition-colors"
                          title="Confirmar"
                        >
                          {actionLoading === ps.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                        </button>
                      )}
                      {(ps.state === 'draft' || ps.state === 'verify') && (
                        <button
                          onClick={() => handleAction(ps.id, 'cancel')}
                          disabled={actionLoading === ps.id}
                          className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-status-error-text)] hover:bg-[var(--cx-status-error-bg)] transition-colors"
                          title="Cancelar"
                        >
                          <X size={12} />
                        </button>
                      )}
                      {ps.state === 'done' && (
                        <button
                          onClick={() => {
                            const bffUrl = process.env['NEXT_PUBLIC_BFF_URL'] ?? 'http://localhost:4000'
                            const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') ?? '' : ''
                            window.open(`${bffUrl}/api/v1/remuneraciones/liquidaciones/${ps.id}/pdf?token=${token}`, '_blank')
                          }}
                          className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-active-icon)] hover:bg-[var(--cx-active-bg)] transition-colors"
                          title="Descargar PDF"
                        >
                          <Download size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  {expandedId === ps.id && <PayslipDetailRow payslipId={ps.id} />}
                </div>
              ))}
            </div>
          )}

          {(liquidaciones ?? []).length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)]">
              <span className="text-xs text-[var(--cx-text-muted)]">
                {total ?? 0} liquidación{(total ?? 0) !== 1 ? 'es' : ''} encontrada{(total ?? 0) !== 1 ? 's' : ''}
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
        <PayslipModal
          title="Nueva Liquidación"
          initial={EMPTY_FORM}
          isSaving={isCreating}
          empleados={empleados ?? []}
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}
