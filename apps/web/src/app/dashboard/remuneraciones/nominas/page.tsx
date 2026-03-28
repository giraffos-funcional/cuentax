/**
 * CUENTAX — Nóminas Mensuales
 * Monthly payroll run listing with expandable payslip summaries and CRUD actions.
 */

'use client'

import { useState } from 'react'
import { ClipboardList, Loader2, AlertCircle, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, Play, Lock, X } from 'lucide-react'
import {
  usePayslipRuns,
  usePayslipRunDetail,
  useCreatePayslipRun,
  useGeneratePayslips,
  useClosePayslipRun,
} from '@/hooks/use-remuneraciones'
import { formatCLP, formatDate, MONTHS } from '@/lib/formatters'

const STATE_BADGES: Record<string, string> = {
  draft: 'bg-[var(--cx-bg-elevated)] text-[var(--cx-text-secondary)] border border-[var(--cx-border-light)]',
  verify: 'bg-[var(--cx-active-bg)] text-[var(--cx-active-text)] border border-[var(--cx-active-border)]',
  close: 'bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border border-[var(--cx-status-ok-border)]',
}

const STATE_LABELS: Record<string, string> = {
  draft:  'Borrador',
  verify: 'Verificada',
  close:  'Cerrada',
}

// ── Types ──────────────────────────────────────────────────────
interface NominaFormData {
  name: string
  date_start: string
  date_end: string
}

const EMPTY_FORM: NominaFormData = {
  name: '',
  date_start: '',
  date_end: '',
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
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando nóminas...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando nóminas'}</span>
    </div>
  )
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <ClipboardList size={32} className="text-[var(--cx-text-muted)]" />
      <p className="text-sm font-medium text-[var(--cx-text-secondary)]">
        {hasFilter ? 'No se encontraron nóminas para ese período' : 'No hay nóminas registradas'}
      </p>
      {hasFilter && (
        <p className="text-xs text-[var(--cx-text-muted)]">Prueba con otro mes o año</p>
      )}
    </div>
  )
}

