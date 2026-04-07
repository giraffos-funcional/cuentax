/**
 * CUENTAX — Flujo de Caja (Cash Flow Forecast)
 * Historical + projected cash flow with line chart and breakdown table.
 */

'use client'

import { useState } from 'react'
import {
  TrendingUp, DollarSign, ArrowUpRight, ArrowDownRight,
  Loader2, AlertCircle, Download,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useCashFlow } from '@/hooks'
import { formatCLP, MONTHS } from '@/lib/formatters'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
               'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// ── Shared components ───────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando proyecciones...</span>
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

// ── KPI Card ────────────────────────────────────────────────

function KPICard({
  label, value, icon, accent,
}: {
  label: string
  value: number
  icon: React.ReactNode
  accent: string
}) {
  return (
    <div className="card border border-[var(--cx-border-light)] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>
          {icon}
        </div>
      </div>
      <div className="text-xl font-bold text-[var(--cx-text-primary)] tabular-nums">
        {formatCLP(value)}
      </div>
    </div>
  )
}

// ── CSV export helper ───────────────────────────────────────

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

// ── Custom tooltip for chart ────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[var(--cx-bg-surface)] border border-[var(--cx-border-light)] rounded-xl p-3 shadow-lg text-xs">
      <p className="font-semibold text-[var(--cx-text-primary)] mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex justify-between gap-4" style={{ color: p.color }}>
          <span>{p.name}:</span>
          <span className="font-semibold tabular-nums">{formatCLP(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────

export default function FlujoCajaPage() {
  const [monthsAhead, setMonthsAhead] = useState(6)
  const {
    saldo_actual, por_cobrar, por_pagar,
    historico, proyeccion, isLoading, error,
  } = useCashFlow(monthsAhead)

  // Build unified chart data
  const chartData = [
    ...historico.map((h: any) => ({
      label: `${MESES[h.month - 1]} ${String(h.year).slice(2)}`,
      saldo_real: h.saldo_proyectado,
      saldo_proyectado: null as number | null,
    })),
    // Bridge point: last historical = first projected
    ...(historico.length > 0 && proyeccion.length > 0
      ? [{
          label: `${MESES[historico[historico.length - 1].month - 1]} ${String(historico[historico.length - 1].year).slice(2)}`,
          saldo_real: null as number | null,
          saldo_proyectado: historico[historico.length - 1].saldo_proyectado,
        }]
      : []),
    ...proyeccion.map((p: any) => ({
      label: `${MESES[p.month - 1]} ${String(p.year).slice(2)}`,
      saldo_real: null as number | null,
      saldo_proyectado: p.saldo_proyectado,
    })),
  ]

  // Combine all rows for the breakdown table
  const allPeriods = [
    ...historico.map((h: any) => ({ ...h, tipo: 'historico' })),
    ...proyeccion.map((p: any) => ({ ...p, tipo: 'proyeccion' })),
  ]

  // CSV export data
  const csvData = allPeriods.map((p: any) => ({
    periodo: p.label,
    tipo: p.tipo === 'historico' ? 'Historico' : 'Proyeccion',
    ingresos: p.ingresos,
    gastos_fijos: p.gastos_fijos,
    gastos_variables: p.gastos_variables,
    remuneraciones: p.remuneraciones,
    impuestos: p.impuestos,
    saldo: p.saldo_proyectado,
  }))

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)] flex items-center gap-2">
            <TrendingUp size={20} className="text-[var(--cx-active-icon)]" />
            Flujo de Caja
          </h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            Proyeccion de flujo de caja basado en datos historicos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--cx-text-muted)]">Proyectar</label>
          <select
            value={monthsAhead}
            onChange={e => setMonthsAhead(Number(e.target.value))}
            className="input-field py-2 text-sm w-auto"
          >
            <option value={3}>3 meses</option>
            <option value={6}>6 meses</option>
            <option value={9}>9 meses</option>
            <option value={12}>12 meses</option>
          </select>
          <button
            className="btn-secondary flex items-center gap-2 text-xs py-1.5 px-3"
            onClick={() => exportCSV(csvData, 'flujo-caja')}
            disabled={allPeriods.length === 0}
          >
            <Download size={12} /> CSV
          </button>
        </div>
      </div>

      {isLoading && <LoadingState />}
      {error && <ErrorState />}

      {!isLoading && !error && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KPICard
              label="Saldo Actual"
              value={saldo_actual}
              icon={<DollarSign size={16} className="text-[var(--cx-active-icon)]" />}
              accent="bg-[var(--cx-active-bg)]"
            />
            <KPICard
              label="Por Cobrar"
              value={por_cobrar}
              icon={<ArrowUpRight size={16} className="text-[var(--cx-status-ok-text)]" />}
              accent="bg-[var(--cx-status-ok-bg)]"
            />
            <KPICard
              label="Por Pagar"
              value={por_pagar}
              icon={<ArrowDownRight size={16} className="text-[var(--cx-status-error-text)]" />}
              accent="bg-[var(--cx-status-error-bg)]"
            />
          </div>

          {/* Line Chart */}
          {chartData.length > 0 && (
            <div className="card border border-[var(--cx-border-light)] rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-[var(--cx-text-primary)] mb-5">
                Saldo Proyectado
              </h3>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--cx-border)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'var(--cx-text-secondary)', fontSize: 11 }}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--cx-text-secondary)', fontSize: 11 }}
                    axisLine={false}
                    tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: 'var(--cx-text-muted)' }} />
                  <Line
                    type="monotone"
                    dataKey="saldo_real"
                    name="Saldo Real"
                    stroke="#7c3aed"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#7c3aed' }}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="saldo_proyectado"
                    name="Saldo Proyectado"
                    stroke="#4f46e5"
                    strokeWidth={2}
                    strokeDasharray="8 4"
                    dot={{ r: 3, fill: '#4f46e5' }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Breakdown Table */}
          <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--cx-border-light)]">
              <h3 className="text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest">
                Desglose Mensual
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-[var(--cx-border-light)]">
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest">Periodo</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest">Ingresos</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest">G. Fijos</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest">G. Variables</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest">Remuner.</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest">Impuestos</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--cx-border-light)]">
                  {allPeriods.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--cx-text-muted)]">
                        Sin datos disponibles
                      </td>
                    </tr>
                  ) : (
                    allPeriods.map((p: any, i: number) => {
                      const isProjected = p.tipo === 'proyeccion'
                      return (
                        <tr
                          key={`${p.year}-${p.month}`}
                          className={`hover:bg-[var(--cx-hover-bg)] transition-colors ${isProjected ? 'bg-[var(--cx-bg-elevated)]' : ''}`}
                        >
                          <td className={`px-4 py-3 text-sm ${isProjected ? 'italic text-[var(--cx-text-secondary)]' : 'text-[var(--cx-text-primary)] font-medium'}`}>
                            {p.label}
                            {isProjected && (
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[var(--cx-status-warn-bg)] text-[var(--cx-status-warn-text)] border border-[var(--cx-status-warn-border)]">
                                Proy.
                              </span>
                            )}
                          </td>
                          <td className={`px-4 py-3 text-sm text-right tabular-nums ${isProjected ? 'italic text-[var(--cx-text-secondary)]' : 'text-[var(--cx-status-ok-text)]'}`}>
                            {formatCLP(p.ingresos)}
                          </td>
                          <td className={`px-4 py-3 text-sm text-right tabular-nums ${isProjected ? 'italic text-[var(--cx-text-secondary)]' : 'text-[var(--cx-text-primary)]'}`}>
                            {formatCLP(p.gastos_fijos)}
                          </td>
                          <td className={`px-4 py-3 text-sm text-right tabular-nums ${isProjected ? 'italic text-[var(--cx-text-secondary)]' : 'text-[var(--cx-text-primary)]'}`}>
                            {formatCLP(p.gastos_variables)}
                          </td>
                          <td className={`px-4 py-3 text-sm text-right tabular-nums ${isProjected ? 'italic text-[var(--cx-text-secondary)]' : 'text-[var(--cx-text-primary)]'}`}>
                            {formatCLP(p.remuneraciones)}
                          </td>
                          <td className={`px-4 py-3 text-sm text-right tabular-nums ${isProjected ? 'italic text-[var(--cx-text-secondary)]' : 'text-[var(--cx-text-primary)]'}`}>
                            {formatCLP(p.impuestos)}
                          </td>
                          <td className={`px-4 py-3 text-sm text-right tabular-nums font-semibold ${
                            isProjected
                              ? 'italic text-[var(--cx-text-secondary)]'
                              : p.saldo_proyectado >= 0
                                ? 'text-[var(--cx-status-ok-text)]'
                                : 'text-[var(--cx-status-error-text)]'
                          }`}>
                            {formatCLP(p.saldo_proyectado)}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--cx-status-warn-bg)] border border-[var(--cx-status-warn-border)]">
            <AlertCircle size={14} className="text-[var(--cx-status-warn-text)] shrink-0" />
            <span className="text-[var(--cx-status-warn-text)] text-xs">
              Las proyecciones se basan en promedios historicos de los ultimos 6 meses. Los valores reales pueden variar.
            </span>
          </div>
        </>
      )}
    </div>
  )
}
