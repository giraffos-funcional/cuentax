/**
 * CUENTAX — Libro Mayor
 * Account ledger with running balance, summary card, and account/period selectors.
 */

'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, Download, Loader2, AlertCircle, LayoutList, X } from 'lucide-react'
import { useChartOfAccounts, useGeneralLedger } from '@/hooks'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
               'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando movimientos...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando el libro mayor'}</span>
    </div>
  )
}

function EmptyMovements() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <LayoutList size={32} className="text-[var(--cx-text-muted)]" />
      <p className="text-sm font-medium text-[var(--cx-text-secondary)]">Sin movimientos en este período</p>
      <p className="text-xs text-[var(--cx-text-muted)]">Esta cuenta no registra actividad para el período seleccionado</p>
    </div>
  )
}

// ── Account search autocomplete ───────────────────────────────
function AccountSelector({
  onSelect,
}: {
  onSelect: (account: { id: string | number; codigo: string; nombre: string }) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const { cuentas, isLoading } = useChartOfAccounts(query)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={containerRef} className="relative flex-1 min-w-60">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" />
      <input
        type="text"
        placeholder="Código o nombre de cuenta..."
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        className="input-field pl-9 pr-4 py-2 text-sm w-full"
      />
      {query && (
        <button
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] transition-colors"
          onClick={() => { setQuery(''); setOpen(false) }}
        >
          <X size={13} />
        </button>
      )}

      {open && query.length >= 1 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-[var(--cx-bg-surface)] border border-[var(--cx-border-light)] rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={14} className="animate-spin text-[var(--cx-active-icon)]" />
              <span className="ml-2 text-xs text-[var(--cx-text-secondary)]">Buscando...</span>
            </div>
          ) : cuentas?.length === 0 ? (
            <div className="px-4 py-4 text-xs text-[var(--cx-text-muted)] text-center">Sin resultados</div>
          ) : (
            <div className="divide-y divide-[var(--cx-border-light)]">
              {cuentas?.slice(0, 15).map((cuenta: any) => (
                <button
                  key={cuenta.id ?? cuenta.codigo}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-[var(--cx-hover-bg)] transition-colors"
                  onClick={() => {
                    onSelect({ id: cuenta.id, codigo: cuenta.codigo, nombre: cuenta.nombre })
                    setQuery(`${cuenta.codigo} — ${cuenta.nombre}`)
                    setOpen(false)
                  }}
                >
                  <span className="font-mono text-xs text-[var(--cx-text-muted)] shrink-0">{cuenta.codigo}</span>
                  <span className="text-[var(--cx-text-primary)] truncate">{cuenta.nombre}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Summary card ──────────────────────────────────────────────
function SummaryCard({
  cuenta,
  saldo_inicial,
  saldo_final,
  totalDebe,
  totalHaber,
}: {
  cuenta: any
  saldo_inicial: number
  saldo_final: number
  totalDebe: number
  totalHaber: number
}) {
  return (
    <div className="card border border-[var(--cx-border-light)] rounded-2xl p-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest mb-1">Cuenta seleccionada</p>
          <h2 className="text-base font-bold text-[var(--cx-text-primary)]">
            {cuenta.codigo} — {cuenta.nombre}
          </h2>
          <p className="text-xs text-[var(--cx-text-secondary)] mt-0.5 capitalize">{cuenta.tipo ?? ''}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest mb-1">Saldo final</p>
          <p className={`text-xl font-bold ${saldo_final < 0 ? 'text-[var(--cx-status-error-text)]' : 'text-[var(--cx-active-icon)]'}`}>
            {formatCLP(saldo_final)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-[var(--cx-bg-elevated)] border border-[var(--cx-border-light)]">
          <p className="text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest mb-1">Saldo inicial</p>
          <p className="text-sm font-semibold text-[var(--cx-text-primary)]">{formatCLP(saldo_inicial)}</p>
        </div>
        <div className="p-3 rounded-xl bg-[var(--cx-bg-elevated)] border border-[var(--cx-border-light)]">
          <p className="text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest mb-1">Total Debe</p>
          <p className="text-sm font-semibold text-[var(--cx-status-error-text)]">{formatCLP(totalDebe)}</p>
        </div>
        <div className="p-3 rounded-xl bg-[var(--cx-bg-elevated)] border border-[var(--cx-border-light)]">
          <p className="text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest mb-1">Total Haber</p>
          <p className="text-sm font-semibold text-[var(--cx-status-ok-text)]">{formatCLP(totalHaber)}</p>
        </div>
      </div>
    </div>
  )
}

// ── Ledger table ──────────────────────────────────────────────
function LedgerTable({
  movimientos,
  saldo_inicial,
}: {
  movimientos: any[]
  saldo_inicial: number
}) {
  // Use pre-calculated saldo_acumulado from BFF
  const rows = movimientos.map((m: any) => ({
    ...m,
    saldo_corrido: m.saldo_acumulado ?? 0,
  }))

  return (
    <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-[var(--cx-border-light)] text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest bg-[var(--cx-bg-elevated)]">
        <div className="col-span-1">Fecha</div>
        <div className="col-span-2">Documento</div>
        <div className="col-span-4">Descripción</div>
        <div className="col-span-2 text-right">Debe</div>
        <div className="col-span-2 text-right">Haber</div>
        <div className="col-span-1 text-right">Saldo</div>
      </div>

      {/* Opening balance row */}
      <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)] text-xs font-semibold">
        <div className="col-span-7 text-[var(--cx-text-muted)]">Saldo Inicial</div>
        <div className="col-span-2 text-right text-[var(--cx-text-muted)]">—</div>
        <div className="col-span-2 text-right text-[var(--cx-text-muted)]">—</div>
        <div className="col-span-1 text-right font-mono text-[var(--cx-text-primary)]">
          {formatCLP(saldo_inicial)}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyMovements />
      ) : (
        <div className="divide-y divide-[var(--cx-border-light)]">
          {rows.map((mov: any, i: number) => (
            <div
              key={mov.id ?? i}
              className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors"
            >
              <div className="col-span-1 text-[var(--cx-text-secondary)] text-xs">
                {mov.fecha ? String(mov.fecha).slice(5) : '-'}
              </div>
              <div className="col-span-2 font-mono text-xs text-[var(--cx-text-primary)]">
                {mov.documento ?? '-'}
              </div>
              <div className="col-span-4 text-[var(--cx-text-secondary)] truncate text-xs">
                {mov.descripcion ?? '-'}
              </div>
              <div className="col-span-2 text-right font-mono text-sm text-[var(--cx-text-primary)]">
                {(mov.debe ?? 0) > 0 ? formatCLP(mov.debe) : '—'}
              </div>
              <div className="col-span-2 text-right font-mono text-sm text-[var(--cx-text-primary)]">
                {(mov.haber ?? 0) > 0 ? formatCLP(mov.haber) : '—'}
              </div>
              <div className={`col-span-1 text-right font-mono text-sm font-semibold ${
                mov.saldo_corrido < 0
                  ? 'text-[var(--cx-status-error-text)]'
                  : 'text-[var(--cx-active-icon)]'
              }`}>
                {formatCLP(mov.saldo_corrido)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Totals footer */}
      {rows.length > 0 && (
        <div className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)] text-sm font-bold">
          <div className="col-span-7 text-[var(--cx-text-secondary)]">TOTALES</div>
          <div className="col-span-2 text-right text-[var(--cx-status-error-text)]">
            {formatCLP(rows.reduce((s: number, m: any) => s + (m.debe ?? m.debit ?? 0), 0))}
          </div>
          <div className="col-span-2 text-right text-[var(--cx-status-ok-text)]">
            {formatCLP(rows.reduce((s: number, m: any) => s + (m.haber ?? m.credit ?? 0), 0))}
          </div>
          <div className="col-span-1" />
        </div>
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

// ── Page ──────────────────────────────────────────────────────
export default function LibroMayorPage() {
  const now = new Date()
  const [mes, setMes]       = useState(now.getMonth() + 1)
  const [year, setYear]     = useState(now.getFullYear())
  const [selectedAccount, setSelectedAccount] = useState<{ id: string | number; codigo: string; nombre: string } | null>(null)

  const { cuenta, movimientos, saldo_inicial, saldo_final, isLoading, error } = useGeneralLedger(
    selectedAccount?.id ?? null,
    mes,
    year,
  )

  const totalDebe  = movimientos?.reduce((s: number, m: any) => s + (m.debe  ?? m.debit  ?? 0), 0) ?? 0
  const totalHaber = movimientos?.reduce((s: number, m: any) => s + (m.haber ?? m.credit ?? 0), 0) ?? 0

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Libro Mayor</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">Movimientos por cuenta con saldo corrido</p>
        </div>
        {selectedAccount && (
          <button
            className="btn-secondary flex items-center gap-2 self-start sm:self-auto"
            onClick={() => exportCSV(movimientos ?? [], `libro-mayor-${selectedAccount.codigo}`)}
          >
            <Download size={13} /> Exportar
          </button>
        )}
      </div>

      {/* Account + period selectors */}
      <div className="flex flex-wrap gap-3 items-start">
        <AccountSelector
          onSelect={account => setSelectedAccount(account)}
        />
        <select value={mes} onChange={e => setMes(Number(e.target.value))} className="input-field py-2 text-sm w-auto">
          {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="input-field py-2 text-sm w-auto">
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Prompt when no account selected */}
      {!selectedAccount && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Search size={36} className="text-[var(--cx-text-muted)]" />
          <p className="text-sm font-medium text-[var(--cx-text-secondary)]">Selecciona una cuenta para ver sus movimientos</p>
          <p className="text-xs text-[var(--cx-text-muted)]">Escribe un código o nombre en el campo de búsqueda de arriba</p>
        </div>
      )}

      {/* Content */}
      {selectedAccount && (
        <>
          {isLoading && <LoadingState />}
          {error && <ErrorState message={error?.message} />}

          {!isLoading && !error && cuenta && (
            <>
              <SummaryCard
                cuenta={cuenta}
                saldo_inicial={saldo_inicial ?? 0}
                saldo_final={saldo_final ?? 0}
                totalDebe={totalDebe}
                totalHaber={totalHaber}
              />
              <LedgerTable
                movimientos={movimientos ?? []}
                saldo_inicial={saldo_inicial ?? 0}
              />
            </>
          )}

          {/* Edge case: hook returned no cuenta but no error */}
          {!isLoading && !error && !cuenta && (
            <div className="text-sm text-[var(--cx-text-muted)] py-8 text-center">
              Sin información para la cuenta seleccionada en este período
            </div>
          )}
        </>
      )}
    </div>
  )
}
