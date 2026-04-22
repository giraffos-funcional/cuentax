'use client'

/**
 * Reports — Balance Sheet + Cash Flow in one place.
 */

import { useState } from 'react'
import { Scale, Activity, Loader2, Download, Calendar } from 'lucide-react'
import { useBalanceSheetV2 as useBalanceSheet, useCashFlowV2 as useCashFlow, downloadBalanceSheetPdf, downloadCashFlowPdf } from '@/hooks'
import { useLocale } from '@/contexts/locale-context'

export default function ReportsPage() {
  const { fmtCurrency, country } = useLocale()
  const [tab, setTab] = useState<'balance' | 'cashflow'>('balance')
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10))
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState<number | ''>('')
  const [pdfLoading, setPdfLoading] = useState(false)

  const { report: bs, isLoading: loadingBs } = useBalanceSheet(asOf)
  const { report: cf, isLoading: loadingCf } = useCashFlow(year, month === '' ? undefined : Number(month))

  const isCL = country === 'CL'
  const L = isCL
    ? { title: 'Reportes Financieros', balance: 'Balance', cashflow: 'Flujo de Caja', asOf: 'Al', year: 'Año', month: 'Mes', allMonths: 'Todo el año', downloadPdf: 'Descargar PDF', assets: 'Activos', currentAssets: 'Activos Corrientes', fixedAssets: 'Activos Fijos', liabilities: 'Pasivos', currentLiab: 'Pasivos Corrientes', longLiab: 'Pasivos Largo Plazo', equity: 'Patrimonio', totalAssets: 'Total Activos', totalLiab: 'Total Pasivos', totalEquity: 'Total Patrimonio', operating: 'Operacionales', investing: 'Inversión', financing: 'Financiamiento', opening: 'Saldo Inicial', closing: 'Saldo Final', netChange: 'Variación Neta', loading: 'Cargando...', empty: 'Sin movimientos', months: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'] }
    : { title: 'Financial Reports', balance: 'Balance Sheet', cashflow: 'Cash Flow', asOf: 'As of', year: 'Year', month: 'Month', allMonths: 'Full year', downloadPdf: 'Download PDF', assets: 'Assets', currentAssets: 'Current Assets', fixedAssets: 'Fixed Assets', liabilities: 'Liabilities', currentLiab: 'Current Liabilities', longLiab: 'Long-term Liabilities', equity: 'Equity', totalAssets: 'Total Assets', totalLiab: 'Total Liabilities', totalEquity: 'Total Equity', operating: 'Operating', investing: 'Investing', financing: 'Financing', opening: 'Opening Cash', closing: 'Closing Cash', netChange: 'Net Change', loading: 'Loading...', empty: 'No activity', months: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] }

  const handleDownload = async () => {
    setPdfLoading(true)
    try {
      if (tab === 'balance') await downloadBalanceSheetPdf(asOf)
      else await downloadCashFlowPdf(year, month === '' ? undefined : Number(month))
    } finally { setPdfLoading(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-white">{L.title}</h1>
        <button onClick={handleDownload} disabled={pdfLoading}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {L.downloadPdf}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        <button onClick={() => setTab('balance')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
            tab === 'balance' ? 'border-blue-500 text-white' : 'border-transparent text-zinc-400 hover:text-white'
          }`}>
          <Scale className="w-4 h-4" /> {L.balance}
        </button>
        <button onClick={() => setTab('cashflow')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
            tab === 'cashflow' ? 'border-blue-500 text-white' : 'border-transparent text-zinc-400 hover:text-white'
          }`}>
          <Activity className="w-4 h-4" /> {L.cashflow}
        </button>
      </div>

      {/* Controls */}
      {tab === 'balance' ? (
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-zinc-400" />
          <label className="text-sm text-zinc-300">{L.asOf}:</label>
          <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
            {[currentYear, currentYear - 1, currentYear - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={month} onChange={e => setMonth(e.target.value === '' ? '' : Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
            <option value="">{L.allMonths}</option>
            {L.months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
      )}

      {/* Balance Sheet content */}
      {tab === 'balance' && (
        loadingBs ? <Loader /> : !bs ? <Empty /> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Assets */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-4">{L.assets}</h2>
              <BsSection label={L.currentAssets} section={bs.current_assets} fmt={fmtCurrency} />
              <BsSection label={L.fixedAssets}   section={bs.fixed_assets}   fmt={fmtCurrency} />
              <BsSection label=""                section={bs.other_assets}   fmt={fmtCurrency} />
              <div className="pt-3 mt-3 border-t-2 border-zinc-700 flex items-center justify-between">
                <span className="font-bold text-white">{L.totalAssets}</span>
                <span className="font-bold font-mono text-emerald-400">{fmtCurrency(bs.total_assets)}</span>
              </div>
            </div>

            {/* Right: Liabilities + Equity */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-4">{L.liabilities}</h2>
              <BsSection label={L.currentLiab} section={bs.current_liabilities} fmt={fmtCurrency} />
              <BsSection label={L.longLiab}    section={bs.long_term_liabilities} fmt={fmtCurrency} />
              <div className="py-2 flex items-center justify-between border-b border-zinc-800">
                <span className="font-bold text-white">{L.totalLiab}</span>
                <span className="font-bold font-mono text-red-400">{fmtCurrency(bs.total_liabilities)}</span>
              </div>
              <h2 className="text-lg font-bold text-white mt-6 mb-4">{L.equity}</h2>
              <BsSection label="" section={bs.equity} fmt={fmtCurrency} />
              <div className="py-2 flex items-center justify-between border-b border-zinc-800">
                <span className="font-bold text-white">{L.totalEquity}</span>
                <span className="font-bold font-mono text-purple-400">{fmtCurrency(bs.total_equity)}</span>
              </div>
              <div className="pt-3 mt-3 border-t-2 border-zinc-700 flex items-center justify-between">
                <span className="font-bold text-white">L + P</span>
                <span className="font-bold font-mono text-white">{fmtCurrency(bs.total_liabilities + bs.total_equity)}</span>
              </div>
              {Math.abs(bs.unbalanced_by) > 1 && (
                <p className="mt-4 text-xs text-red-400">⚠ Diferencia: {fmtCurrency(bs.unbalanced_by)}</p>
              )}
            </div>
          </div>
        )
      )}

      {/* Cash Flow content */}
      {tab === 'cashflow' && (
        loadingCf ? <Loader /> : !cf ? <Empty /> : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-6">
            <div className="grid grid-cols-3 gap-3">
              <Stat label={L.opening}   value={fmtCurrency(cf.opening_cash)} color="text-zinc-300" />
              <Stat label={L.netChange} value={fmtCurrency(cf.net_change)}
                    color={cf.net_change >= 0 ? 'text-emerald-400' : 'text-red-400'} />
              <Stat label={L.closing}   value={fmtCurrency(cf.closing_cash)} color="text-white" />
            </div>

            <CfSection title={L.operating} section={cf.operating} fmt={fmtCurrency} />
            <CfSection title={L.investing} section={cf.investing} fmt={fmtCurrency} />
            <CfSection title={L.financing} section={cf.financing} fmt={fmtCurrency} />
          </div>
        )
      )}
    </div>
  )
}

function BsSection({ label, section, fmt }: any) {
  return (
    <div className="mb-4">
      {label && <h3 className="text-xs font-bold text-zinc-500 uppercase mb-2">{label}</h3>}
      <ul className="space-y-1">
        {section.lines.length === 0 ? <li className="text-xs text-zinc-600">—</li> : section.lines.map((l: any, i: number) => (
          <li key={i} className="flex items-center justify-between text-sm">
            <span className="text-zinc-300 text-sm">
              {l.code && <span className="font-mono text-xs text-zinc-500 mr-2">{l.code}</span>}
              {l.name}
            </span>
            <span className="font-mono text-zinc-300">{fmt(l.balance)}</span>
          </li>
        ))}
      </ul>
      {label && section.lines.length > 0 && (
        <div className="flex items-center justify-between pt-2 mt-2 border-t border-zinc-800/50 text-sm">
          <span className="text-zinc-400">Subtotal</span>
          <span className="font-mono font-bold text-zinc-200">{fmt(section.subtotal)}</span>
        </div>
      )}
    </div>
  )
}

function CfSection({ title, section, fmt }: any) {
  return (
    <div>
      <h3 className="text-sm font-bold text-white mb-2">{title}</h3>
      <ul className="space-y-1 pl-4">
        {section.lines.length === 0 ? <li className="text-xs text-zinc-600">—</li> : section.lines.map((l: any, i: number) => (
          <li key={i} className="flex items-center justify-between text-sm">
            <span className="text-zinc-300">{l.source_account}</span>
            <span className={`font-mono ${l.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmt(l.amount)}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between pt-2 mt-2 border-t border-zinc-800/50 text-sm pl-4">
        <span className="text-zinc-400 font-bold">Subtotal</span>
        <span className={`font-mono font-bold ${section.subtotal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {fmt(section.subtotal)}
        </span>
      </div>
    </div>
  )
}

function Stat({ label, value, color }: any) {
  return (
    <div className="bg-zinc-800/50 rounded-lg p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  )
}

function Loader() {
  return <div className="flex items-center justify-center py-16 text-zinc-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
}
function Empty() {
  return <div className="text-center py-16 text-zinc-500 text-sm">No data</div>
}
