'use client'

/**
 * Accounting — Year Summary + P&L (CL + US)
 * Shows executive dashboard: monthly cash flow, top vendors/income,
 * and accrual P&L computed from posted journal entries. PDF download.
 */

import { useState } from 'react'
import {
  Loader2, Download, Calendar, TrendingUp, TrendingDown,
  DollarSign, FileText, BarChart3,
} from 'lucide-react'
import { useYearSummary, usePnl, downloadPnlPdf } from '@/hooks'
import { useLocale } from '@/contexts/locale-context'

export default function SummaryPage() {
  const { fmtCurrency, country } = useLocale()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState<number | ''>('')
  const { summary, isLoading: loadingSummary } = useYearSummary(year)
  const { pnl, isLoading: loadingPnl } = usePnl(year, month === '' ? undefined : Number(month))
  const [pdfLoading, setPdfLoading] = useState(false)

  const isCL = country === 'CL'
  const L = isCL
    ? {
        title: 'Resumen Anual',
        subtitle: 'Flujo de caja del año desde movimientos bancarios, y Estado de Resultados desde asientos contabilizados.',
        year: 'Año',
        month: 'Mes',
        allMonths: 'Todo el año',
        cashFlow: 'Flujo de Caja',
        transactions: 'Transacciones',
        deposits: 'Abonos',
        payments: 'Cargos',
        netCash: 'Flujo Neto',
        monthly: 'Por Mes',
        topVendors: 'Top Proveedores por Gasto',
        topIncome: 'Top Fuentes de Ingreso',
        pnl: 'Estado de Resultados',
        pnlSubtitle: 'Calculado desde asientos contabilizados en Odoo',
        revenue: 'Ingresos',
        expenses: 'Gastos',
        netIncome: 'Utilidad Neta',
        netLoss: 'Pérdida Neta',
        downloadPdf: 'Descargar PDF',
        noPnl: 'No hay asientos contabilizados para este período.',
        empty: 'Sin datos',
        months: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
      }
    : {
        title: 'Year Summary',
        subtitle: 'Cash flow from bank activity, and P&L from posted journal entries.',
        year: 'Year',
        month: 'Month',
        allMonths: 'Full year',
        cashFlow: 'Cash Flow',
        transactions: 'Transactions',
        deposits: 'Deposits',
        payments: 'Payments',
        netCash: 'Net Cash Flow',
        monthly: 'Monthly',
        topVendors: 'Top Vendors by Spend',
        topIncome: 'Top Income Sources',
        pnl: 'Profit & Loss',
        pnlSubtitle: 'Computed from journal entries posted in Odoo',
        revenue: 'Revenue',
        expenses: 'Expenses',
        netIncome: 'Net Income',
        netLoss: 'Net Loss',
        downloadPdf: 'Download PDF',
        noPnl: 'No posted journal entries for this period.',
        empty: 'No data',
        months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      }

  const handleDownload = async () => {
    setPdfLoading(true)
    try {
      await downloadPnlPdf(year, month === '' ? undefined : Number(month))
    } finally {
      setPdfLoading(false)
    }
  }

  const maxMonthly = summary?.monthly
    ? Math.max(...summary.monthly.map((m: any) => Math.max(m.deposits, m.payments)))
    : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{L.title}</h1>
          <p className="text-sm text-zinc-400 mt-1">{L.subtitle}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-zinc-400" />
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <select
            value={month}
            onChange={e => setMonth(e.target.value === '' ? '' : Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">{L.allMonths}</option>
            {L.months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <button
            onClick={handleDownload}
            disabled={pdfLoading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {L.downloadPdf}
          </button>
        </div>
      </div>

      {/* Cash flow summary */}
      <section>
        <h2 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
          <DollarSign className="w-4 h-4" /> {L.cashFlow}
        </h2>
        {loadingSummary ? (
          <div className="flex items-center justify-center py-12 text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label={L.transactions} value={summary?.transaction_count ?? 0}          color="text-white" />
            <Card label={L.deposits}     value={fmtCurrency(summary?.total_deposits ?? 0)} color="text-emerald-400" />
            <Card label={L.payments}     value={fmtCurrency(summary?.total_payments ?? 0)} color="text-red-400" />
            <Card label={L.netCash}      value={fmtCurrency(summary?.net_cash_flow ?? 0)}
                  color={(summary?.net_cash_flow ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'} />
          </div>
        )}
      </section>

      {/* Monthly breakdown */}
      {summary?.monthly && summary.monthly.length > 0 && (
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> {L.monthly}
          </h2>
          <div className="space-y-2">
            {summary.monthly.map((m: any) => (
              <div key={m.month} className="flex items-center gap-3 text-xs">
                <span className="w-10 text-zinc-400 font-mono">{L.months[m.month - 1]}</span>
                <div className="flex-1 flex items-center gap-1">
                  <div className="relative flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
                    <div
                      className="absolute top-0 left-0 h-full bg-emerald-500/40"
                      style={{ width: `${Math.min(100, (m.deposits / maxMonthly) * 100)}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-end pr-2 font-mono text-emerald-300">
                      +{fmtCurrency(m.deposits)}
                    </span>
                  </div>
                  <div className="relative flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
                    <div
                      className="absolute top-0 right-0 h-full bg-red-500/40"
                      style={{ width: `${Math.min(100, (m.payments / maxMonthly) * 100)}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-start pl-2 font-mono text-red-300">
                      −{fmtCurrency(m.payments)}
                    </span>
                  </div>
                </div>
                <span className={`w-28 text-right font-mono ${m.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmtCurrency(m.net)}
                </span>
                <span className="w-12 text-right text-zinc-500">{m.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Top vendors / income side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TopList
          title={L.topVendors}
          icon={<TrendingDown className="w-4 h-4 text-red-400" />}
          items={(summary?.top_vendors_by_spend ?? []).map((v: any) => ({
            name: v.vendor, total: v.total, count: v.count,
          }))}
          fmt={fmtCurrency}
          color="text-red-400"
        />
        <TopList
          title={L.topIncome}
          icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
          items={(summary?.top_income_sources ?? []).map((v: any) => ({
            name: v.source, total: v.total, count: v.count,
          }))}
          fmt={fmtCurrency}
          color="text-emerald-400"
        />
      </div>

      {/* P&L */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5" /> {L.pnl}
            </h2>
            <p className="text-xs text-zinc-500">{L.pnlSubtitle}</p>
          </div>
          {pnl && (
            <div className="text-xs text-zinc-500">
              {pnl.period?.from} → {pnl.period?.to} · {pnl.line_count ?? 0} lines
            </div>
          )}
        </div>

        {loadingPnl ? (
          <div className="flex items-center justify-center py-8 text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : !pnl || pnl.line_count === 0 ? (
          <p className="text-center text-zinc-500 py-8 text-sm">{L.noPnl}</p>
        ) : (
          <div className="space-y-6">
            {/* Revenue */}
            <PnlSection
              title={L.revenue}
              rows={pnl.revenue.map((r: any) => ({ account: r.account, amount: r.balance }))}
              total={pnl.totals.revenue}
              fmt={fmtCurrency}
              positive
            />
            {/* Expenses */}
            <PnlSection
              title={L.expenses}
              rows={pnl.expenses.map((r: any) => ({ account: r.account, amount: -r.balance }))}
              total={pnl.totals.expenses}
              fmt={fmtCurrency}
              positive={false}
            />
            {/* Net */}
            <div className="pt-4 border-t-2 border-zinc-700">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-white">
                  {pnl.totals.net_income >= 0 ? L.netIncome : L.netLoss}
                </span>
                <span className={`text-2xl font-bold font-mono ${pnl.totals.net_income >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmtCurrency(pnl.totals.net_income)}
                </span>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function Card({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  )
}

function TopList({ title, icon, items, fmt, color }: {
  title: string
  icon: React.ReactNode
  items: Array<{ name: string; total: number; count: number }>
  fmt: (n: number) => string
  color: string
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">{icon} {title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-500 py-4">No data</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex items-center justify-between text-sm">
              <span className="text-zinc-300 truncate flex-1 mr-2" title={item.name}>{item.name}</span>
              <div className="flex items-center gap-4">
                <span className="text-xs text-zinc-500">{item.count}×</span>
                <span className={`font-mono ${color}`}>{fmt(item.total)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PnlSection({ title, rows, total, fmt, positive }: {
  title: string
  rows: Array<{ account: string; amount: number }>
  total: number
  fmt: (n: number) => string
  positive: boolean
}) {
  return (
    <div>
      <h3 className="text-sm font-bold text-white mb-2">{title}</h3>
      <div className="space-y-1">
        {rows.length === 0 ? (
          <p className="text-xs text-zinc-500 pl-4">—</p>
        ) : (
          rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-sm pl-4">
              <span className="text-zinc-300 truncate flex-1" title={r.account}>{r.account}</span>
              <span className={`font-mono ${positive ? 'text-emerald-300' : 'text-zinc-300'}`}>
                {fmt(r.amount)}
              </span>
            </div>
          ))
        )}
      </div>
      <div className="flex items-center justify-between text-sm pt-2 mt-2 border-t border-zinc-800">
        <span className="font-bold text-white">Total {title}</span>
        <span className={`font-bold font-mono ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
          {fmt(total)}
        </span>
      </div>
    </div>
  )
}
