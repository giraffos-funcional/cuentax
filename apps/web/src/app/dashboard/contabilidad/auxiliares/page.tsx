/**
 * CUENTAX — Auxiliares (Sub-Ledger)
 * Partners sub-ledger with tabs for Clientes, Proveedores, and Honorarios.
 */

'use client'

import { useState } from 'react'
import {
  Users, Truck, FileText, Loader2, AlertCircle,
  ChevronDown, ChevronRight, X,
} from 'lucide-react'
import { useAuxiliarPartners, useAuxiliarDetail } from '@/hooks'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
               'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

type TabKey = 'clientes' | 'proveedores' | 'honorarios'

const TABS: { key: TabKey; label: string; type: string; icon: typeof Users }[] = [
  { key: 'clientes', label: 'Clientes', type: 'asset_receivable', icon: Users },
  { key: 'proveedores', label: 'Proveedores', type: 'liability_payable', icon: Truck },
  { key: 'honorarios', label: 'Honorarios', type: 'expense', icon: FileText },
]

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando auxiliar...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando auxiliar'}</span>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Users size={32} className="text-[var(--cx-text-muted)]" />
      <p className="text-sm font-medium text-[var(--cx-text-secondary)]">No hay partners para este periodo</p>
      <p className="text-xs text-[var(--cx-text-muted)]">Cambia el periodo para ver mas resultados</p>
    </div>
  )
}