// ── Expanded Nomina Detail ────────────────────────────────────
function NominaDetailRow({ runId }: { runId: number }) {
  const { liquidaciones, isLoading, error } = usePayslipRunDetail(runId)

  if (isLoading) {
    return (
      <div className="px-8 py-4 bg-[var(--cx-bg-elevated)]">
        <div className="flex items-center gap-2">
          <Loader2 size={14} className="animate-spin text-[var(--cx-active-icon)]" />
          <span className="text-xs text-[var(--cx-text-secondary)]">Cargando liquidaciones...</span>
        </div>
      </div>
    )
  }

  if (error || !liquidaciones?.length) {
    return (
      <div className="px-8 py-4 bg-[var(--cx-bg-elevated)]">
        <span className="text-xs text-[var(--cx-text-muted)]">Sin liquidaciones disponibles</span>
      </div>
    )
  }

  return (
    <div className="px-8 py-4 bg-[var(--cx-bg-elevated)]">
      <div className="card border border-[var(--cx-border-lighter)] rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-[var(--cx-border-lighter)] text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest bg-[var(--cx-bg-surface)]">
          <div className="col-span-4">Empleado</div>
          <div className="col-span-3 text-right">Sueldo Bruto</div>
          <div className="col-span-3 text-right">Sueldo Liquido</div>
          <div className="col-span-2 text-center">Estado</div>
        </div>
        <div className="divide-y divide-[var(--cx-border-lighter)]">
          {liquidaciones.map((ps: any) => {
            const empName = Array.isArray(ps.employee_id) ? ps.employee_id[1] : (ps.employee_name ?? '-')
            return (
              <div key={ps.id} className="grid grid-cols-12 gap-2 px-4 py-2 text-xs hover:bg-[var(--cx-hover-bg)] transition-colors">
                <div className="col-span-4 text-[var(--cx-text-primary)] truncate">{empName}</div>
                <div className="col-span-3 text-right font-mono text-[var(--cx-text-primary)]">{formatCLP(ps.gross_wage ?? 0)}</div>
                <div className="col-span-3 text-right font-mono text-[var(--cx-text-primary)]">{formatCLP(ps.net_wage ?? 0)}</div>
                <div className="col-span-2 flex justify-center">
                  <StateBadge state={ps.state ?? 'draft'} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Nomina Form Modal ─────────────────────────────────────────
function NominaModal({
  title,
  initial,
  isSaving,
  onSave,
  onClose,
}: {
  title: string
  initial: NominaFormData
  isSaving: boolean
  onSave: (data: NominaFormData) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<NominaFormData>(initial)

  const set = (field: keyof NominaFormData, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.date_start || !form.date_end) return
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
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Nombre *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nómina Marzo 2026" className="input-field text-sm w-full" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Fecha Inicio *</label>
              <input type="date" value={form.date_start} onChange={e => set('date_start', e.target.value)} className="input-field text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Fecha Fin *</label>
              <input type="date" value={form.date_end} onChange={e => set('date_end', e.target.value)} className="input-field text-sm w-full" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={handleSubmit} disabled={isSaving || !form.name.trim() || !form.date_start || !form.date_end} className="btn-primary flex-1 justify-center">
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
  icon,
  isLoading: busy,
  onConfirm,
  onClose,
}: {
  title: string
  message: string
  confirmLabel: string
  icon: React.ReactNode
  isLoading: boolean
  onConfirm: () => Promise<void>
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="card p-6 w-full max-w-sm mx-4 shadow-xl">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-[var(--cx-active-bg)] border border-[var(--cx-active-border)] flex items-center justify-center flex-shrink-0">
            {icon}
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
export default function NominasPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // Modal state
  const [showCreate, setShowCreate] = useState(false)
  const [generatingRun, setGeneratingRun] = useState<any>(null)
  const [closingRun, setClosingRun] = useState<any>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const { nominas, total, isLoading, error } = usePayslipRuns(month, year, page)
  const { crear, isLoading: isCreating } = useCreatePayslipRun()
  const { generate } = useGeneratePayslips()
  const { close } = useClosePayslipRun()

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)
  const pageSize = 20
  const totalPages = Math.max(1, Math.ceil((total ?? 0) / pageSize))
  const hasFilter = month !== (now.getMonth() + 1) || year !== now.getFullYear()

  const handleCreate = async (data: NominaFormData) => {
    await crear(data)
    setShowCreate(false)
  }

  const handleGenerate = async () => {
    if (!generatingRun) return
    setActionLoading(true)
    try {
      await generate(generatingRun.id)
      setGeneratingRun(null)
    } finally { setActionLoading(false) }
  }

  const handleClose = async () => {
    if (!closingRun) return
    setActionLoading(true)
    try {
      await close(closingRun.id)
      setClosingRun(null)
    } finally { setActionLoading(false) }
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Nóminas Mensuales</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">Lotes de procesamiento de liquidaciones</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={14} /> Nueva Nómina
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
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
            <div className="col-span-3">Nombre</div>
            <div className="col-span-2">Fecha Inicio</div>
            <div className="col-span-2">Fecha Fin</div>
            <div className="col-span-1 text-center">Estado</div>
            <div className="col-span-1 text-right">Liquidaciones</div>
            <div className="col-span-3 text-center">Acciones</div>
          </div>

          {(nominas ?? []).length === 0 ? (
            <EmptyState hasFilter={hasFilter} />
          ) : (
            <div className="divide-y divide-[var(--cx-border-light)]">
              {(nominas ?? []).map((run: any) => (
                <div key={run.id}>
                  <div
                    className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors cursor-pointer group"
                    onClick={() => setExpandedId(expandedId === run.id ? null : run.id)}
                  >
                    <div className="col-span-3 flex items-center gap-1 font-medium text-[var(--cx-text-primary)] truncate">
                      {expandedId === run.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {run.name}
                    </div>
                    <div className="col-span-2 text-[var(--cx-text-secondary)]">{formatDate(run.date_start)}</div>
                    <div className="col-span-2 text-[var(--cx-text-secondary)]">{formatDate(run.date_end)}</div>
                    <div className="col-span-1 flex justify-center">
                      <StateBadge state={run.state ?? 'draft'} />
                    </div>
                    <div className="col-span-1 text-right font-mono text-[var(--cx-text-primary)]">
                      {Array.isArray(run.slip_ids) ? run.slip_ids.length : (run.payslip_count ?? 0)}
                    </div>
                    <div className="col-span-3 flex justify-center gap-1" onClick={e => e.stopPropagation()}>
                      {run.state === 'draft' && (
                        <>
                          <button
                            onClick={() => setGeneratingRun(run)}
                            className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-active-icon)] hover:bg-[var(--cx-active-bg)] transition-colors"
                            title="Generar Liquidaciones"
                          >
                            <Play size={12} />
                          </button>
                          <button
                            onClick={() => setClosingRun(run)}
                            className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-status-ok-text)] hover:bg-[var(--cx-status-ok-bg)] transition-colors"
                            title="Cerrar Nómina"
                          >
                            <Lock size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expanded summary — fetches detail lazily */}
                  {expandedId === run.id && <NominaDetailRow runId={run.id} />}
                </div>
              ))}
            </div>
          )}

          {(nominas ?? []).length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)]">
              <span className="text-xs text-[var(--cx-text-muted)]">
                {total ?? 0} nómina{(total ?? 0) !== 1 ? 's' : ''} encontrada{(total ?? 0) !== 1 ? 's' : ''}
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
        <NominaModal title="Nueva Nómina" initial={EMPTY_FORM} isSaving={isCreating} onSave={handleCreate} onClose={() => setShowCreate(false)} />
      )}

      {/* Generate Confirm */}
      {generatingRun && (
        <ConfirmDialog
          title="Generar Liquidaciones"
          message={`¿Generar liquidaciones para todos los empleados en "${generatingRun.name}"?`}
          confirmLabel="Generar"
          icon={<Play size={15} className="text-[var(--cx-active-icon)]" />}
          isLoading={actionLoading}
          onConfirm={handleGenerate}
          onClose={() => setGeneratingRun(null)}
        />
      )}

      {/* Close Confirm */}
      {closingRun && (
        <ConfirmDialog
          title="Cerrar Nómina"
          message={`¿Cerrar la nómina "${closingRun.name}"? No se podrán agregar más liquidaciones.`}
          confirmLabel="Cerrar Nómina"
          icon={<Lock size={15} className="text-[var(--cx-active-icon)]" />}
          isLoading={actionLoading}
          onConfirm={handleClose}
          onClose={() => setClosingRun(null)}
        />
      )}
    </div>
  )
}
