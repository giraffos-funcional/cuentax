'use client'

/**
 * Cost Center P&L — matriz por dimensión analítica.
 * Works the same in CL and US; copy translated by country.
 */

import { useState } from 'react'
import {
  Loader2, Download, Calendar, TrendingUp, TrendingDown, FileText, Home, ChevronRight,
} from 'lucide-react'
import { useCostCenterPnl, downloadCostCenterPnlPdf } from '@/hooks'
import { useLocale } from '@/contexts/locale-context'

export default function CostCenterPnlPage() {
  const { fmtCurrency, country } = useLocale()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState<number | ''>('')
  const [expanded, setExpanded] = useState<number | null | 'untagged'>(null)
  const [pdfLoading, setPdfLoading] = useState(false)

  const { report, isLoading } = useCostCenterPnl(year, month === '' ? undefined : Number(month))

  const isCL = country === 'CL'
  const L = isCL
    ? { title: 'P&L por Centro de Costo', subtitle: 'Rentabilidad por propiedad, proyecto, local o cualquier dimensión analítica.', year: 'Año', month: 'Mes', allMonths: 'Todo el año', center: 'Centro', revenue: 'Ingresos', expenses: 'Gastos', netIncome: 'Utilidad', loading: 'Cargando...', noData: 'No hay movimientos contabilizados con tag de centro en este período.', downloadPdf: 'Descargar PDF', totals: 'Totales', expandDetails: 'Ver detalle', months: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'], untagged: '(sin centro)', account: 'Cuenta', amount: 'Monto' }
    : { title: 'P&L by Cost Center', subtitle: 'Profitability by property, project, store, or any analytic dimension.', year: 'Year', month: 'Month', allMonths: 'Full year', center: 'Center', revenue: 'Revenue', expenses: 'Expenses', netIncome: 'Net Income', loading: 'Loading...', noData: 'No posted moves with cost center tags in this period.', downloadPdf: 'Download PDF', totals: 'Totals', expandDetails: 'Show detail', months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], untagged: '(untagged)', account: 'Account', amount: 'Amount' }

  const handleDownload = async () => {
    setPdfLoading(true)
    try {
      await downloadCostCenterPnlPdf(year, month === '' ? undefined : Number(month))
    } finally { setPdfLoading(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Home className="w-6 h-6" /> {L.title}
          </h1>
          <p className="text-sm text-zinc-400 mt-1">{L.subtitle}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-zinc-400" />
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
              {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <select value={month} onChange={e => setMonth(e.target.value === '' ? '' : Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
            <option value="">{L.allMonths}</option>
            {L.months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <button onClick={handleDownload} disabled={pdfLoading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {L.downloadPdf}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />{L.loading}
        </div>
      ) : !report || report.by_center.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl py-16 text-center">
          <FileText className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">{L.noData}</p>
        </div>
      ) : (
        <>
          {/* Totals */}
          <div className="grid grid-cols-3 gap-3">
            <TotalCard icon={<TrendingUp className="w-5 h-5" />} label={L.revenue}
              value={fmtCurrency(report.totals.revenue)} color="text-emerald-400" />
            <TotalCard icon={<TrendingDown className="w-5 h-5" />} label={L.expenses}
              value={fmtCurrency(report.totals.expenses)} color="text-red-400" />
            <TotalCard icon={<TrendingUp className="w-5 h-5" />} label={L.netIncome}
              value={fmtCurrency(report.totals.net_income)}
              color={report.totals.net_income >= 0 ? 'text-emerald-400' : 'text-red-400'} />
          </div>

          {/* Per-center breakdown (expandable) */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-zinc-500 border-b border-zinc-800">
                  <th className="px-4 py-3 text-left w-8"></th>
                  <th className="px-4 py-3 text-left">{L.center}</th>
                  <th className="px-4 py-3 text-right">{L.revenue}</th>
                  <th className="px-4 py-3 text-right">{L.expenses}</th>
                  <th className="px-4 py-3 text-right">{L.netIncome}</th>
                </tr>
              </thead>
              <tbody>
                {report.by_center.map((c: any) => {
                  const key = c.cost_center_id ?? 'untagged'
                  const isExpanded = expanded === key
                  return (
                    <>
                      <tr key={`h-${key}`}
                        className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer ${isExpanded ? 'bg-zinc-800/20' : ''}`}
                        onClick={() => setExpanded(isExpanded ? null : key)}>
                        <td className="px-4 py-3">
                          <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </td>
                        <td className="px-4 py-3 text-white font-medium">
                          {c.cost_center_id === null ? L.untagged : c.cost_center_name}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-400">{fmtCurrency(c.total_revenue)}</td>
                        <td className="px-4 py-3 text-right font-mono text-red-400">{fmtCurrency(c.total_expenses)}</td>
                        <td className={`px-4 py-3 text-right font-mono font-bold ${c.net_income >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {fmtCurrency(c.net_income)}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`d-${key}`} className="bg-zinc-950 border-b border-zinc-800">
                          <td colSpan={5} className="px-8 py-4">
                            <div className="grid grid-cols-2 gap-6">
                              <DetailList title={L.revenue} rows={c.revenue_by_account} fmt={fmtCurrency} color="text-emerald-300" />
                              <DetailList title={L.expenses} rows={c.expense_by_account} fmt={fmtCurrency} color="text-red-300" />
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-zinc-700 bg-zinc-800/30">
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 font-bold text-white">{L.totals}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">{fmtCurrency(report.totals.revenue)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-red-400">{fmtCurrency(report.totals.expenses)}</td>
                  <td className={`px-4 py-3 text-right font-mono font-bold text-lg ${report.totals.net_income >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fmtCurrency(report.totals.net_income)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function TotalCard({ icon, label, value, color }: any) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1">{icon}<span>{label}</span></div>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  )
}

function DetailList({ title, rows, fmt, color }: any) {
  if (rows.length === 0) return (
    <div>
      <h4 className="text-xs font-bold text-zinc-500 mb-2">{title}</h4>
      <p className="text-xs text-zinc-600">—</p>
    </div>
  )
  return (
    <div>
      <h4 className="text-xs font-bold text-zinc-500 mb-2">{title}</h4>
      <ul className="space-y-1">
        {rows.map((r: any, i: number) => (
          <li key={i} className="flex items-center justify-between text-sm">
            <span className="text-zinc-400 truncate flex-1 mr-2" title={r.account}>{r.account}</span>
            <span className={`font-mono ${color}`}>{fmt(r.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
