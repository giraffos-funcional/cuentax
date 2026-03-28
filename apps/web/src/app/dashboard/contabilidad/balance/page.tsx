/**
 * CUENTAX — Balance General
 * Financial position statement (Activos / Pasivos / Patrimonio).
 */

'use client'

import { useState } from 'react'
import { Download, Printer, CheckCircle2, XCircle, Loader2, AlertCircle, Scale } from 'lucide-react'
import { useBalanceSheet } from '@/hooks'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
               'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando balance...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando balance'}</span>
    </div>
  )
}

function SectionRow({ label, amount, bold }: { label: string; amount: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between items-center py-2.5 border-b border-[var(--cx-border-light)] last:border-0 ${bold ? 'font-bold' : ''}`}>
      <span className={`text-sm ${bold ? 'text-[var(--cx-text-primary)]' : 'text-[var(--cx-text-secondary)]'}`}>
        {label}
      </span>
      <span className={`text-sm tabular-nums ${bold ? 'text-[var(--cx-text-primary)]' : 'text-[var(--cx-text-primary)]'}`}>
        {formatCLP(amount)}
      </span>
    </div>
  )
}

function SectionCard({
  title,
  accent,
  rows,
  total,
  totalLabel,
}: {
  title: string
  accent: string
  rows: { label: string; amount: number }[]
  total: number
  totalLabel: string
}) {
  return (
    <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
      <div className={`px-5 py-3 border-b border-[var(--cx-border-light)] ${accent}`}>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">{title}</h3>
      </div>
      <div className="px-5 py-1">
        {rows.map(r => (
          <SectionRow key={r.label} label={r.label} amount={r.amount} />
        ))}
      </div>
      <div className="flex justify-between items-center px-5 py-3 bg-[var(--cx-bg-elevated)] border-t border-[var(--cx-border-light)]">
        <span className="text-sm font-bold text-[var(--cx-text-primary)]">{totalLabel}</span>
        <span className="text-sm font-bold text-[var(--cx-active-icon)]">{formatCLP(total)}</span>
      </div>
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
export default function BalancePage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const { balance, isLoading, error } = useBalanceSheet(year, month)

  const totalPasivoPatrimonio = balance
    ? balance.pasivos.total + balance.patrimonio.total
    : 0

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Balance General</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            Estado de situación financiera · {MESES[month - 1]} {year}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="input-field py-2 text-sm w-auto"
          >
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="input-field py-2 text-sm w-auto"
          >
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="btn-secondary flex items-center gap-2" onClick={() => window.print()}>
            <Printer size={13} /> Imprimir
          </button>
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={() => {
              if (!balance) return
              exportCSV([
                { seccion: 'Activos', concepto: 'Activos corrientes',       monto: balance.activos.corrientes },
                { seccion: 'Activos', concepto: 'Activos no corrientes',    monto: balance.activos.no_corrientes },
                { seccion: 'Activos', concepto: 'Total Activos',            monto: balance.activos.total },
                { seccion: 'Pasivos', concepto: 'Pasivos corrientes',       monto: balance.pasivos.corrientes },
                { seccion: 'Pasivos', concepto: 'Pasivos no corrientes',    monto: balance.pasivos.no_corrientes },
                { seccion: 'Pasivos', concepto: 'Total Pasivos',            monto: balance.pasivos.total },
                { seccion: 'Patrimonio', concepto: 'Capital',               monto: balance.patrimonio.capital },
                { seccion: 'Patrimonio', concepto: 'Resultado del ejercicio', monto: balance.patrimonio.resultado },
                { seccion: 'Patrimonio', concepto: 'Total Patrimonio',      monto: balance.patrimonio.total },
              ], 'balance-general')
            }}
          >
            <Download size={13} /> Exportar
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error?.message} />}

      {!isLoading && !error && !balance && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <Scale size={36} className="text-[var(--cx-text-muted)]" />
          <p className="text-sm text-[var(--cx-text-muted)]">Sin datos para este período</p>
        </div>
      )}

      {!isLoading && !error && balance && (
        <div className="space-y-5">
          {/* Two-column layout on desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left: Activos */}
            <div className="space-y-4">
              <SectionCard
                title="Activos Corrientes"
                accent="bg-[var(--cx-bg-elevated)]"
                rows={[{ label: 'Activos corrientes', amount: balance.activos.corrientes }]}
                total={balance.activos.corrientes}
                totalLabel="Total Activos Corrientes"
              />
              <SectionCard
                title="Activos No Corrientes"
                accent="bg-[var(--cx-bg-elevated)]"
                rows={[{ label: 'Activos no corrientes', amount: balance.activos.no_corrientes }]}
                total={balance.activos.no_corrientes}
                totalLabel="Total Activos No Corrientes"
              />
              {/* Total Activos */}
              <div className="flex justify-between items-center px-5 py-4 rounded-2xl border-2 border-[var(--cx-active-border)] bg-[var(--cx-active-bg)]">
                <span className="font-bold text-[var(--cx-active-text)]">TOTAL ACTIVOS</span>
                <span className="font-bold text-lg text-[var(--cx-active-icon)]">{formatCLP(balance.activos.total)}</span>
              </div>
            </div>

            {/* Right: Pasivos + Patrimonio */}
            <div className="space-y-4">
              <SectionCard
                title="Pasivos Corrientes"
                accent="bg-[var(--cx-bg-elevated)]"
                rows={[{ label: 'Pasivos corrientes', amount: balance.pasivos.corrientes }]}
                total={balance.pasivos.corrientes}
                totalLabel="Total Pasivos Corrientes"
              />
              <SectionCard
                title="Pasivos No Corrientes"
                accent="bg-[var(--cx-bg-elevated)]"
                rows={[{ label: 'Pasivos no corrientes', amount: balance.pasivos.no_corrientes }]}
                total={balance.pasivos.no_corrientes}
                totalLabel="Total Pasivos No Corrientes"
              />
              <SectionCard
                title="Patrimonio"
                accent="bg-[var(--cx-bg-elevated)]"
                rows={[
                  { label: 'Capital', amount: balance.patrimonio.capital },
                  { label: 'Resultado del ejercicio', amount: balance.patrimonio.resultado },
                ]}
                total={balance.patrimonio.total}
                totalLabel="Total Patrimonio"
              />
              {/* Total Pasivos + Patrimonio */}
              <div className="flex justify-between items-center px-5 py-4 rounded-2xl border-2 border-[var(--cx-active-border)] bg-[var(--cx-active-bg)]">
                <span className="font-bold text-[var(--cx-active-text)]">TOTAL PASIVOS + PATRIMONIO</span>
                <span className="font-bold text-lg text-[var(--cx-active-icon)]">{formatCLP(totalPasivoPatrimonio)}</span>
              </div>
            </div>
          </div>

          {/* Balance check */}
          <div className={`flex items-center gap-3 p-4 rounded-2xl border ${
            balance.cuadra
              ? 'bg-[var(--cx-status-ok-bg)] border-[var(--cx-status-ok-border)]'
              : 'bg-[var(--cx-status-error-bg)] border-[var(--cx-status-error-border)]'
          }`}>
            {balance.cuadra ? (
              <CheckCircle2 size={20} className="text-[var(--cx-status-ok-text)] shrink-0" />
            ) : (
              <XCircle size={20} className="text-[var(--cx-status-error-text)] shrink-0" />
            )}
            <div>
              <p className={`text-sm font-semibold ${balance.cuadra ? 'text-[var(--cx-status-ok-text)]' : 'text-[var(--cx-status-error-text)]'}`}>
                {balance.cuadra ? 'El balance cuadra correctamente' : 'El balance no cuadra — revisar asientos'}
              </p>
              <p className="text-xs text-[var(--cx-text-muted)] mt-0.5">
                Activos {formatCLP(balance.activos.total)} · Pasivos + Patrimonio {formatCLP(totalPasivoPatrimonio)}
                {!balance.cuadra && ` · Diferencia ${formatCLP(Math.abs(balance.activos.total - totalPasivoPatrimonio))}`}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
