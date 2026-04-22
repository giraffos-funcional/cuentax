'use client'

/**
 * Advanced Reports — Trial Balance, General Ledger, Aged AR/AP, 1099-NEC.
 */

import { useState } from 'react'
import {
  Download, Loader2, FileSpreadsheet, FileText, Receipt, Users, Calendar, Filter,
} from 'lucide-react'
import {
  useTrialBalance, downloadTrialBalancePdf,
  useGeneralLedgerV2 as useGeneralLedger, downloadGeneralLedgerCsv,
  useAgedReport, downloadAgedCsv,
  download1099Pdf,
} from '@/hooks'
import { useLocale } from '@/contexts/locale-context'

type Tab = 'trial-balance' | 'general-ledger' | 'aged-ar' | 'aged-ap' | '1099'

export default function AdvancedReportsPage() {
  const { fmtCurrency, country } = useLocale()
  const currentYear = new Date().getFullYear()
  const today = new Date().toISOString().slice(0, 10)
  const [tab, setTab] = useState<Tab>('trial-balance')
  const [year, setYear] = useState(currentYear)
  const [asOf, setAsOf] = useState(today)
  const [accountCode, setAccountCode] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [threshold1099, setThreshold1099] = useState(600)

  const isCL = country === 'CL'
  const isUS = country === 'US'
  const L = isCL
    ? { trialBalance: 'Balance de Comprobación', generalLedger: 'Libro Mayor', agedAR: 'Aging AR', agedAP: 'Aging AP', compliance: 'Cumplimiento', year: 'Año', asOf: 'Al', download: 'Descargar', loading: 'Cargando...', empty: 'Sin datos', account: 'Cuenta', accountCode: 'Código', accountName: 'Nombre', opening: 'Saldo Inicial', debit: 'Débitos', credit: 'Créditos', closing: 'Saldo Final', balanced: '✓ Cuadrado', unbalanced: '⚠ No cuadra', partner: 'Tercero', total: 'Total', current: 'Al día', d130: '1-30', d3160: '31-60', d6190: '61-90', d90: '+90', invoices: 'Facturas', filter: 'Filtrar por cuenta', date: 'Fecha', move: 'Asiento', description: 'Descripción', balance: 'Saldo', costCenter: 'Centro' }
    : { trialBalance: 'Trial Balance', generalLedger: 'General Ledger', agedAR: 'Aged Receivables', agedAP: 'Aged Payables', compliance: 'Compliance', year: 'Year', asOf: 'As of', download: 'Download', loading: 'Loading...', empty: 'No data', account: 'Account', accountCode: 'Code', accountName: 'Name', opening: 'Opening', debit: 'Debit', credit: 'Credit', closing: 'Closing', balanced: '✓ Balanced', unbalanced: '⚠ Not balanced', partner: 'Partner', total: 'Total', current: 'Current', d130: '1-30', d3160: '31-60', d6190: '61-90', d90: '90+', invoices: 'Invoices', filter: 'Filter by account', date: 'Date', move: 'Move', description: 'Description', balance: 'Balance', costCenter: 'Center' }

  const { report: tb, isLoading: loadingTB } = useTrialBalance(year)
  const { report: gl, isLoading: loadingGL } = useGeneralLedger(year, accountCode || undefined)
  const { report: agedAR, isLoading: loadingAR } = useAgedReport('AR', asOf)
  const { report: agedAP, isLoading: loadingAP } = useAgedReport('AP', asOf)

  const handleDownload = async () => {
    setPdfLoading(true)
    try {
      if (tab === 'trial-balance')   await downloadTrialBalancePdf(year)
      if (tab === 'general-ledger')  await downloadGeneralLedgerCsv(year, accountCode || undefined)
      if (tab === 'aged-ar')         await downloadAgedCsv('AR', asOf)
      if (tab === 'aged-ap')         await downloadAgedCsv('AP', asOf)
      if (tab === '1099')            await download1099Pdf(year, threshold1099)
    } finally { setPdfLoading(false) }
  }

  const downloadLabel = tab === 'general-ledger' || tab.startsWith('aged') ? 'CSV' : 'PDF'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{isCL ? 'Reportes Avanzados' : 'Advanced Reports'}</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {isCL ? 'Balance de comprobación, libro mayor, aging de AR/AP y 1099-NEC.' : 'Trial balance, general ledger, AR/AP aging, and 1099-NEC summary.'}
          </p>
        </div>
        <button onClick={handleDownload} disabled={pdfLoading}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {L.download} {downloadLabel}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 overflow-x-auto">
        {[
          { id: 'trial-balance',  label: L.trialBalance, icon: FileSpreadsheet },
          { id: 'general-ledger', label: L.generalLedger, icon: FileText },
          { id: 'aged-ar',        label: L.agedAR,        icon: Users },
          { id: 'aged-ap',        label: L.agedAP,        icon: Receipt },
          ...(isUS ? [{ id: '1099' as Tab, label: '1099-NEC', icon: FileText }] : []),
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id as Tab)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
              tab === id ? 'border-blue-500 text-white' : 'border-transparent text-zinc-400 hover:text-white'
            }`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {(tab === 'trial-balance' || tab === 'general-ledger' || tab === '1099') && (
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-zinc-400" />
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
              {[currentYear, currentYear - 1, currentYear - 2].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}
        {(tab === 'aged-ar' || tab === 'aged-ap') && (
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-zinc-400" />
            <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
          </div>
        )}
        {tab === 'general-ledger' && (
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-zinc-400" />
            <input type="text" value={accountCode} onChange={e => setAccountCode(e.target.value)}
              placeholder={L.filter}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono w-40" />
          </div>
        )}
        {tab === '1099' && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-300">Threshold:</span>
            <input type="number" value={threshold1099} onChange={e => setThreshold1099(Number(e.target.value))}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white w-24" />
            <span className="text-xs text-zinc-500">default $600</span>
          </div>
        )}
      </div>

      {/* Content */}
      {tab === 'trial-balance' && (
        loadingTB ? <Loader /> : !tb || tb.rows.length === 0 ? <Empty label={L.empty} /> : (
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800">
                  <tr className="text-left text-xs text-zinc-500">
                    <th className="px-4 py-2">{L.accountCode}</th>
                    <th className="px-4 py-2">{L.accountName}</th>
                    <th className="px-4 py-2 text-right">{L.opening}</th>
                    <th className="px-4 py-2 text-right">{L.debit}</th>
                    <th className="px-4 py-2 text-right">{L.credit}</th>
                    <th className="px-4 py-2 text-right">{L.closing}</th>
                  </tr>
                </thead>
                <tbody>
                  {tb.rows.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="px-4 py-1.5 font-mono text-xs text-zinc-400">{r.account_code || '—'}</td>
                      <td className="px-4 py-1.5 text-white">{r.account_name}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-zinc-300">{fmtCurrency(r.opening_balance)}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-emerald-300">{fmtCurrency(r.period_debit)}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-red-300">{fmtCurrency(r.period_credit)}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-white">{fmtCurrency(r.closing_balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-zinc-700 bg-zinc-800/30 font-bold">
                    <td className="px-4 py-2" colSpan={2}>{L.total}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmtCurrency(tb.totals.opening_balance)}</td>
                    <td className="px-4 py-2 text-right font-mono text-emerald-400">{fmtCurrency(tb.totals.period_debit)}</td>
                    <td className="px-4 py-2 text-right font-mono text-red-400">{fmtCurrency(tb.totals.period_credit)}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmtCurrency(tb.totals.closing_balance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className={`px-4 py-2 text-xs ${tb.is_balanced ? 'text-emerald-400' : 'text-red-400'}`}>
              {tb.is_balanced ? L.balanced : L.unbalanced}
            </div>
          </section>
        )
      )}

      {tab === 'general-ledger' && (
        loadingGL ? <Loader /> : !gl || gl.rows.length === 0 ? <Empty label={L.empty} /> : (
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800">
                  <tr className="text-left text-zinc-500">
                    <th className="px-3 py-2">{L.date}</th>
                    <th className="px-3 py-2">{L.accountCode}</th>
                    <th className="px-3 py-2">{L.account}</th>
                    <th className="px-3 py-2">{L.partner}</th>
                    <th className="px-3 py-2">{L.description}</th>
                    <th className="px-3 py-2">{L.costCenter}</th>
                    <th className="px-3 py-2 text-right">{L.debit}</th>
                    <th className="px-3 py-2 text-right">{L.credit}</th>
                    <th className="px-3 py-2 text-right">{L.balance}</th>
                  </tr>
                </thead>
                <tbody>
                  {gl.rows.slice(0, 500).map((r: any, i: number) => (
                    <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="px-3 py-1 text-zinc-400">{r.date}</td>
                      <td className="px-3 py-1 font-mono text-zinc-400">{r.account_code}</td>
                      <td className="px-3 py-1 text-zinc-300 max-w-[180px] truncate" title={r.account_name}>{r.account_name}</td>
                      <td className="px-3 py-1 text-zinc-500 max-w-[120px] truncate">{r.partner || '—'}</td>
                      <td className="px-3 py-1 text-zinc-300 max-w-[200px] truncate" title={r.description}>{r.description}</td>
                      <td className="px-3 py-1 text-zinc-500">{r.cost_center || '—'}</td>
                      <td className="px-3 py-1 text-right font-mono text-emerald-300">{r.debit > 0 ? fmtCurrency(r.debit) : ''}</td>
                      <td className="px-3 py-1 text-right font-mono text-red-300">{r.credit > 0 ? fmtCurrency(r.credit) : ''}</td>
                      <td className="px-3 py-1 text-right font-mono text-white">{fmtCurrency(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {gl.rows.length > 500 && (
                <p className="px-4 py-2 text-xs text-zinc-500">Showing first 500 of {gl.rows.length}. Download CSV for full data.</p>
              )}
            </div>
          </section>
        )
      )}

      {(tab === 'aged-ar' || tab === 'aged-ap') && (() => {
        const report = tab === 'aged-ar' ? agedAR : agedAP
        const loading = tab === 'aged-ar' ? loadingAR : loadingAP
        if (loading) return <Loader />
        if (!report || report.rows.length === 0) return <Empty label={L.empty} />
        return (
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-800">
                <tr className="text-left text-xs text-zinc-500">
                  <th className="px-4 py-2">{L.partner}</th>
                  <th className="px-4 py-2 text-right">{L.current}</th>
                  <th className="px-4 py-2 text-right">{L.d130}</th>
                  <th className="px-4 py-2 text-right">{L.d3160}</th>
                  <th className="px-4 py-2 text-right">{L.d6190}</th>
                  <th className="px-4 py-2 text-right">{L.d90}</th>
                  <th className="px-4 py-2 text-right">{L.total}</th>
                  <th className="px-4 py-2 text-right">{L.invoices}</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r: any) => (
                  <tr key={r.partner_id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-4 py-2 text-white font-medium">{r.partner_name}</td>
                    <td className="px-4 py-2 text-right font-mono text-zinc-300">{fmtCurrency(r.current)}</td>
                    <td className="px-4 py-2 text-right font-mono text-amber-300">{fmtCurrency(r.days_1_30)}</td>
                    <td className="px-4 py-2 text-right font-mono text-orange-400">{fmtCurrency(r.days_31_60)}</td>
                    <td className="px-4 py-2 text-right font-mono text-red-400">{fmtCurrency(r.days_61_90)}</td>
                    <td className="px-4 py-2 text-right font-mono text-red-600 font-bold">{fmtCurrency(r.days_over_90)}</td>
                    <td className="px-4 py-2 text-right font-mono font-bold text-white">{fmtCurrency(r.total)}</td>
                    <td className="px-4 py-2 text-right text-zinc-500">{r.invoice_count}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-zinc-700 bg-zinc-800/30 font-bold">
                  <td className="px-4 py-2">{L.total}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmtCurrency(report.totals.current)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmtCurrency(report.totals.days_1_30)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmtCurrency(report.totals.days_31_60)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmtCurrency(report.totals.days_61_90)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmtCurrency(report.totals.days_over_90)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmtCurrency(report.totals.total)}</td>
                  <td className="px-4 py-2 text-right">{report.totals.invoice_count}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        )
      })()}

      {tab === '1099' && (
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <p className="text-sm text-zinc-300">
            Click <span className="font-bold">Download PDF</span> to generate a 1099-NEC summary for year {year}
            showing vendors paid ≥ ${threshold1099.toFixed(0)}.
          </p>
          <p className="text-xs text-zinc-500 mt-3">
            This document is for bookkeeping support. File the official IRS Form 1099-NEC separately.
          </p>
        </section>
      )}
    </div>
  )
}

function Loader() {
  return <div className="flex items-center justify-center py-16 text-zinc-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
}
function Empty({ label }: { label: string }) {
  return <div className="text-center py-16 text-zinc-500 text-sm">{label}</div>
}
