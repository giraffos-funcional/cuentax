/**
 * CUENTAX — Banco / Transacciones
 * Transaction list with account selector, date range filters, manual entry,
 * pagination, and reconciliation status badges.
 */

'use client'

import { useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ArrowLeftRight, Plus, Loader2, AlertCircle, ChevronUp, ChevronDown,
  Trash2, CheckCircle2, XCircle, Clock, Search,
} from 'lucide-react'
import {
  useBankAccounts, useBankTransactions,
  useCreateBankTransaction, useDeleteBankTransaction,
} from '@/hooks'
import { formatCLP } from '@/lib/formatters'

// ── Types ───────────────────────────────────────────────────

interface BankAccount {
  id: number
  nombre: string
  banco: string
  numero_cuenta: string
}

interface BankTransaction {
  id: number
  fecha: string
  descripcion: string
  referencia: string | null
  monto: number
  tipo: string
  saldo: number | null
  source: string
  reconcile_status: string
  dte_document_id: number | null
}

// ── Config ──────────────────────────────────────────────────

const RECONCILE_CONFIG: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  sin_conciliar: { label: 'Sin conciliar', cls: 'bg-slate-100 text-slate-600', icon: Clock },
  conciliado:    { label: 'Conciliado',    cls: 'bg-emerald-50 text-emerald-600', icon: CheckCircle2 },
  descartado:    { label: 'Descartado',    cls: 'bg-gray-100 text-gray-500', icon: XCircle },
}

function ReconcileBadge({ status }: { status: string }) {
  const config = RECONCILE_CONFIG[status] ?? RECONCILE_CONFIG.sin_conciliar
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${config.cls}`}>
      <Icon size={10} />
      {config.label}
    </span>
  )
}

type SortDir = 'asc' | 'desc' | null

function SortHeader({ label, sortKey: key, current, dir, onSort, className }: {
  label: string; sortKey: string; current: string | null; dir: SortDir; onSort: (key: string) => void; className?: string
}) {
  const active = current === key
  return (
    <button
      onClick={() => onSort(key)}
      className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] transition-colors cursor-pointer select-none ${className ?? ''}`}
    >
      {label}
      {active && dir === 'asc' && <ChevronUp size={12} />}
      {active && dir === 'desc' && <ChevronDown size={12} />}
    </button>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando transacciones...</span>
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

