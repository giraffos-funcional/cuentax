/**
 * CUENTAX — Banco / Cuentas Bancarias
 * Overview of bank accounts with KPIs, card grid, and inline create form.
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Landmark, Plus, Loader2, AlertCircle, ArrowLeftRight,
  Trash2, KeyRound, RefreshCw, CheckCircle2, XCircle, Clock,
} from 'lucide-react'
import {
  useBankAccounts, useCreateBankAccount, useDeleteBankAccount,
  useSaveBankCredentials,
} from '@/hooks'
import { formatCLP } from '@/lib/formatters'

// ── Types ───────────────────────────────────────────────────

interface BankAccount {
  id: number
  nombre: string
  banco: string
  tipo_cuenta: string
  numero_cuenta: string
  saldo: number
  saldo_fecha: string | null
  last_sync: string | null
  sync_status: string
  sync_error: string | null
}

// ── Status Config ───────────────────────────────────────────

const SYNC_STATUS_CONFIG: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  pendiente:     { label: 'Pendiente',     cls: 'bg-slate-100 text-slate-600',     icon: Clock },
  sincronizado:  { label: 'Sincronizado',  cls: 'bg-emerald-50 text-emerald-600',  icon: CheckCircle2 },
  error:         { label: 'Error',         cls: 'bg-red-50 text-red-600',          icon: XCircle },
}

const BANCOS = ['Itau', 'BancoEstado', 'BCI', 'Santander', 'Scotiabank', 'Otro']
const TIPOS_CUENTA = [
  { value: 'corriente', label: 'Corriente' },
  { value: 'vista', label: 'Vista' },
  { value: 'ahorro', label: 'Ahorro' },
  { value: 'rut', label: 'RUT' },
]

function SyncBadge({ status }: { status: string }) {
  const config = SYNC_STATUS_CONFIG[status] ?? SYNC_STATUS_CONFIG.pendiente
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${config.cls}`}>
      <Icon size={10} />
      {config.label}
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
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando datos'}</span>
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Landmark size={40} className="text-[var(--cx-text-muted)] mb-3" />
      <p className="text-sm font-medium text-[var(--cx-text-primary)]">Sin cuentas bancarias</p>
      <p className="text-xs text-[var(--cx-text-muted)] mt-1 mb-4">
        Agrega tu primera cuenta bancaria para comenzar a gestionar transacciones.
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--cx-violet-600)] text-white text-sm font-medium hover:bg-[var(--cx-violet-700)] transition-colors"
      >
        <Plus size={14} />
        Agregar Cuenta
      </button>
    </div>
  )
}

// ── Credentials Modal ───────────────────────────────────────

function CredentialsModal({ account, onClose }: { account: BankAccount; onClose: () => void }) {
  const { save } = useSaveBankCredentials()
  const [form, setForm] = useState({ bank_user: '', bank_password: '', scraping_enabled: false })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const handleSave = async () => {
    if (!form.bank_user || !form.bank_password) return
    setSaving(true)
    setMessage('')
    try {
      await save(account.id, form)
      setMessage('Credenciales guardadas correctamente')
      setTimeout(onClose, 1200)
    } catch {
      setMessage('Error guardando credenciales')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-[var(--cx-bg-surface)] border border-[var(--cx-border-light)] rounded-2xl shadow-xl p-6 w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-[var(--cx-text-primary)] mb-1">Credenciales Bancarias</h3>
        <p className="text-xs text-[var(--cx-text-muted)] mb-4">{account.nombre} - {account.banco}</p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Usuario</label>
            <input
              type="text"
              value={form.bank_user}
              onChange={e => setForm(f => ({ ...f, bank_user: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-[var(--cx-border-light)] bg-[var(--cx-bg-base)] text-sm text-[var(--cx-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--cx-violet-600)]/30"
              placeholder="Usuario del banco"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Clave</label>
            <input
              type="password"
              value={form.bank_password}
              onChange={e => setForm(f => ({ ...f, bank_password: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-[var(--cx-border-light)] bg-[var(--cx-bg-base)] text-sm text-[var(--cx-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--cx-violet-600)]/30"
              placeholder="Clave del banco"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--cx-text-secondary)]">
            <input
              type="checkbox"
              checked={form.scraping_enabled}
              onChange={e => setForm(f => ({ ...f, scraping_enabled: e.target.checked }))}
              className="rounded"
            />
            Habilitar sincronizacion automatica
          </label>
        </div>

        {message && (
          <p className={`mt-3 text-xs ${message.includes('Error') ? 'text-red-600' : 'text-emerald-600'}`}>
            {message}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--cx-text-secondary)] hover:bg-[var(--cx-hover-bg)] transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.bank_user || !form.bank_password}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-[var(--cx-violet-600)] text-white hover:bg-[var(--cx-violet-700)] disabled:opacity-50 transition-colors"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────

export default function BancoPage() {
  const { accounts, isLoading, error, mutate } = useBankAccounts()
  const { crear } = useCreateBankAccount()
  const { remove } = useDeleteBankAccount()

  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [credAccount, setCredAccount] = useState<BankAccount | null>(null)
  const [form, setForm] = useState({
    nombre: '', banco: 'Itau', tipo_cuenta: 'corriente', numero_cuenta: '',
  })

  const totalSaldo = (accounts as BankAccount[]).reduce((sum: number, a: BankAccount) => sum + (a.saldo ?? 0), 0)

  const handleCreate = async () => {
    if (!form.nombre || !form.numero_cuenta) return
    setCreating(true)
    try {
      await crear(form)
      setForm({ nombre: '', banco: 'Itau', tipo_cuenta: 'corriente', numero_cuenta: '' })
      setShowForm(false)
      mutate()
    } catch {
      // error handled by SWR
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: number, nombre: string) => {
    if (!confirm(`Eliminar cuenta "${nombre}"?`)) return
    try {
      await remove(id)
      mutate()
    } catch {
      // error handled by SWR
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[var(--cx-text-primary)]">Cuentas Bancarias</h1>
          <p className="text-xs text-[var(--cx-text-muted)]">Gestiona tus cuentas y transacciones bancarias</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--cx-violet-600)] text-white text-sm font-medium hover:bg-[var(--cx-violet-700)] transition-colors"
        >
          <Plus size={14} />
          Agregar Cuenta
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-[var(--cx-bg-surface)] border border-[var(--cx-border-light)] rounded-xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">Total Cuentas</p>
          <p className="text-2xl font-bold text-[var(--cx-text-primary)] mt-1">{(accounts as BankAccount[]).length}</p>
        </div>
        <div className="bg-[var(--cx-bg-surface)] border border-[var(--cx-border-light)] rounded-xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">Saldo Total</p>
          <p className="text-2xl font-bold text-[var(--cx-text-primary)] mt-1">{formatCLP(totalSaldo)}</p>
        </div>
      </div>

      {/* Inline Create Form */}
      {showForm && (
        <div className="bg-[var(--cx-bg-surface)] border border-[var(--cx-border-light)] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[var(--cx-text-primary)] mb-3">Nueva Cuenta Bancaria</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Nombre</label>
              <input
                type="text"
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Cuenta Corriente Principal"
                className="w-full px-3 py-2 rounded-lg border border-[var(--cx-border-light)] bg-[var(--cx-bg-base)] text-sm text-[var(--cx-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--cx-violet-600)]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Banco</label>
              <select
                value={form.banco}
                onChange={e => setForm(f => ({ ...f, banco: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-[var(--cx-border-light)] bg-[var(--cx-bg-base)] text-sm text-[var(--cx-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--cx-violet-600)]/30"
              >
                {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Tipo de Cuenta</label>
              <select
                value={form.tipo_cuenta}
                onChange={e => setForm(f => ({ ...f, tipo_cuenta: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-[var(--cx-border-light)] bg-[var(--cx-bg-base)] text-sm text-[var(--cx-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--cx-violet-600)]/30"
              >
                {TIPOS_CUENTA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Numero de Cuenta</label>
              <input
                type="text"
                value={form.numero_cuenta}
                onChange={e => setForm(f => ({ ...f, numero_cuenta: e.target.value }))}
                placeholder="Ej: 123456789"
                className="w-full px-3 py-2 rounded-lg border border-[var(--cx-border-light)] bg-[var(--cx-bg-base)] text-sm text-[var(--cx-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--cx-violet-600)]/30"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--cx-text-secondary)] hover:bg-[var(--cx-hover-bg)] transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !form.nombre || !form.numero_cuenta}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-[var(--cx-violet-600)] text-white hover:bg-[var(--cx-violet-700)] disabled:opacity-50 transition-colors"
            >
              {creating ? 'Creando...' : 'Crear Cuenta'}
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading && <LoadingState />}
      {error && <ErrorState />}
      {!isLoading && !error && (accounts as BankAccount[]).length === 0 && (
        <EmptyState onAdd={() => setShowForm(true)} />
      )}

      {/* Account Cards Grid */}
      {!isLoading && !error && (accounts as BankAccount[]).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(accounts as BankAccount[]).map((account) => (
            <div
              key={account.id}
              className="bg-[var(--cx-bg-surface)] border border-[var(--cx-border-light)] rounded-xl p-5 hover:border-[var(--cx-violet-600)]/30 transition-all duration-200"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-[var(--cx-text-primary)] truncate">{account.nombre}</h3>
                  <p className="text-xs text-[var(--cx-text-muted)]">{account.banco} - {account.tipo_cuenta}</p>
                </div>
                <SyncBadge status={account.sync_status ?? 'pendiente'} />
              </div>

              {/* Account Number */}
              <p className="text-xs text-[var(--cx-text-secondary)] font-mono mb-3">
                N. {account.numero_cuenta}
              </p>

              {/* Saldo */}
              <div className="mb-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">Saldo</p>
                <p className="text-xl font-bold text-[var(--cx-text-primary)]">{formatCLP(account.saldo ?? 0)}</p>
                {account.saldo_fecha && (
                  <p className="text-[10px] text-[var(--cx-text-muted)]">al {account.saldo_fecha}</p>
                )}
              </div>

              {/* Last sync */}
              {account.last_sync && (
                <p className="text-[10px] text-[var(--cx-text-muted)] mb-3">
                  Ultima sync: {new Date(account.last_sync).toLocaleDateString('es-CL')}
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-3 border-t border-[var(--cx-border-lighter)]">
                <Link
                  href={`/dashboard/banco/transacciones?cuenta=${account.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--cx-active-bg)] text-[var(--cx-active-text)] border border-[var(--cx-active-border)] hover:bg-[var(--cx-violet-600)] hover:text-white transition-colors"
                >
                  <ArrowLeftRight size={12} />
                  Transacciones
                </Link>
                <button
                  onClick={() => setCredAccount(account)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--cx-text-secondary)] hover:bg-[var(--cx-hover-bg)] transition-colors"
                  title="Configurar credenciales"
                >
                  <KeyRound size={12} />
                </button>
                <button
                  onClick={() => handleDelete(account.id, account.nombre)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition-colors ml-auto"
                  title="Eliminar"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Credentials Modal */}
      {credAccount && (
        <CredentialsModal account={credAccount} onClose={() => setCredAccount(null)} />
      )}
    </div>
  )
}
