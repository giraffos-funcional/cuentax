/**
 * CUENTAX — Plan de Cuentas
 * Hierarchical chart of accounts with search, type filter, CLP balances, and CRUD.
 */

'use client'

import { useState } from 'react'
import {
  Search, Download, BookOpen, Loader2, AlertCircle,
  Plus, Upload, Pencil, Trash2, X,
} from 'lucide-react'
import {
  useChartOfAccounts,
  useCreateAccount,
  useImportAccounts,
  useUpdateAccount,
  useDeleteAccount,
} from '@/hooks'

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

type AccountType = 'todos' | 'activo' | 'pasivo' | 'patrimonio' | 'ingreso' | 'gasto'

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  todos:      'Todos',
  activo:     'Activo',
  pasivo:     'Pasivo',
  patrimonio: 'Patrimonio',
  ingreso:    'Ingreso',
  gasto:      'Gasto',
}

const TYPE_BADGE_STYLES: Record<string, string> = {
  activo:     'bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border border-[var(--cx-status-ok-border)]',
  pasivo:     'bg-[var(--cx-status-error-bg)] text-[var(--cx-status-error-text)] border border-[var(--cx-status-error-border)]',
  patrimonio: 'bg-[var(--cx-active-bg)] text-[var(--cx-active-text)] border border-[var(--cx-active-border)]',
  ingreso:    'bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border border-[var(--cx-status-ok-border)]',
  gasto:      'bg-[var(--cx-status-warn-bg)] text-[var(--cx-status-warn-text)] border border-[var(--cx-status-warn-border)]',
}

const ACCOUNT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'asset_receivable', label: 'Deudores por Venta' },
  { value: 'asset_cash', label: 'Caja y Banco' },
  { value: 'asset_current', label: 'Activo Corriente' },
  { value: 'asset_non_current', label: 'Activo No Corriente' },
  { value: 'asset_prepayments', label: 'Gastos Anticipados' },
  { value: 'asset_fixed', label: 'Activo Fijo' },
  { value: 'liability_payable', label: 'Proveedores' },
  { value: 'liability_credit_card', label: 'Tarjeta de Credito' },
  { value: 'liability_current', label: 'Pasivo Corriente' },
  { value: 'liability_non_current', label: 'Pasivo No Corriente' },
  { value: 'equity', label: 'Patrimonio' },
  { value: 'equity_unaffected', label: 'Resultados Acumulados' },
  { value: 'income', label: 'Ingresos' },
  { value: 'income_other', label: 'Otros Ingresos' },
  { value: 'expense', label: 'Gastos' },
  { value: 'expense_depreciation', label: 'Depreciacion' },
  { value: 'expense_direct_cost', label: 'Costo de Ventas' },
  { value: 'off_balance', label: 'Cuentas de Orden' },
]

