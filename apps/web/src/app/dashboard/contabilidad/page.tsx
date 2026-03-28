/**
 * CUENTAX — Panel Contable
 * Financial summary dashboard: balance, income statement, ratios, tax status.
 */

'use client'

import { useState } from 'react'
import {
  TrendingUp, TrendingDown, DollarSign, Landmark, Receipt,
  Loader2, AlertCircle, PieChart, Scale, Percent, BarChart3,
  CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { useBalanceSheet, useIncomeStatement, useF29 } from '@/hooks'

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const formatPct = (n: number) =>
  isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(1)}%` : 'N/A'

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando datos contables...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando datos contables'}</span>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <PieChart size={32} className="text-[var(--cx-text-muted)]" />
      <p className="text-sm font-medium text-[var(--cx-text-secondary)]">No hay datos contables para el periodo seleccionado</p>
      <p className="text-xs text-[var(--cx-text-muted)]">Verifica que existan asientos contables en Odoo</p>
    </div>
  )
}

// ── KPI Card ─────────────────────────────────────────────
interface KPICardProps {
  icon: React.ReactNode
  label: string
  value: string
  color?: 'default' | 'green' | 'red'
}

function KPICard({ icon, label, value, color = 'default' }: KPICardProps) {
  const colorMap = {
    default: 'text-[var(--cx-text-primary)]',
    green: 'text-[var(--cx-status-ok-text)]',
    red: 'text-[var(--cx-status-error-text)]',
  }
  return (
    <div className="card border border-[var(--cx-border-light)] rounded-2xl p-5 flex flex-col gap-3">
      <span className="text-[var(--cx-text-muted)]">{icon}</span>
      <div>
        <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-widest font-semibold">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${colorMap[color]}`}>{value}</p>
      </div>
    </div>
  )
}

// ── Ratio Card ───────────────────────────────────────────
function RatioCard({ label, value, description, status }: {
  label: string
  value: string
  description: string
  status: 'ok' | 'warn' | 'error' | 'neutral'
}) {
  const statusStyles = {
    ok: 'border-[var(--cx-status-ok-border)] bg-[var(--cx-status-ok-bg)]',
    warn: 'border-[var(--cx-status-warn-border)] bg-[var(--cx-status-warn-bg)]',
    error: 'border-[var(--cx-status-error-border)] bg-[var(--cx-status-error-bg)]',
    neutral: 'border-[var(--cx-border-light)] bg-[var(--cx-bg-surface)]',
  }
  const textStyles = {
    ok: 'text-[var(--cx-status-ok-text)]',
    warn: 'text-[var(--cx-status-warn-text)]',
    error: 'text-[var(--cx-status-error-text)]',
    neutral: 'text-[var(--cx-text-primary)]',
  }
  return (
    <div className={`rounded-2xl border p-4 ${statusStyles[status]}`}>
      <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-widest font-semibold">{label}</p>
      <p className={`text-xl font-bold mt-1 ${textStyles[status]}`}>{value}</p>
      <p className="text-xs text-[var(--cx-text-muted)] mt-1">{description}</p>
    </div>
  )
}

