'use client'

/**
 * Budgets — monthly plan per (account, cost center) + variance view.
 */

import { useState } from 'react'
import { Target, Plus, Trash2, Loader2, Save, Calendar } from 'lucide-react'
import {
  useBudgets, useUpsertBudget, useDeleteBudget, useBudgetVariance, useCostCentersV2 as useCostCenters,
} from '@/hooks'
import { useLocale } from '@/contexts/locale-context'

export default function BudgetsPage() {
  const { fmtCurrency, country } = useLocale()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1)
  const { budgets, isLoading, mutate } = useBudgets(year, month)
  const { upsert } = useUpsertBudget()
  const { remove } = useDeleteBudget()
  const { report: variance } = useBudgetVariance(year, month)
  const { costCenters } = useCostCenters()

  const [newRow, setNewRow] = useState({ account_code: '', account_name: '', cost_center_id: null as number | null, amount: '' })
  const [saving, setSaving] = useState(false)

  const isCL = country === 'CL'
  const L = isCL
    ? { title: 'Presupuestos', subtitle: 'Planifica por cuenta y centro de costo. Comparamos vs asientos contabilizados.', year: 'Año', month: 'Mes', addBudget: 'Agregar presupuesto', accountCode: 'Código cuenta', accountName: 'Nombre cuenta', center: 'Centro de costo', amount: 'Monto', notes: 'Notas', save: 'Guardar', delete: 'Eliminar', companywide: '(empresa completa)', noBudgets: 'No hay presupuestos para este período', variance: 'Variación', planned: 'Presupuestado', actual: 'Real', favorable: 'Favorable', unfavorable: 'Desfavorable', totalPlanned: 'Total presupuestado', totalActual: 'Total real', totalVariance: 'Variación total', months: ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'] }
    : { title: 'Budgets', subtitle: 'Plan by account and cost center. We compare vs posted journal entries.', year: 'Year', month: 'Month', addBudget: 'Add budget', accountCode: 'Account code', accountName: 'Account name', center: 'Cost center', amount: 'Amount', notes: 'Notes', save: 'Save', delete: 'Delete', companywide: '(company-wide)', noBudgets: 'No budgets for this period', variance: 'Variance', planned: 'Planned', actual: 'Actual', favorable: 'Favorable', unfavorable: 'Unfavorable', totalPlanned: 'Total planned', totalActual: 'Total actual', totalVariance: 'Total variance', months: ['January','February','March','April','May','June','July','August','September','October','November','December'] }

  const handleAdd = async () => {
    if (!newRow.account_code.trim() || !newRow.amount) return
    setSaving(true)
    try {
      await upsert({
        account_code: newRow.account_code.trim(),
        account_name: newRow.account_name.trim() || undefined,
        cost_center_id: newRow.cost_center_id,
        year, month,
        amount: Number(newRow.amount),
      })
      setNewRow({ account_code: '', account_name: '', cost_center_id: null, amount: '' })
      mutate()
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Target className="w-6 h-6" /> {L.title}
          </h1>
          <p className="text-sm text-zinc-400 mt-1">{L.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-zinc-400" />
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
            {[currentYear, currentYear - 1, currentYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
            {L.months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Add budget form */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h2 className="text-sm font-medium text-white mb-3">{L.addBudget}</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <input type="text" value={newRow.account_code} onChange={e => setNewRow({ ...newRow, account_code: e.target.value })}
            placeholder={L.accountCode} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono" />
          <input type="text" value={newRow.account_name} onChange={e => setNewRow({ ...newRow, account_name: e.target.value })}
            placeholder={L.accountName} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
          <select value={newRow.cost_center_id ?? ''}
            onChange={e => setNewRow({ ...newRow, cost_center_id: e.target.value === '' ? null : Number(e.target.value) })}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
            <option value="">{L.companywide}</option>
            {costCenters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="number" value={newRow.amount} onChange={e => setNewRow({ ...newRow, amount: e.target.value })}
            placeholder={L.amount} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
          <button onClick={handleAdd} disabled={saving || !newRow.account_code || !newRow.amount}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {L.save}
          </button>
        </div>
      </section>

      {/* Existing budgets */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {isLoading ? <div className="py-12 text-center text-zinc-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
         : budgets.length === 0 ? <div className="py-12 text-center text-zinc-500 text-sm">{L.noBudgets}</div>
         : (
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800">
              <tr className="text-left text-xs text-zinc-500">
                <th className="px-4 py-2">{L.accountCode}</th>
                <th className="px-4 py-2">{L.accountName}</th>
                <th className="px-4 py-2">{L.center}</th>
                <th className="px-4 py-2 text-right">{L.amount}</th>
                <th className="px-4 py-2 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {budgets.map(b => (
                <tr key={b.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-2 text-white font-mono text-xs">{b.account_code}</td>
                  <td className="px-4 py-2 text-zinc-300">{b.account_name || '—'}</td>
                  <td className="px-4 py-2 text-zinc-400 text-xs">
                    {b.cost_center_id
                      ? costCenters.find(c => c.id === b.cost_center_id)?.name ?? `#${b.cost_center_id}`
                      : L.companywide}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-blue-300">{fmtCurrency(b.amount)}</td>
                  <td className="px-4 py-2 text-center">
                    <button onClick={() => { remove(b.id).then(() => mutate()) }}
                      className="text-red-400 hover:text-red-300 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Variance report */}
      {variance && variance.lines.length > 0 && (
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">{L.variance}</h2>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Mini label={L.totalPlanned}  value={fmtCurrency(variance.totals.total_budget)}   color="text-zinc-300" />
            <Mini label={L.totalActual}   value={fmtCurrency(variance.totals.total_actual)}    color="text-blue-400" />
            <Mini label={L.totalVariance} value={fmtCurrency(variance.totals.total_variance)}
                  color={variance.totals.total_variance >= 0 ? 'text-emerald-400' : 'text-red-400'} />
          </div>
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-zinc-900">
                <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                  <th className="px-3 py-2">{L.accountCode}</th>
                  <th className="px-3 py-2">{L.accountName}</th>
                  <th className="px-3 py-2">{L.center}</th>
                  <th className="px-3 py-2 text-right">{L.planned}</th>
                  <th className="px-3 py-2 text-right">{L.actual}</th>
                  <th className="px-3 py-2 text-right">Δ</th>
                  <th className="px-3 py-2 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {variance.lines.map((l: any, i: number) => (
                  <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-3 py-2 font-mono text-xs text-zinc-400">{l.account_code}</td>
                    <td className="px-3 py-2 text-white">{l.account_name || '—'}</td>
                    <td className="px-3 py-2 text-zinc-400 text-xs">{l.cost_center_name || L.companywide}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-300">{fmtCurrency(l.budget_amount)}</td>
                    <td className="px-3 py-2 text-right font-mono text-blue-300">{fmtCurrency(l.actual_amount)}</td>
                    <td className={`px-3 py-2 text-right font-mono ${l.favorable ? 'text-emerald-400' : 'text-red-400'}`}>
                      {l.variance >= 0 ? '+' : ''}{fmtCurrency(l.variance)}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono text-xs ${l.favorable ? 'text-emerald-400' : 'text-red-400'}`}>
                      {l.budget_amount !== 0 ? `${l.variance_pct.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function Mini({ label, value, color }: any) {
  return (
    <div className="bg-zinc-800/50 rounded-lg p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  )
}
