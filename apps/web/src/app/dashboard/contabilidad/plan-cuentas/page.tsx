/**
 * CUENTAX — Plan de Cuentas
 * Hierarchical chart of accounts with search, type filter, and CLP balances.
 */

'use client'

import { useState } from 'react'
import { Search, Download, BookOpen, Loader2, AlertCircle } from 'lucide-react'
import { useChartOfAccounts } from '@/hooks'

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
        <p className="text-xs text-[var(--cx-text-muted)]">Prueba con otra búsqueda o cambia el filtro de tipo</p>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────
export default function PlanCuentasPage() {
  const [search, setSearch] = useState('')
  const [type, setType] = useState<AccountType>('todos')

  const { cuentas, isLoading, error } = useChartOfAccounts(search, type === 'todos' ? '' : type)

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Plan de Cuentas</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">Estructura jerárquica del catálogo contable</p>
        </div>
        <button className="btn-secondary flex items-center gap-2 self-start sm:self-auto">
          <Download size={13} /> Exportar
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" />
          <input
            type="text"
            placeholder="Buscar por código o nombre..."
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
            <div className="col-span-2">Código</div>
            <div className="col-span-5">Nombre</div>
            <div className="col-span-2">Tipo</div>
            <div className="col-span-3 text-right">Saldo</div>
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
                    className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors"
                  >
                    <div
                      className="col-span-2 font-mono text-xs text-[var(--cx-text-secondary)]"
                      style={{ paddingLeft: `${depth * 12}px` }}
                    >
                      {cuenta.codigo}
                    </div>
                    <div
                      className={`col-span-5 text-[var(--cx-text-primary)] truncate ${depth === 0 ? 'font-semibold' : ''}`}
                      style={{ paddingLeft: `${depth * 12}px` }}
                    >
                      {cuenta.nombre}
                    </div>
                    <div className="col-span-2">
                      <AccountTypeBadge type={cuenta.tipo ?? 'otro'} />
                    </div>
                    <div className={`col-span-3 text-right font-mono text-sm ${
                      (cuenta.saldo ?? 0) < 0
                        ? 'text-[var(--cx-status-error-text)]'
                        : 'text-[var(--cx-text-primary)]'
                    }`}>
                      {formatCLP(cuenta.saldo ?? 0)}
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
    </div>
  )
}