function AccountTypeBadge({ type }: { type: string }) {
  const normalised = type.toLowerCase()
  const style = TYPE_BADGE_STYLES[normalised] ?? 'bg-[var(--cx-bg-elevated)] text-[var(--cx-text-secondary)] border border-[var(--cx-border-light)]'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold capitalize ${style}`}>
      {type}
    </span>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando cuentas...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando el plan de cuentas'}</span>
    </div>
  )
}

function EmptyState({ search, type }: { search: string; type: AccountType }) {
  const hasFilter = search || type !== 'todos'
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <BookOpen size={32} className="text-[var(--cx-text-muted)]" />
      <p className="text-sm font-medium text-[var(--cx-text-secondary)]">
        {hasFilter ? 'No se encontraron cuentas con ese criterio' : 'No hay cuentas registradas'}
      </p>
      {hasFilter && (
        <p className="text-xs text-[var(--cx-text-muted)]">Prueba con otra busqueda o cambia el filtro de tipo</p>
      )}
    </div>
  )
}

// ── CSV export helper ──────────────────────────────────────────
const exportCSV = (data: any[], filename: string) => {
  if (!data.length) return
  const headers = Object.keys(data[0])
  const csv = [
    headers.join(','),
    ...data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Account Form Data ─────────────────────────────────────────
interface AccountFormData {
  code: string
  name: string
  account_type: string
  reconcile: boolean
}

const EMPTY_ACCOUNT: AccountFormData = {
  code: '',
  name: '',
  account_type: 'asset_current',
  reconcile: false,
}

// ── Account Modal ─────────────────────────────────────────────
function AccountModal({
  title,
  initial,
  isSaving,
  onSave,
  onClose,
}: {
  title: string
  initial: AccountFormData
  isSaving: boolean
  onSave: (data: AccountFormData) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<AccountFormData>(initial)

  const set = (field: keyof AccountFormData, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async () => {
    if (!form.code || !form.name || !form.account_type) return
    await onSave(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="card p-6 w-full max-w-lg mx-4 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-[var(--cx-text-primary)]">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Codigo *</label>
              <input
                value={form.code}
                onChange={e => set('code', e.target.value)}
                placeholder="Ej: 1.1.01.001"
                className="input-field text-sm w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Nombre *</label>
              <input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="Ej: Caja"
                className="input-field text-sm w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Tipo de Cuenta *</label>
            <select
              value={form.account_type}
              onChange={e => set('account_type', e.target.value)}
              className="input-field text-sm w-full"
            >
              {ACCOUNT_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="reconcile"
              checked={form.reconcile}
              onChange={e => set('reconcile', e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
            />
            <label htmlFor="reconcile" className="text-sm text-[var(--cx-text-secondary)]">
              Permite conciliacion
            </label>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={handleSubmit}
            disabled={isSaving || !form.code || !form.name}
            className="btn-primary flex-1 justify-center"
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : null}
            Guardar
          </button>
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ── Import Modal ──────────────────────────────────────────────
function ImportModal({
  isSaving,
  onImport,
  onClose,
}: {
  isSaving: boolean
  onImport: (accounts: unknown[]) => Promise<void>
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [parseError, setParseError] = useState('')

  const handleImport = async () => {
    setParseError('')
    const lines = text.trim().split('\n').filter(l => l.trim())
    if (lines.length === 0) {
      setParseError('Ingresa al menos una linea')
      return
    }

    const accounts: unknown[] = []
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split('|').map(p => p.trim())
      if (parts.length < 3) {
        setParseError(`Linea ${i + 1}: formato invalido. Usa: codigo|nombre|tipo`)
        return
      }
      accounts.push({
        code: parts[0],
        name: parts[1],
        account_type: parts[2],
        reconcile: parts[3] === 'true' || parts[3] === '1',
      })
    }

    await onImport(accounts)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="card p-6 w-full max-w-lg mx-4 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-[var(--cx-text-primary)]">Importar Cuentas</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-xs text-[var(--cx-text-secondary)]">
            Pega las cuentas en formato: <span className="font-mono bg-[var(--cx-bg-elevated)] px-1 py-0.5 rounded">codigo|nombre|tipo|conciliable</span>
            <br />Una cuenta por linea. Ejemplo:
          </p>
          <div className="text-xs font-mono bg-[var(--cx-bg-elevated)] border border-[var(--cx-border-light)] rounded-xl p-3 text-[var(--cx-text-secondary)]">
            1.1.01.001|Caja|asset_cash|true<br />
            1.1.02.001|Banco Estado|asset_cash|true<br />
            2.1.01.001|Proveedores|liability_payable|true
          </div>

          <textarea
            rows={8}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Pega tus cuentas aqui..."
            className="input-field resize-none font-mono text-xs"
          />

          {parseError && (
            <div className="flex items-center gap-2 text-xs text-[var(--cx-status-error-text)]">
              <AlertCircle size={12} />
              {parseError}
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={handleImport}
            disabled={isSaving || !text.trim()}
            className="btn-primary flex-1 justify-center"
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Importar
          </button>
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ── Delete Confirm ────────────────────────────────────────────
function DeleteConfirm({
  cuenta,
  isDeleting,
  onConfirm,
  onClose,
}: {
  cuenta: any
  isDeleting: boolean
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
            <h2 className="text-sm font-bold text-[var(--cx-text-primary)]">Eliminar Cuenta</h2>
            <p className="text-xs text-[var(--cx-text-secondary)] mt-0.5">
              Eliminar la cuenta <span className="font-mono">{cuenta.codigo}</span> - {cuenta.nombre}?
              Esta accion no se puede deshacer.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onConfirm} disabled={isDeleting} className="btn-danger flex-1 justify-center">
            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : null}
            Eliminar
          </button>
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────
export default function PlanCuentasPage() {
  const [search, setSearch] = useState('')
  const [type, setType] = useState<AccountType>('todos')

  // Modal state
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingAccount, setEditingAccount] = useState<any>(null)
  const [deletingAccount, setDeletingAccount] = useState<any>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const { cuentas, isLoading, error } = useChartOfAccounts(search, type === 'todos' ? '' : type)
  const { crear } = useCreateAccount()
  const { importar } = useImportAccounts()
  const { update } = useUpdateAccount()
  const { remove } = useDeleteAccount()

  const handleCreate = async (data: AccountFormData) => {
    setIsSaving(true)
    try {
      await crear(data)
      setShowCreate(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleImport = async (accounts: unknown[]) => {
    setIsSaving(true)
    try {
      await importar(accounts)
      setShowImport(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleEdit = async (data: AccountFormData) => {
    if (!editingAccount) return
    setIsSaving(true)
    try {
      await update(editingAccount.id, data)
      setEditingAccount(null)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingAccount) return
    setIsDeleting(true)
    try {
      await remove(deletingAccount.id)
      setDeletingAccount(null)
    } finally {
      setIsDeleting(false)
    }
  }

  const editInitial: AccountFormData = editingAccount
    ? {
        code: editingAccount.codigo ?? editingAccount.code ?? '',
        name: editingAccount.nombre ?? editingAccount.name ?? '',
        account_type: editingAccount.account_type ?? editingAccount.tipo ?? 'asset_current',
        reconcile: editingAccount.reconcile ?? false,
      }
    : EMPTY_ACCOUNT

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Plan de Cuentas</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">Estructura jerarquica del catalogo contable</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowImport(true)} className="btn-secondary flex items-center gap-2">
            <Upload size={13} /> Importar
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus size={14} /> Agregar Cuenta
          </button>
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={() => exportCSV(cuentas, 'plan-cuentas')}
          >
            <Download size={13} /> Exportar
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" />
          <input
            type="text"
            placeholder="Buscar por codigo o nombre..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pl-9 py-2 text-sm w-full"
          />
        </div>
        <select
          value={type}
          onChange={e => setType(e.target.value as AccountType)}
          className="input-field py-2 text-sm w-auto"
        >
          {(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map(t => (
            <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>
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
            <div className="col-span-2">Codigo</div>
            <div className="col-span-4">Nombre</div>
            <div className="col-span-2">Tipo</div>
            <div className="col-span-2 text-right">Saldo</div>
            <div className="col-span-2 text-center">Acciones</div>
          </div>

          {cuentas.length === 0 ? (
            <EmptyState search={search} type={type} />
          ) : (
            <div className="divide-y divide-[var(--cx-border-light)]">
              {cuentas.map((cuenta: any) => {
                const depth = (cuenta.codigo ?? '').split('.').length - 1
                return (
                  <div
                    key={cuenta.id ?? cuenta.codigo}
                    className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors group"
                  >
                    <div
                      className="col-span-2 font-mono text-xs text-[var(--cx-text-secondary)]"
                      style={{ paddingLeft: `${depth * 12}px` }}
                    >
                      {cuenta.codigo}
                    </div>
                    <div
                      className={`col-span-4 text-[var(--cx-text-primary)] truncate ${depth === 0 ? 'font-semibold' : ''}`}
                      style={{ paddingLeft: `${depth * 12}px` }}
                    >
                      {cuenta.nombre}
                    </div>
                    <div className="col-span-2">
                      <AccountTypeBadge type={cuenta.tipo ?? 'otro'} />
                    </div>
                    <div className={`col-span-2 text-right font-mono text-sm ${
                      (cuenta.saldo ?? 0) < 0
                        ? 'text-[var(--cx-status-error-text)]'
                        : 'text-[var(--cx-text-primary)]'
                    }`}>
                      {formatCLP(cuenta.saldo ?? 0)}
                    </div>
                    <div className="col-span-2 flex justify-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditingAccount(cuenta)}
                        className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors"
                        title="Editar"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => setDeletingAccount(cuenta)}
                        className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-status-error-text)] hover:bg-[var(--cx-status-error-bg)] transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Footer count */}
          {cuentas.length > 0 && (
            <div className="px-4 py-2.5 border-t border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)]">
              <span className="text-xs text-[var(--cx-text-muted)]">{cuentas.length} cuenta{cuentas.length !== 1 ? 's' : ''} encontrada{cuentas.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <AccountModal
          title="Agregar Cuenta"
          initial={EMPTY_ACCOUNT}
          isSaving={isSaving}
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Edit Modal */}
      {editingAccount && (
        <AccountModal
          title="Editar Cuenta"
          initial={editInitial}
          isSaving={isSaving}
          onSave={handleEdit}
          onClose={() => setEditingAccount(null)}
        />
      )}

      {/* Import Modal */}
      {showImport && (
        <ImportModal
          isSaving={isSaving}
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}

      {/* Delete Confirm */}
      {deletingAccount && (
        <DeleteConfirm
          cuenta={deletingAccount}
          isDeleting={isDeleting}
          onConfirm={handleDelete}
          onClose={() => setDeletingAccount(null)}
        />
      )}
    </div>
  )
}