// ── Balance Row ──────────────────────────────────────────
function BalanceRow({ label, amount, bold }: { label: string; amount: number; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 ${bold ? 'border-t border-[var(--cx-border-light)] pt-3 mt-1' : ''}`}>
      <span className={`text-sm ${bold ? 'font-semibold text-[var(--cx-text-primary)]' : 'text-[var(--cx-text-secondary)]'}`}>{label}</span>
      <span className={`text-sm font-mono ${bold ? 'font-bold text-[var(--cx-text-primary)]' : 'text-[var(--cx-text-secondary)]'}`}>
        {formatCLP(amount)}
      </span>
    </div>
  )
}

// ── Statement Row ────────────────────────────────────────
function StatementRow({ label, amount, bold, negative }: { label: string; amount: number; bold?: boolean; negative?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${bold ? 'border-t border-[var(--cx-border-light)] pt-2 mt-1' : ''}`}>
      <span className={`text-sm ${bold ? 'font-semibold text-[var(--cx-text-primary)]' : 'text-[var(--cx-text-secondary)]'}`}>{label}</span>
      <span className={`text-sm font-mono ${
        bold ? 'font-bold' : ''
      } ${negative ? 'text-[var(--cx-status-error-text)]' : 'text-[var(--cx-text-primary)]'}`}>
        {formatCLP(amount)}
      </span>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────
export default function ContabilidadDashboardPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const { balance, isLoading: loadingBalance, error: errorBalance } = useBalanceSheet(year, month)
  const { resultados, isLoading: loadingResults, error: errorResults } = useIncomeStatement(year, month)
  const { f29, isLoading: loadingF29, error: errorF29 } = useF29(month, year)

  const isLoading = loadingBalance || loadingResults || loadingF29
  const error = errorBalance || errorResults || errorF29
  const hasData = balance || resultados

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  // ── Computed ratios ──
  const razonCorriente = balance && balance.pasivos?.corrientes
    ? balance.activos.corrientes / balance.pasivos.corrientes : 0
  const endeudamiento = balance && balance.patrimonio?.total
    ? balance.pasivos.total / balance.patrimonio.total : 0
  const margenNeto = resultados && resultados.ingresos?.total
    ? (resultados.resultado.utilidad_neta / resultados.ingresos.total) * 100 : 0
  const roa = balance && resultados && balance.activos?.total
    ? (resultados.resultado.utilidad_neta / balance.activos.total) * 100 : 0

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Panel Contable</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">Resumen financiero del periodo</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="input-field py-2 text-sm w-auto"
          >
            {MONTHS.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="input-field py-2 text-sm w-auto"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading / Error */}
      {isLoading && <LoadingState />}
      {!isLoading && error && <ErrorState message={error?.message} />}
      {!isLoading && !error && !hasData && <EmptyState />}

      {!isLoading && !error && hasData && (
        <>
          {/* Section 1: KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <KPICard
              icon={<TrendingUp size={20} />}
              label="Ingresos"
              value={formatCLP(resultados?.ingresos?.total ?? 0)}
              color="green"
            />
            <KPICard
              icon={<TrendingDown size={20} />}
              label="Gastos"
              value={formatCLP(resultados?.gastos?.total ?? 0)}
              color="red"
            />
            <KPICard
              icon={<DollarSign size={20} />}
              label="Utilidad Neta"
              value={formatCLP(resultados?.resultado?.utilidad_neta ?? 0)}
              color={(resultados?.resultado?.utilidad_neta ?? 0) >= 0 ? 'green' : 'red'}
            />
            <KPICard
              icon={<Landmark size={20} />}
              label="Total Activos"
              value={formatCLP(balance?.activos?.total ?? 0)}
            />
            <KPICard
              icon={<Receipt size={20} />}
              label="IVA por Pagar"
              value={formatCLP(f29?.total_a_pagar ?? 0)}
              color={(f29?.total_a_pagar ?? 0) > 0 ? 'red' : 'green'}
            />
          </div>

          {/* Section 2: Balance Resumido */}
          {balance && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Activos */}
              <div className="card border border-[var(--cx-border-light)] rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-[var(--cx-status-ok-text)]" />
                  <h3 className="text-sm font-semibold text-[var(--cx-text-primary)] uppercase tracking-wider">Activos</h3>
                </div>
                <BalanceRow label="Activos Corrientes" amount={balance.activos.corrientes} />
                <BalanceRow label="Activos No Corrientes" amount={balance.activos.no_corrientes} />
                <BalanceRow label="Total Activos" amount={balance.activos.total} bold />
              </div>

              {/* Pasivos + Patrimonio */}
              <div className="card border border-[var(--cx-border-light)] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[var(--cx-status-error-text)]" />
                    <h3 className="text-sm font-semibold text-[var(--cx-text-primary)] uppercase tracking-wider">Pasivos + Patrimonio</h3>
                  </div>
                  {balance.cuadra ? (
                    <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-xl bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border border-[var(--cx-status-ok-border)]">
                      <CheckCircle2 size={10} /> Cuadra
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-xl bg-[var(--cx-status-warn-bg)] text-[var(--cx-status-warn-text)] border border-[var(--cx-status-warn-border)]">
                      <AlertTriangle size={10} /> Descuadre
                    </span>
                  )}
                </div>
                <BalanceRow label="Pasivos Corrientes" amount={balance.pasivos.corrientes} />
                <BalanceRow label="Pasivos No Corrientes" amount={balance.pasivos.no_corrientes} />
                <BalanceRow label="Total Pasivos" amount={balance.pasivos.total} bold />
                <div className="mt-3 pt-2 border-t border-[var(--cx-border-lighter)]">
                  <BalanceRow label="Capital" amount={balance.patrimonio.capital} />
                  <BalanceRow label="Resultado del Ejercicio" amount={balance.patrimonio.resultado} />
                  <BalanceRow label="Total Patrimonio" amount={balance.patrimonio.total} bold />
                </div>
              </div>
            </div>
          )}

          {/* Section 3: Estado de Resultados Mini */}
          {resultados && (
            <div className="card border border-[var(--cx-border-light)] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-[var(--cx-text-primary)] uppercase tracking-wider">Estado de Resultados</h3>
                {(resultados.resultado.utilidad_neta ?? 0) >= 0 ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-[var(--cx-status-ok-text)]">
                    <TrendingUp size={14} /> Utilidad
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-semibold text-[var(--cx-status-error-text)]">
                    <TrendingDown size={14} /> Perdida
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <StatementRow label="Ventas" amount={resultados.ingresos.ventas} />
                  <StatementRow label="Otros Ingresos" amount={resultados.ingresos.otros} />
                  <StatementRow label="Total Ingresos" amount={resultados.ingresos.total} bold />
                </div>
                <div>
                  <StatementRow label="Costo de Ventas" amount={resultados.gastos.costo_ventas} negative />
                  <StatementRow label="Gastos Administrativos" amount={resultados.gastos.administrativos} negative />
                  <StatementRow label="Gastos Financieros" amount={resultados.gastos.financieros} negative />
                  <StatementRow label="Total Gastos" amount={resultados.gastos.total} bold negative />
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-[var(--cx-border-light)] flex items-center justify-between">
                <div>
                  <p className="text-xs text-[var(--cx-text-muted)]">Utilidad Bruta</p>
                  <p className="text-lg font-bold text-[var(--cx-text-primary)]">{formatCLP(resultados.resultado.utilidad_bruta)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--cx-text-muted)]">Utilidad Neta</p>
                  <p className={`text-lg font-bold ${(resultados.resultado.utilidad_neta ?? 0) >= 0 ? 'text-[var(--cx-status-ok-text)]' : 'text-[var(--cx-status-error-text)]'}`}>
                    {formatCLP(resultados.resultado.utilidad_neta)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--cx-text-muted)]">Margen Neto</p>
                  <p className={`text-lg font-bold ${margenNeto >= 0 ? 'text-[var(--cx-status-ok-text)]' : 'text-[var(--cx-status-error-text)]'}`}>
                    {formatPct(margenNeto)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Section 4: Ratios Financieros */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--cx-text-muted)] uppercase tracking-wider mb-3">Ratios Financieros</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <RatioCard
                label="Razon Corriente"
                value={isFinite(razonCorriente) ? razonCorriente.toFixed(2) : 'N/A'}
                description="Activos Corrientes / Pasivos Corrientes"
                status={razonCorriente >= 1.5 ? 'ok' : razonCorriente >= 1 ? 'warn' : 'error'}
              />
              <RatioCard
                label="Endeudamiento"
                value={isFinite(endeudamiento) ? endeudamiento.toFixed(2) : 'N/A'}
                description="Pasivos / Patrimonio"
                status={endeudamiento <= 1 ? 'ok' : endeudamiento <= 2 ? 'warn' : 'error'}
              />
              <RatioCard
                label="Margen Neto"
                value={formatPct(margenNeto)}
                description="Utilidad Neta / Ingresos"
                status={margenNeto > 10 ? 'ok' : margenNeto > 0 ? 'warn' : 'error'}
              />
              <RatioCard
                label="ROA"
                value={formatPct(roa)}
                description="Utilidad Neta / Total Activos"
                status={roa > 5 ? 'ok' : roa > 0 ? 'warn' : 'error'}
              />
            </div>
          </div>

          {/* Section 5: Situacion Tributaria */}
          {f29 && (
            <div className="card border border-[var(--cx-border-light)] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-[var(--cx-text-primary)] uppercase tracking-wider">Situacion Tributaria (F29)</h3>
                {(f29.total_a_pagar ?? 0) <= 0 ? (
                  <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-xl bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border border-[var(--cx-status-ok-border)]">
                    <CheckCircle2 size={10} /> Credito a favor
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-xl bg-[var(--cx-status-warn-bg)] text-[var(--cx-status-warn-text)] border border-[var(--cx-status-warn-border)]">
                    <AlertTriangle size={10} /> Impuesto por pagar
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-widest font-semibold">Debito Fiscal</p>
                  <p className="text-lg font-bold text-[var(--cx-text-primary)] mt-1">{formatCLP(f29.debito_fiscal ?? 0)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-widest font-semibold">Credito Fiscal</p>
                  <p className="text-lg font-bold text-[var(--cx-status-ok-text)] mt-1">{formatCLP(f29.credito_fiscal ?? 0)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-widest font-semibold">PPM</p>
                  <p className="text-lg font-bold text-[var(--cx-text-primary)] mt-1">{formatCLP(f29.ppm ?? 0)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-widest font-semibold">Total a Pagar</p>
                  <p className={`text-lg font-bold mt-1 ${(f29.total_a_pagar ?? 0) > 0 ? 'text-[var(--cx-status-error-text)]' : 'text-[var(--cx-status-ok-text)]'}`}>
                    {formatCLP(f29.total_a_pagar ?? 0)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
