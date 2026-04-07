/**
 * CUENTAX — Finiquitos (Employment Termination / Severance)
 * Listing with expandable detail rows, create dialog, workflow actions, and PDF.
 */

'use client'

import { useState, useEffect } from 'react'
import {
  FileX, Loader2, AlertCircle, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, Plus, Calculator, CheckCircle,
  X, Download,
} from 'lucide-react'
import {
  useFiniquitos,
  useFiniquitoDetail,
  useEmployees,
  useContracts,
  useCreateFiniquito,
  useCalculateFiniquito,
  useConfirmFiniquito,
} from '@/hooks/use-remuneraciones'
import { formatCLP } from '@/lib/formatters'

// ── State badges ──────────────────────────────────────────────
const STATE_BADGES: Record<string, string> = {
  draft:      'bg-[var(--cx-bg-elevated)] text-[var(--cx-text-secondary)] border border-[var(--cx-border-light)]',
  calculated: 'bg-[var(--cx-active-bg)] text-[var(--cx-active-text)] border border-[var(--cx-active-border)]',
  confirmed:  'bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border border-[var(--cx-status-ok-border)]',
  signed:     'bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border border-[var(--cx-status-ok-border)]',
}

const STATE_LABELS: Record<string, string> = {
  draft:      'Borrador',
  calculated: 'Calculado',
  confirmed:  'Confirmado',
  signed:     'Firmado',
}

const REASON_OPTIONS = [
  { value: 'necesidades_empresa', label: 'Necesidades de la Empresa (Art. 161)' },
  { value: 'renuncia', label: 'Renuncia Voluntaria (Art. 159 N\u00b02)' },
  { value: 'acuerdo_partes', label: 'Mutuo Acuerdo (Art. 159 N\u00b01)' },
  { value: 'art160', label: 'Despido Justificado (Art. 160)' },
  { value: 'vencimiento_plazo', label: 'Vencimiento del Plazo (Art. 159 N\u00b04)' },
  { value: 'conclusion_trabajo', label: 'Conclusi\u00f3n del Trabajo (Art. 159 N\u00b05)' },
]

// ── Types ─────────────────────────────────────────────────────
interface FiniquitoFormData {
  employee_id: string
  contract_id: string
  date_termination: string
  reason: string
  uf_value: string
}

const EMPTY_FORM: FiniquitoFormData = {
  employee_id: '',
  contract_id: '',
  date_termination: new Date().toISOString().split('T')[0],
  reason: '',
  uf_value: '',
}

// ── Utility components ────────────────────────────────────────
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
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando finiquitos...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando finiquitos'}</span>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-1">
      <div className="w-16 h-16 mb-3 rounded-2xl bg-gradient-to-br from-red-100 to-orange-100 flex items-center justify-center shadow-sm">
        <FileX size={28} className="text-red-500" />
      </div>
      <p className="text-base font-semibold text-[var(--cx-text-primary)]">
        No hay finiquitos registrados
      </p>
      <p className="text-sm text-[var(--cx-text-muted)] max-w-sm text-center">
        Los finiquitos permiten liquidar el t{'\u00e9'}rmino de relaci{'\u00f3'}n laboral con c{'\u00e1'}lculo autom{'\u00e1'}tico de indemnizaciones.
      </p>
    </div>
  )
}