// ── Partner Detail Modal ──────────────────────────────────────
function DetailModal({
  partner,
  type,
  mes,
  year,
  onClose,
}: {
  partner: any
  type: string
  mes: number
  year: number
  onClose: () => void
}) {
  const { movimientos, saldo_final, isLoading, error } = useAuxiliarDetail(
    partner.id, type, mes, year,
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="card p-6 w-full max-w-3xl mx-4 shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-[var(--cx-text-primary)]">{partner.nombre ?? partner.name}</h2>
            <p className="text-xs text-[var(--cx-text-secondary)] mt-0.5">
              Movimientos del periodo {MESES[mes - 1]} {year}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors">
            <X size={14} />
          </button>
        </div>

        {isLoading && <LoadingState />}
        {error && <ErrorState message={error?.message} />}

        {!isLoading && !error && (
          <>
            {movimientos.length === 0 ? (
              <div className="py-8 text-center text-sm text-[var(--cx-text-muted)]">Sin movimientos en este periodo</div>
            ) : (
              <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-[var(--cx-border-light)] text-[9px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest bg-[var(--cx-bg-elevated)]">
                  <div className="col-span-2">Fecha</div>
                  <div className="col-span-2">Numero</div>
                  <div className="col-span-3">Descripcion</div>
                  <div className="col-span-2 text-right">Debe</div>
                  <div className="col-span-2 text-right">Haber</div>
                  <div className="col-span-1 text-right">Saldo</div>
                </div>

                <div className="divide-y divide-[var(--cx-border-light)]">
                  {movimientos.map((mov: any, i: number) => (
                    <div
                      key={mov.id ?? i}
                      className="grid grid-cols-12 gap-2 px-4 py-2.5 text-xs hover:bg-[var(--cx-hover-bg)] transition-colors"
                    >
                      <div className="col-span-2 font-mono text-[var(--cx-text-secondary)]">{mov.fecha ?? '-'}</div>
                      <div className="col-span-2 font-mono text-[var(--cx-text-secondary)]">{mov.numero ?? mov.name ?? '-'}</div>
                      <div className="col-span-3 text-[var(--cx-text-primary)] truncate">{mov.descripcion ?? mov.ref ?? '-'}</div>
                      <div className="col-span-2 text-right font-mono text-[var(--cx-text-primary)]">
                        {(mov.debe ?? mov.debit ?? 0) > 0 ? formatCLP(mov.debe ?? mov.debit) : '-'}
                      </div>
                      <div className="col-span-2 text-right font-mono text-[var(--cx-text-primary)]">
                        {(mov.haber ?? mov.credit ?? 0) > 0 ? formatCLP(mov.haber ?? mov.credit) : '-'}
                      </div>
                      <div className={`col-span-1 text-right font-mono text-sm ${
                        (mov.saldo ?? 0) < 0 ? 'text-[var(--cx-status-error-text)]' : 'text-[var(--cx-text-primary)]'
                      }`}>
                        {formatCLP(mov.saldo ?? 0)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)]">
                  <div className="col-span-9 text-xs font-bold text-[var(--cx-text-secondary)] uppercase">Saldo Final</div>
                  <div className={`col-span-3 text-right font-mono text-sm font-bold ${
                    saldo_final < 0 ? 'text-[var(--cx-status-error-text)]' : 'text-[var(--cx-text-primary)]'
                  }`}>
                    {formatCLP(saldo_final)}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="btn-secondary">Cerrar</button>
        </div>
      </div>
    </div>
  )
}

// ── Partners Table ────────────────────────────────────────────
function PartnersTable({
  type,
  mes,
  year,
}: {
  type: string
  mes: number
  year: number
}) {
  const { partners, isLoading, error } = useAuxiliarPartners(type, mes, year)
  const [selectedPartner, setSelectedPartner] = useState<any>(null)

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message={error?.message} />
  if (partners.length === 0) return <EmptyState />

  return (
    <>
      <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-[var(--cx-border-light)] text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest bg-[var(--cx-bg-elevated)]">
          <div className="col-span-4">Nombre</div>
          <div className="col-span-2 text-right">Debe</div>
          <div className="col-span-2 text-right">Haber</div>
          <div className="col-span-3 text-right">Saldo</div>
          <div className="col-span-1" />
        </div>

        <div className="divide-y divide-[var(--cx-border-light)]">
          {partners.map((p: any) => (
            <div
              key={p.id}
              className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors cursor-pointer group"
              onClick={() => setSelectedPartner(p)}
            >
              <div className="col-span-4 font-medium text-[var(--cx-text-primary)] truncate">{p.nombre ?? p.name}</div>
              <div className="col-span-2 text-right font-mono text-[var(--cx-text-primary)]">{formatCLP(p.debe ?? p.debit ?? 0)}</div>
              <div className="col-span-2 text-right font-mono text-[var(--cx-text-primary)]">{formatCLP(p.haber ?? p.credit ?? 0)}</div>
              <div className={`col-span-3 text-right font-mono font-semibold ${
                (p.saldo ?? 0) < 0 ? 'text-[var(--cx-status-error-text)]' : 'text-[var(--cx-text-primary)]'
              }`}>
                {formatCLP(p.saldo ?? 0)}
              </div>
              <div className="col-span-1 flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-[var(--cx-text-muted)]">
                <ChevronRight size={14} />
              </div>
            </div>
          ))}
        </div>

        {/* Footer count */}
        <div className="px-4 py-2.5 border-t border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)]">
          <span className="text-xs text-[var(--cx-text-muted)]">{partners.length} partner{partners.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedPartner && (
        <DetailModal
          partner={selectedPartner}
          type={type}
          mes={mes}
          year={year}
          onClose={() => setSelectedPartner(null)}
        />
      )}
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────
export default function AuxiliaresPage() {
  const now = new Date()
  const [tab, setTab] = useState<TabKey>('clientes')
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())

  const activeTab = TABS.find(t => t.key === tab)!

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Auxiliares</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">Sub-mayor por partner (clientes, proveedores, honorarios)</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={mes} onChange={e => setMes(Number(e.target.value))} className="input-field py-2 text-sm w-auto">
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="input-field py-2 text-sm w-auto">
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-[var(--cx-bg-elevated)] rounded-xl border border-[var(--cx-border-light)] w-fit">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                active
                  ? 'bg-white text-[var(--cx-active-text)] shadow-sm border border-[var(--cx-active-border)]'
                  : 'text-[var(--cx-text-secondary)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)]'
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <PartnersTable
        key={`${tab}-${mes}-${year}`}
        type={activeTab.type}
        mes={mes}
        year={year}
      />
    </div>
  )
}
