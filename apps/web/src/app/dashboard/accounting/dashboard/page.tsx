'use client'

/**
 * Accounting Dashboard — bird's-eye view of the business.
 * Combines Year Summary + P&L + Balance Sheet + Cash Flow + Budgets.
 */

import { useState } from 'react'
import {
  TrendingUp, TrendingDown, DollarSign, Scale, Activity, Target, Home,
  Loader2, ChevronRight, AlertCircle,
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  useYearSummary, usePnl, useBalanceSheetV2 as useBalanceSheet, useCashFlowV2 as useCashFlow, useBudgetVariance, useCostCenterPnl,
  useAlerts, useCompanyMetrics,
} from '@/hooks'
import { AlertTriangle, Info } from 'lucide-react'
import { useLocale } from '@/contexts/locale-context'

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16']

export default function AccountingDashboard() {
  const { fmtCurrency, country } = useLocale()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const today = new Date().toISOString().slice(0, 10)

  const { summary } = useYearSummary(year)
  const { pnl } = usePnl(year)
  const { report: bs } = useBalanceSheet(today)
  const { report: cf } = useCashFlow(year)
  const { report: variance } = useBudgetVariance(year)
  const { report: ccPnl } = useCostCenterPnl(year)
  const { alerts } = useAlerts()
  const { metrics } = useCompanyMetrics()

  const isCL = country === 'CL'
  const L = isCL
    ? { title: 'Dashboard Contable', subtitle: 'Vista consolidada del negocio', year: 'Año', cashFlow: 'Flujo de Caja', pnl: 'Estado de Resultados', balance: 'Balance', budget: 'Presupuesto', byCenter: 'Por Centro', revenue: 'Ingresos', expenses: 'Gastos', netIncome: 'Utilidad Neta', assets: 'Activos', liabilities: 'Pasivos', equity: 'Patrimonio', netCash: 'Flujo Neto', monthly: 'Por Mes', topVendors: 'Top Proveedores', expensesByCategory: 'Gastos por Categoría', revenueVsExpenses: 'Ingresos vs Gastos', profitByCenter: 'Utilidad por Centro', budgetVariance: 'Variación vs Presupuesto', favorable: 'Favorable', unfavorable: 'Desfavorable', planned: 'Presupuestado', actual: 'Real', loading: 'Cargando...', months: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'] }
    : { title: 'Accounting Dashboard', subtitle: 'Consolidated view of the business', year: 'Year', cashFlow: 'Cash Flow', pnl: 'Profit & Loss', balance: 'Balance Sheet', budget: 'Budget', byCenter: 'By Center', revenue: 'Revenue', expenses: 'Expenses', netIncome: 'Net Income', assets: 'Assets', liabilities: 'Liabilities', equity: 'Equity', netCash: 'Net Cash', monthly: 'Monthly', topVendors: 'Top Vendors', expensesByCategory: 'Expenses by Category', revenueVsExpenses: 'Revenue vs Expenses', profitByCenter: 'Profit by Center', budgetVariance: 'Budget Variance', favorable: 'Favorable', unfavorable: 'Unfavorable', planned: 'Planned', actual: 'Actual', loading: 'Loading...', months: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] }

  // Chart data
  const monthlyData = (summary?.monthly ?? []).map((m: any) => ({
    month: L.months[m.month - 1],
    [L.revenue]: m.deposits,
    [L.expenses]: m.payments,
    [L.netCash]: m.net,
  }))

  const topVendorsData = (summary?.top_vendors_by_spend ?? []).slice(0, 6).map((v: any) => ({
    name: v.vendor.length > 18 ? v.vendor.slice(0, 18) + '…' : v.vendor,
    value: v.total,
  }))

  const expenseCategoryData = (pnl?.expenses ?? []).slice(0, 8).map((e: any) => ({
    name: e.account.split(' ').slice(1, 3).join(' ') || e.account,
    value: -e.balance,
  })).filter((e: any) => e.value > 0)

  const costCenterData = (ccPnl?.by_center ?? []).filter((c: any) => c.cost_center_id)
    .map((c: any) => ({
      name: c.cost_center_name.length > 20 ? c.cost_center_name.slice(0, 20) + '…' : c.cost_center_name,
      [L.revenue]: c.total_revenue,
      [L.expenses]: c.total_expenses,
      [L.netIncome]: c.net_income,
    }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6" /> {L.title}
          </h1>
          <p className="text-sm text-zinc-400 mt-1">{L.subtitle}</p>
        </div>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
          {[currentYear, currentYear - 1, currentYear - 2].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Alerts banner */}
      {alerts.length > 0 && (
        <section className="space-y-2">
          {alerts.slice(0, 3).map((a: any) => {
            const sevColor = a.severity === 'critical' ? 'bg-red-500/10 border-red-500/30 text-red-300'
                          : a.severity === 'warning'  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                          : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
            const Icon = a.severity === 'critical' ? AlertTriangle : a.severity === 'warning' ? AlertCircle : Info
            const title = isCL ? a.title_es : a.title
            const detail = isCL ? a.detail_es : a.detail
            return (
              <div key={a.id} className={`rounded-lg border px-4 py-3 flex items-start gap-3 ${sevColor}`}>
                <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs opacity-75 mt-0.5">{detail}</p>
                </div>
                {a.action_href && (
                  <a href={a.action_href} className="text-xs font-medium hover:underline whitespace-nowrap">
                    {isCL ? 'Ver →' : 'View →'}
                  </a>
                )}
              </div>
            )
          })}
          {alerts.length > 3 && (
            <p className="text-xs text-zinc-500 pl-2">
              {isCL ? `Y ${alerts.length - 3} más alertas...` : `+${alerts.length - 3} more alerts`}
            </p>
          )}
        </section>
      )}

      {/* Metrics strip */}
      {metrics && (
        <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            <MiniKpi label={isCL ? 'Tx banco (año)' : 'Bank txs (year)'}
                     value={metrics.bank.this_year} />
            <MiniKpi label={isCL ? 'Pendientes' : 'Pending review'}
                     value={metrics.classification.pending} />
            <MiniKpi label={isCL ? 'Confianza IA' : 'AI confidence'}
                     value={`${(metrics.classification.avg_confidence * 100).toFixed(0)}%`} />
            <MiniKpi label={isCL ? 'Asientos posteados' : 'Posted entries'}
                     value={metrics.journal_entries.total_posted} />
            <MiniKpi label={isCL ? 'Costo IA aprox' : 'AI cost est.'}
                     value={`$${metrics.ai_cost_estimate.estimated_usd.toFixed(2)}`} />
          </div>
        </section>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Kpi icon={<TrendingUp className="w-4 h-4" />}   label={L.revenue}
             value={summary ? fmtCurrency(summary.total_deposits) : '—'}
             color="text-emerald-400" />
        <Kpi icon={<TrendingDown className="w-4 h-4" />} label={L.expenses}
             value={summary ? fmtCurrency(summary.total_payments) : '—'}
             color="text-red-400" />
        <Kpi icon={<DollarSign className="w-4 h-4" />}   label={L.netCash}
             value={summary ? fmtCurrency(summary.net_cash_flow) : '—'}
             color={(summary?.net_cash_flow ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'} />
        <Kpi icon={<Scale className="w-4 h-4" />}        label={L.assets}
             value={bs ? fmtCurrency(bs.total_assets) : '—'} color="text-blue-400" />
        <Kpi icon={<Scale className="w-4 h-4" />}        label={L.equity}
             value={bs ? fmtCurrency(bs.total_equity) : '—'} color="text-purple-400" />
        <Kpi icon={<Target className="w-4 h-4" />}       label={L.netIncome}
             value={pnl ? fmtCurrency(pnl.totals.net_income) : '—'}
             color={(pnl?.totals?.net_income ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'} />
      </div>

      {/* Revenue vs Expenses monthly */}
      <Panel title={L.revenueVsExpenses}>
        {monthlyData.length === 0 ? <EmptyState label={L.loading} /> : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="month" stroke="#888" fontSize={11} />
              <YAxis stroke="#888" fontSize={11} tickFormatter={(v) => fmtCurrency(v)} width={80} />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #333', fontSize: 12 }}
                formatter={(value: any) => fmtCurrency(value as number)}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey={L.revenue}   fill="#10b981" />
              <Bar dataKey={L.expenses}  fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>

      {/* Two-column: Top vendors pie + Expense categories pie */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Panel title={L.topVendors}>
          {topVendorsData.length === 0 ? <EmptyState label="—" /> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={topVendorsData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                     outerRadius={80} label={(e) => `${e.name}`} labelLine={false} fontSize={10}>
                  {topVendorsData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #333', fontSize: 12 }}
                         formatter={(v: any) => fmtCurrency(v as number)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title={L.expensesByCategory}>
          {expenseCategoryData.length === 0 ? <EmptyState label="—" /> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={expenseCategoryData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                     outerRadius={80} label={(e) => `${e.name}`} labelLine={false} fontSize={10}>
                  {expenseCategoryData.map((_: any, i: number) => <Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #333', fontSize: 12 }}
                         formatter={(v: any) => fmtCurrency(v as number)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      {/* Cost Centers breakdown */}
      {costCenterData.length > 0 && (
        <Panel title={L.profitByCenter}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={costCenterData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis type="number" stroke="#888" fontSize={11} tickFormatter={(v) => fmtCurrency(v)} />
              <YAxis type="category" dataKey="name" stroke="#888" fontSize={11} width={120} />
              <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #333', fontSize: 12 }}
                       formatter={(v: any) => fmtCurrency(v as number)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey={L.revenue}   fill="#10b981" />
              <Bar dataKey={L.expenses}  fill="#ef4444" />
              <Bar dataKey={L.netIncome} fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      )}

      {/* Budget variance */}
      {variance && variance.lines.length > 0 && (
        <Panel title={L.budgetVariance}>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <MiniStat label={L.planned}    value={fmtCurrency(variance.totals.total_budget)} color="text-zinc-300" />
            <MiniStat label={L.actual}     value={fmtCurrency(variance.totals.total_actual)} color="text-blue-400" />
            <MiniStat label={L.favorable + '/' + L.unfavorable}
                      value={`${variance.totals.favorable_count} / ${variance.totals.unfavorable_count}`}
                      color="text-zinc-300" />
          </div>
          <div className="overflow-x-auto max-h-[400px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-zinc-900">
                <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                  <th className="px-3 py-2">Cuenta</th>
                  <th className="px-3 py-2">{L.byCenter}</th>
                  <th className="px-3 py-2 text-right">{L.planned}</th>
                  <th className="px-3 py-2 text-right">{L.actual}</th>
                  <th className="px-3 py-2 text-right">Δ</th>
                  <th className="px-3 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {variance.lines.slice(0, 20).map((l: any, i: number) => (
                  <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-3 py-2 text-white">
                      <span className="font-mono text-xs text-zinc-500 mr-2">{l.account_code}</span>
                      {l.account_name || '—'}
                    </td>
                    <td className="px-3 py-2 text-zinc-400 text-xs">{l.cost_center_name || '—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-300">{fmtCurrency(l.budget_amount)}</td>
                    <td className="px-3 py-2 text-right font-mono text-blue-300">{fmtCurrency(l.actual_amount)}</td>
                    <td className={`px-3 py-2 text-right font-mono font-bold ${l.favorable ? 'text-emerald-400' : 'text-red-400'}`}>
                      {l.variance >= 0 ? '+' : ''}{fmtCurrency(l.variance)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {l.favorable
                        ? <span className="text-emerald-400 text-xs">✓ {L.favorable}</span>
                        : <span className="text-red-400 text-xs">⚠ {L.unfavorable}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickLink href="/dashboard/accounting/summary"          label={L.pnl}         icon={<Target className="w-5 h-5" />} />
        <QuickLink href="/dashboard/accounting/cost-center-pnl"  label={L.byCenter}    icon={<Home className="w-5 h-5" />} />
        <QuickLink href="/dashboard/accounting/budgets"           label={L.budget}      icon={<Activity className="w-5 h-5" />} />
        <QuickLink href="/dashboard/accounting/reports"           label={L.balance}     icon={<Scale className="w-5 h-5" />} />
      </div>
    </div>
  )
}

function MiniKpi({ label, value }: any) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-zinc-500 truncate">{label}</span>
      <span className="font-mono font-bold text-white shrink-0">{value}</span>
    </div>
  )
}

function Kpi({ icon, label, value, color }: any) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1">{icon}<span>{label}</span></div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  )
}

function MiniStat({ label, value, color }: any) {
  return (
    <div className="bg-zinc-800/50 rounded px-3 py-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  )
}

function Panel({ title, children }: any) {
  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <h2 className="text-sm font-medium text-white mb-4">{title}</h2>
      {children}
    </section>
  )
}

function EmptyState({ label }: any) {
  return (
    <div className="flex items-center justify-center py-16 text-zinc-600">
      <AlertCircle className="w-5 h-5 mr-2" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

function QuickLink({ href, label, icon }: any) {
  return (
    <a href={href}
      className="bg-zinc-900 border border-zinc-800 hover:border-blue-500 rounded-lg p-4 flex items-center justify-between group transition">
      <div className="flex items-center gap-2">
        <span className="text-blue-400">{icon}</span>
        <span className="text-sm text-white font-medium">{label}</span>
      </div>
      <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-blue-400" />
    </a>
  )
}