// ── Detail Row ────────────────────────────────────────────────
function FiniquitoDetailRow({ finiquitoId }: { finiquitoId: number }) {
  const { finiquito, isLoading, error } = useFiniquitoDetail(finiquitoId)

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

  if (error || !finiquito) {
    return (
      <div className="px-8 py-4 bg-[var(--cx-bg-elevated)]">
        <span className="text-xs text-[var(--cx-text-muted)]">Sin detalle disponible</span>
      </div>
    )
  }

  const f = finiquito as any

  return (
    <div className="px-8 py-4 bg-[var(--cx-bg-elevated)]">
      <div className="card border border-[var(--cx-border-lighter)] rounded-xl overflow-hidden p-4">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <span className="text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Fecha Ingreso</span>
            <p className="text-sm text-[var(--cx-text-primary)]">{f.date_start ?? '-'}</p>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Fecha T{'\u00e9'}rmino</span>
            <p className="text-sm text-[var(--cx-text-primary)]">{f.date_termination ?? '-'}</p>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Antig{'\u00fc'}edad</span>
            <p className="text-sm text-[var(--cx-text-primary)]">{Math.floor(f.years_service)} a{'\u00f1'}o(s) y {f.months_service % 12} mes(es)</p>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider">Promedio 3 Meses</span>
            <p className="text-sm text-[var(--cx-text-primary)]">{formatCLP(f.avg_wage_3m)}</p>
          </div>
        </div>

        <div className="border-t border-[var(--cx-border-lighter)] pt-3 space-y-2">
          <h4 className="text-xs font-bold text-[var(--cx-text-primary)] uppercase tracking-wider mb-2">Desglose</h4>

          {f.indemnizacion_anos > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-[var(--cx-text-secondary)]">Indemnizaci{'\u00f3'}n por A{'\u00f1'}os de Servicio</span>
              <span className="font-mono text-[var(--cx-text-primary)]">{formatCLP(f.indemnizacion_anos)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-[var(--cx-text-secondary)]">Vacaciones Proporcionales</span>
            <span className="font-mono text-[var(--cx-text-primary)]">{formatCLP(f.vacaciones_proporcionales)}</span>
          </div>
          {f.feriado_pendiente > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-[var(--cx-text-secondary)]">Feriado Legal Pendiente</span>
              <span className="font-mono text-[var(--cx-text-primary)]">{formatCLP(f.feriado_pendiente)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-[var(--cx-text-secondary)]">Sueldo Proporcional</span>
            <span className="font-mono text-[var(--cx-text-primary)]">{formatCLP(f.sueldo_proporcional)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--cx-text-secondary)]">Gratificaci{'\u00f3'}n Proporcional</span>
            <span className="font-mono text-[var(--cx-text-primary)]">{formatCLP(f.gratificacion_proporcional)}</span>
          </div>

          <div className="border-t border-[var(--cx-border-lighter)] pt-2 mt-2 flex justify-between text-sm font-bold">
            <span className="text-[var(--cx-text-primary)]">TOTAL FINIQUITO</span>
            <span className="font-mono text-[var(--cx-text-primary)]">{formatCLP(f.total_finiquito)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Create Modal ──────────────────────────────────────────────
function FiniquitoModal({
  empleados,
  isSaving,
  onSave,
  onClose,
}: {
  empleados: any[]
  isSaving: boolean
  onSave: (data: FiniquitoFormData) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<FiniquitoFormData>(EMPTY_FORM)

  // Fetch contracts for selected employee
  const { contratos } = useContracts(
    form.employee_id ? Number(form.employee_id) : undefined,
    'open',
  )

  // Auto-select contract when employee changes
  useEffect(() => {
    if (contratos.length === 1) {
      setForm(prev => ({ ...prev, contract_id: String(contratos[0].id) }))
    } else {
      setForm(prev => ({ ...prev, contract_id: '' }))
    }
  }, [contratos])

  const set = (field: keyof FiniquitoFormData, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const canSubmit = form.employee_id && form.contract_id && form.date_termination && form.reason

  const handleSubmit = async () => {
    if (!canSubmit) return
    await onSave(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="card p-6 w-full max-w-lg mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-[var(--cx-text-primary)]">Nuevo Finiquito</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Empleado *</label>
            <select
              value={form.employee_id}
              onChange={e => set('employee_id', e.target.value)}
              className="input-field text-sm w-full"
            >
              <option value="">Seleccionar empleado...</option>
              {(empleados ?? []).map((e: any) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Contrato *</label>
            <select
              value={form.contract_id}
              onChange={e => set('contract_id', e.target.value)}
              className="input-field text-sm w-full"
              disabled={!form.employee_id}
            >
              <option value="">Seleccionar contrato...</option>
              {(contratos ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({formatCLP(c.wage)})
                </option>
              ))}
            </select>
            {form.employee_id && contratos.length === 0 && (
              <p className="text-xs text-[var(--cx-status-error-text)] mt-1">No hay contratos activos para este empleado</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Fecha de T{'\u00e9'}rmino *</label>
            <input
              type="date"
              value={form.date_termination}
              onChange={e => set('date_termination', e.target.value)}
              className="input-field text-sm w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Causal de T{'\u00e9'}rmino *</label>
            <select
              value={form.reason}
              onChange={e => set('reason', e.target.value)}
              className="input-field text-sm w-full"
            >
              <option value="">Seleccionar causal...</option>
              {REASON_OPTIONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Valor UF (para tope indemnizaci{'\u00f3'}n)</label>
            <input
              type="number"
              step="0.01"
              value={form.uf_value}
              onChange={e => set('uf_value', e.target.value)}
              placeholder="Ej: 38248.56"
              className="input-field text-sm w-full"
            />
            <p className="text-[10px] text-[var(--cx-text-muted)] mt-0.5">Opcional. Tope legal: 90 UF por mes de indemnizaci{'\u00f3'}n.</p>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={handleSubmit}
            disabled={isSaving || !canSubmit}
            className="btn-primary flex-1 justify-center"
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : null}
            Crear Finiquito
          </button>
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────
export default function FiniquitosPage() {
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  const { finiquitos, total, isLoading, error } = useFiniquitos(page)
  const { empleados } = useEmployees()
  const { crear, isLoading: isCreating } = useCreateFiniquito()
  const { calculate } = useCalculateFiniquito()
  const { confirm } = useConfirmFiniquito()

  const pageSize = 20
  const totalPages = Math.max(1, Math.ceil((total ?? 0) / pageSize))

  const handleCreate = async (data: FiniquitoFormData) => {
    await crear({
      employee_id: Number(data.employee_id),
      contract_id: Number(data.contract_id),
      date_termination: data.date_termination,
      reason: data.reason,
      uf_value: data.uf_value ? Number(data.uf_value) : undefined,
    })
    setShowCreate(false)
  }

  const handleAction = async (id: number, action: 'calculate' | 'confirm') => {
    setActionLoading(id)
    try {
      if (action === 'calculate') await calculate(id)
      else await confirm(id)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDownloadPdf = (id: number) => {
    const bffUrl = process.env['NEXT_PUBLIC_BFF_URL'] ?? 'http://localhost:4000'
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') ?? '' : ''
    window.open(`${bffUrl}/api/v1/remuneraciones/finiquitos/${id}/pdf?token=${token}`, '_blank')
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Finiquitos</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">Gesti{'\u00f3'}n de t{'\u00e9'}rminos de relaci{'\u00f3'}n laboral y liquidaci{'\u00f3'}n de haberes</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={14} /> Nuevo Finiquito
        </button>
      </div>

      {/* Table */}
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error?.message} />}

      {!isLoading && !error && (
        <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-[var(--cx-border-light)] text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest bg-[var(--cx-bg-elevated)]">
            <div className="col-span-1">Ref</div>
            <div className="col-span-3">Empleado</div>
            <div className="col-span-2">Fecha T{'\u00e9'}rmino</div>
            <div className="col-span-2">Causal</div>
            <div className="col-span-1 text-right">Total</div>
            <div className="col-span-1 text-center">Estado</div>
            <div className="col-span-2 text-center">Acciones</div>
          </div>

          {(finiquitos ?? []).length === 0 ? (
            <EmptyState />
          ) : (
            <div className="divide-y divide-[var(--cx-border-light)]">
              {(finiquitos ?? []).map((f: any) => (
                <div key={f.id}>
                  <div
                    className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors cursor-pointer group"
                    onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}
                  >
                    <div className="col-span-1 flex items-center gap-1 text-[var(--cx-text-secondary)]">
                      {expandedId === f.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      <span className="font-mono text-xs">{f.name ?? f.id}</span>
                    </div>
                    <div className="col-span-3 font-medium text-[var(--cx-text-primary)] truncate">{f.employee_name}</div>
                    <div className="col-span-2 text-[var(--cx-text-secondary)]">{f.date_termination}</div>
                    <div className="col-span-2 text-[var(--cx-text-secondary)] truncate text-xs">{f.reason_label ?? f.reason}</div>
                    <div className="col-span-1 text-right font-mono text-[var(--cx-text-primary)]">{formatCLP(f.total_finiquito ?? 0)}</div>
                    <div className="col-span-1 flex justify-center">
                      <StateBadge state={f.state ?? 'draft'} />
                    </div>
                    <div className="col-span-2 flex justify-center gap-1" onClick={e => e.stopPropagation()}>
                      {f.state === 'draft' && (
                        <button
                          onClick={() => handleAction(f.id, 'calculate')}
                          disabled={actionLoading === f.id}
                          className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-active-icon)] hover:bg-[var(--cx-active-bg)] transition-colors"
                          title="Calcular"
                        >
                          {actionLoading === f.id ? <Loader2 size={12} className="animate-spin" /> : <Calculator size={12} />}
                        </button>
                      )}
                      {f.state === 'calculated' && (
                        <button
                          onClick={() => handleAction(f.id, 'confirm')}
                          disabled={actionLoading === f.id}
                          className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-status-ok-text)] hover:bg-[var(--cx-status-ok-bg)] transition-colors"
                          title="Confirmar"
                        >
                          {actionLoading === f.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                        </button>
                      )}
                      <button
                        onClick={() => handleDownloadPdf(f.id)}
                        className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-active-icon)] hover:bg-[var(--cx-active-bg)] transition-colors"
                        title="Descargar PDF"
                      >
                        <Download size={12} />
                      </button>
                    </div>
                  </div>
                  {expandedId === f.id && <FiniquitoDetailRow finiquitoId={f.id} />}
                </div>
              ))}
            </div>
          )}

          {(finiquitos ?? []).length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)]">
              <span className="text-xs text-[var(--cx-text-muted)]">
                {total ?? 0} finiquito{(total ?? 0) !== 1 ? 's' : ''} encontrado{(total ?? 0) !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn-secondary p-1.5 disabled:opacity-40">
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-[var(--cx-text-secondary)]">P{'\u00e1'}gina {page} de {totalPages}</span>
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
        <FiniquitoModal
          empleados={empleados ?? []}
          isSaving={isCreating}
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}
