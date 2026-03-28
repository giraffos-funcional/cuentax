/**
 * CUENTAX — Estado de Resultados
 * Income statement / P&L — Ingresos, Gastos, Resultado.
 */

'use client'

import { useState } from 'react'
import { Download, Printer, TrendingUp, TrendingDown, Loader2, AlertCircle } from 'lucide-react'
import { useIncomeStatement } from '@/hooks'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
               'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando estado de resultados...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando estado de resultados'}</span>
    </div>
  )
}

function StatementRow({
  label,
  amount,
  bold,
  separator,
  indent,
}: {
  label: string
  amount: number
  bold?: boolean
  separator?: boolean
  indent?: boolean
}) {
  return (
    <div className={`flex justify-between items-center py-2.5 ${separator ? 'border-t border-[var(--cx-border-light)] mt-1 pt-3' : 'border-b border-[var(--cx-border-light)] last:border-0'}`}>
      <span className={`text-sm ${bold ? 'font-bold text-[var(--cx-text-primary)]' : 'text-[var(--cx-text-secondary)]'} ${indent ? 'pl-4' : ''}`}>
        {label}
      </span>
      <span className={`text-sm tabular-nums text-right min-w-[120px] ${bold ? 'font-bold text-[var(--cx-text-primary)]' : 'text-[var(--cx-text-primary)]'}`}>
        {formatCLP(amount)}
      </span>
    </div>
  )
}

function SectionHeader({ label, accent }: { label: string; accent: string }) {
  return (
    <div className={`px-5 py-2.5 border-b border-[var(--cx-border-light)] ${accent}`}>
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">{label}</h3>
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
export default function ResultadosPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const { resultados, isLoading, error } = useIncomeStatement(year, month)

  const utilidadNeta = resultados?.resultado.utilidad_neta ?? 0
  const isLoss = utilidadNeta < 0

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Estado de Resultados</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            Ingresos · Gastos · Resultado · {MESES[month - 1]} {year}
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
              if (!resultados) return
              exportCSV([
                { seccion: 'Ingresos', concepto: 'Ventas',                monto: resultados.ingresos.ventas },
                { seccion: 'Ingresos', concepto: 'Otros ingresos',        monto: resultados.ingresos.otros },
                { seccion: 'Ingresos', concepto: 'Total Ingresos',        monto: resultados.ingresos.total },
                { seccion: 'Gastos',   concepto: 'Costo de ventas',       monto: resultados.gastos.costo_ventas },
                { seccion: 'Gastos',   concepto: 'Gastos administrativos', monto: resultados.gastos.administrativos },
                { seccion: 'Gastos',   concepto: 'Depreciación',           monto: resultados.gastos.depreciacion },
                { seccion: 'Gastos',   concepto: 'Total Gastos',          monto: resultados.gastos.total },
                { seccion: 'Resultado', concepto: 'Utilidad bruta',       monto: resultados.resultado.utilidad_bruta },
                { seccion: 'Resultado', concepto: 'Utilidad neta',        monto: resultados.resultado.utilidad_neta },
              ], 'estado-resultados')
            }}
          >
            <Download size={13} /> Exportar
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error?.message} />}

      {!isLoading && !error && !resultados && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <TrendingUp size={36} className="text-[var(--cx-text-muted)]" />
          <p className="text-sm text-[var(--cx-text-muted)]">Sin datos para este período</p>
        </div>
      )}

      {!isLoading && !error && resultados && (
        <div className="max-w-2xl space-y-4">

          {/* INGRESOS */}
          <div className="card border border-[var(--cx-status-ok-border)] rounded-2xl overflow-hidden">
            <SectionHeader label="Ingresos" accent="bg-[var(--cx-status-ok-bg)]" />
            <div className="px-5 py-1">
              <StatementRow label="Ventas" amount={resultados.ingresos.ventas} indent />
              <StatementRow label="Otros ingresos" amount={resultados.ingresos.otros} indent />
            </div>
            <div className="flex justify-between items-center px-5 py-3 bg-[var(--cx-bg-elevated)] border-t border-[var(--cx-border-light)]">
              <span className="text-sm font-bold text-[var(--cx-text-primary)]">Total Ingresos</span>
              <span className="text-sm font-bold text-[var(--cx-status-ok-text)]">{formatCLP(resultados.ingresos.total)}</span>
            </div>
          </div>

          {/* GASTOS */}
          <div className="card border border-[var(--cx-status-error-border)] rounded-2xl overflow-hidden">
            <SectionHeader label="Gastos" accent="bg-[var(--cx-status-error-bg)]" />
            <div className="px-5 py-1">
              <StatementRow label="Costo de ventas" amount={resultados.gastos.costo_ventas} indent />
              <StatementRow label="Gastos administrativos" amount={resultados.gastos.administrativos} indent />
              <StatementRow label="Depreciación" amount={resultados.gastos.depreciacion} indent />
            </div>
            <div className="flex justify-between items-center px-5 py-3 bg-[var(--cx-bg-elevated)] border-t border-[var(--cx-border-light)]">
              <span className="text-sm font-bold text-[var(--cx-text-primary)]">Total Gastos</span>
              <span className="text-sm font-bold text-[var(--cx-status-error-text)]">{formatCLP(resultados.gastos.total)}</span>
            </div>
          </div>

          {/* RESULTADO */}
          <div className="card border-2 border-[var(--cx-active-border)] rounded-2xl overflow-hidden">
            <SectionHeader label="Resultado" accent="bg-[var(--cx-active-bg)]" />
            <div className="px-5 py-1">
              <StatementRow
                label="Utilidad bruta"
                amount={resultados.resultado.utilidad_bruta}
                indent
              />
            </div>
            {/* Utilidad / Pérdida neta — highlighted row */}
            <div className={`flex justify-between items-center px-5 py-5 border-t border-[var(--cx-border-light)] ${
              isLoss ? 'bg-[var(--cx-status-error-bg)]' : 'bg-[var(--cx-active-bg)]'
            }`}>
              <div className="flex items-center gap-2">
                {isLoss
                  ? <TrendingDown size={18} className="text-[var(--cx-status-error-text)]" />
                  : <TrendingUp size={18} className="text-[var(--cx-active-icon)]" />
                }
                <span className={`font-bold text-base ${isLoss ? 'text-[var(--cx-status-error-text)]' : 'text-[var(--cx-active-text)]'}`}>
                  {isLoss ? 'Pérdida Neta' : 'Utilidad Neta'}
                </span>
              </div>
              <span className={`font-bold text-2xl tabular-nums ${isLoss ? 'text-[var(--cx-status-error-text)]' : 'text-[var(--cx-active-icon)]'}`}>
                {isLoss ? '-' : ''}{formatCLP(Math.abs(utilidadNeta))}
              </span>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