function EmptyState({ hasAccount }: { hasAccount: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <ArrowLeftRight size={40} className="text-[var(--cx-text-muted)] mb-3" />
      <p className="text-sm font-medium text-[var(--cx-text-primary)]">
        {hasAccount ? 'Sin transacciones' : 'Selecciona una cuenta'}
      </p>
      <p className="text-xs text-[var(--cx-text-muted)] mt-1">
        {hasAccount
          ? 'No hay transacciones para los filtros seleccionados.'
          : 'Selecciona una cuenta bancaria para ver sus transacciones.'
        }
      </p>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────

function TransaccionesContent() {
  const searchParams = useSearchParams()
  const initialAccount = searchParams.get('cuenta') ? Number(searchParams.get('cuenta')) : null

  const { accounts } = useBankAccounts()
  const [selectedAccount, setSelectedAccount] = useState<number | null>(initialAccount)
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const { transactions, total, saldo, isLoading, error, mutate } = useBankTransactions(
    selectedAccount,
    { fecha_desde: fechaDesde || undefined, fecha_hasta: fechaHasta || undefined, page },
  )
  const { crear } = useCreateBankTransaction()
  const { remove } = useDeleteBankTransaction()

  const [txForm, setTxForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    descripcion: '',
    monto: '',
    tipo: 'debito' as 'debito' | 'credito',
    referencia: '',
  })
  const [creating, setCreating] = useState(false)

  // Sort + filter
  const sortedTx = useMemo(() => {
    let filtered = (transactions as BankTransaction[])
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(tx =>
        tx.descripcion.toLowerCase().includes(term) ||
        (tx.referencia && tx.referencia.toLowerCase().includes(term))
      )
    }
    if (!sortKey || !sortDir) return filtered
    return [...filtered].sort((a, b) => {
      const av = (a as any)[sortKey]
      const bv = (b as any)[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      return sortDir === 'asc'
        ? String(av ?? '').localeCompare(String(bv ?? ''))
        : String(bv ?? '').localeCompare(String(av ?? ''))
    })
  }, [transactions, sortKey, sortDir, searchTerm])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc')
      if (sortDir === 'desc') setSortKey(null)
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const handleCreateTx = async () => {
    if (!selectedAccount || !txForm.descripcion || !txForm.monto) return
    setCreating(true)
    try {
      await crear(selectedAccount, {
        fecha: txForm.fecha,
        descripcion: txForm.descripcion,
        monto: Number(txForm.monto),
        tipo: txForm.tipo,
        referencia: txForm.referencia || undefined,
      })
      setTxForm({
        fecha: new Date().toISOString().split('T')[0],
        descripcion: '', monto: '', tipo: 'debito', referencia: '',
      })
      setShowForm(false)
      mutate()
    } catch {
      // error handled
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (txId: number) => {
    if (!confirm('Eliminar esta transaccion?')) return
    try {
      await remove(txId)
      mutate()
    } catch {
      // error handled
    }
  }

  const totalPages = Math.ceil(total / 50)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[var(--cx-text-primary)]">Transacciones Bancarias</h1>
          <p className="text-xs text-[var(--cx-text-muted)]">Movimientos de tus cuentas bancarias</p>
        </div>
        {selectedAccount && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--cx-violet-600)] text-white text-sm font-medium hover:bg-[var(--cx-violet-700)] transition-colors"
          >
            <Plus size={14} />
            Agregar Manual
          </button>
        )}
      </div>

      {/* Filters Bar */}
      <div className="bg-[var(--cx-bg-surface)] border border-[var(--cx-border-light)] rounded-xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Account Selector */}
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Cuenta</label>
            <select
              value={selectedAccount ?? ''}
              onChange={e => { setSelectedAccount(e.target.value ? Number(e.target.value) : null); setPage(1) }}
              className="w-full px-3 py-2 rounded-lg border border-[var(--cx-border-light)] bg-[var(--cx-bg-base)] text-sm text-[var(--cx-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--cx-violet-600)]/30"
            >
              <option value="">Seleccionar cuenta...</option>
              {(accounts as BankAccount[]).map(a => (
                <option key={a.id} value={a.id}>{a.nombre} ({a.banco})</option>
              ))}
            </select>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Desde</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={e => { setFechaDesde(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 rounded-lg border border-[var(--cx-border-light)] bg-[var(--cx-bg-base)] text-sm text-[var(--cx-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--cx-violet-600)]/30"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Hasta</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={e => { setFechaHasta(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 rounded-lg border border-[var(--cx-border-light)] bg-[var(--cx-bg-base)] text-sm text-[var(--cx-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--cx-violet-600)]/30"
            />
          </div>

          {/* Search */}
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Buscar</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Descripcion o referencia..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--cx-border-light)] bg-[var(--cx-bg-base)] text-sm text-[var(--cx-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--cx-violet-600)]/30"
              />
            </div>
          </div>
        </div>

        {/* Saldo info */}
        {selectedAccount && !isLoading && (
          <div className="mt-3 pt-3 border-t border-[var(--cx-border-lighter)] flex items-center gap-4">
            <span className="text-xs text-[var(--cx-text-muted)]">
              {total} transacciones
            </span>
            <span className="text-xs font-semibold text-[var(--cx-text-primary)]">
              Saldo: {formatCLP(saldo)}
            </span>
          </div>
        )}
      </div>

      {/* Inline Create Form */}
      {showForm && selectedAccount && (
        <div className="bg-[var(--cx-bg-surface)] border border-[var(--cx-border-light)] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[var(--cx-text-primary)] mb-3">Nueva Transaccion Manual</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Fecha</label>
              <input
                type="date"
                value={txForm.fecha}
                onChange={e => setTxForm(f => ({ ...f, fecha: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-[var(--cx-border-light)] bg-[var(--cx-bg-base)] text-sm text-[var(--cx-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--cx-violet-600)]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Descripcion</label>
              <input
                type="text"
                value={txForm.descripcion}
                onChange={e => setTxForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Descripcion del movimiento"
                className="w-full px-3 py-2 rounded-lg border border-[var(--cx-border-light)] bg-[var(--cx-bg-base)] text-sm text-[var(--cx-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--cx-violet-600)]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Monto</label>
              <input
                type="number"
                value={txForm.monto}
                onChange={e => setTxForm(f => ({ ...f, monto: e.target.value }))}
                placeholder="0"
                className="w-full px-3 py-2 rounded-lg border border-[var(--cx-border-light)] bg-[var(--cx-bg-base)] text-sm text-[var(--cx-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--cx-violet-600)]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Tipo</label>
              <select
                value={txForm.tipo}
                onChange={e => setTxForm(f => ({ ...f, tipo: e.target.value as 'debito' | 'credito' }))}
                className="w-full px-3 py-2 rounded-lg border border-[var(--cx-border-light)] bg-[var(--cx-bg-base)] text-sm text-[var(--cx-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--cx-violet-600)]/30"
              >
                <option value="debito">Debito (egreso)</option>
                <option value="credito">Credito (ingreso)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Referencia</label>
              <input
                type="text"
                value={txForm.referencia}
                onChange={e => setTxForm(f => ({ ...f, referencia: e.target.value }))}
                placeholder="Opcional"
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
              onClick={handleCreateTx}
              disabled={creating || !txForm.descripcion || !txForm.monto}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-[var(--cx-violet-600)] text-white hover:bg-[var(--cx-violet-700)] disabled:opacity-50 transition-colors"
            >
              {creating ? 'Creando...' : 'Agregar Transaccion'}
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {!selectedAccount && <EmptyState hasAccount={false} />}
      {selectedAccount && isLoading && <LoadingState />}
      {selectedAccount && error && <ErrorState />}
      {selectedAccount && !isLoading && !error && sortedTx.length === 0 && <EmptyState hasAccount />}

      {/* Transactions Table */}
      {selectedAccount && !isLoading && !error && sortedTx.length > 0 && (
        <div className="bg-[var(--cx-bg-surface)] border border-[var(--cx-border-light)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--cx-border-lighter)]">
                  <th className="text-left px-4 py-3">
                    <SortHeader label="Fecha" sortKey="fecha" current={sortKey} dir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="text-left px-4 py-3">
                    <SortHeader label="Descripcion" sortKey="descripcion" current={sortKey} dir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="text-left px-4 py-3">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">Referencia</span>
                  </th>
                  <th className="text-right px-4 py-3">
                    <SortHeader label="Debito" sortKey="debito" current={sortKey} dir={sortDir} onSort={handleSort} className="justify-end" />
                  </th>
                  <th className="text-right px-4 py-3">
                    <SortHeader label="Credito" sortKey="credito" current={sortKey} dir={sortDir} onSort={handleSort} className="justify-end" />
                  </th>
                  <th className="text-right px-4 py-3">
                    <SortHeader label="Saldo" sortKey="saldo" current={sortKey} dir={sortDir} onSort={handleSort} className="justify-end" />
                  </th>
                  <th className="text-center px-4 py-3">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">Estado</span>
                  </th>
                  <th className="text-center px-4 py-3">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedTx.map((tx) => (
                  <tr
                    key={tx.id}
                    className="border-b border-[var(--cx-border-lighter)] last:border-0 hover:bg-[var(--cx-hover-bg)] transition-colors"
                  >
                    <td className="px-4 py-3 text-xs text-[var(--cx-text-secondary)] whitespace-nowrap">
                      {tx.fecha}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--cx-text-primary)] max-w-[250px] truncate">
                      {tx.descripcion}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--cx-text-muted)] font-mono">
                      {tx.referencia ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-right whitespace-nowrap">
                      {tx.tipo === 'debito' ? (
                        <span className="text-red-600 font-semibold">{formatCLP(Math.abs(tx.monto))}</span>
                      ) : (
                        <span className="text-[var(--cx-text-muted)]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-right whitespace-nowrap">
                      {tx.tipo === 'credito' ? (
                        <span className="text-emerald-600 font-semibold">{formatCLP(Math.abs(tx.monto))}</span>
                      ) : (
                        <span className="text-[var(--cx-text-muted)]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-right whitespace-nowrap font-semibold text-[var(--cx-text-primary)]">
                      {tx.saldo !== null ? formatCLP(tx.saldo) : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ReconcileBadge status={tx.reconcile_status ?? 'sin_conciliar'} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDelete(tx.id)}
                        className="p-1 rounded-md text-[var(--cx-text-muted)] hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--cx-border-lighter)]">
              <span className="text-xs text-[var(--cx-text-muted)]">
                Pagina {page} de {totalPages} ({total} registros)
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 rounded-md text-xs font-medium text-[var(--cx-text-secondary)] hover:bg-[var(--cx-hover-bg)] disabled:opacity-30 transition-colors"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1 rounded-md text-xs font-medium text-[var(--cx-text-secondary)] hover:bg-[var(--cx-hover-bg)] disabled:opacity-30 transition-colors"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function TransaccionesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" /></div>}>
      <TransaccionesContent />
    </Suspense>
  )
}
