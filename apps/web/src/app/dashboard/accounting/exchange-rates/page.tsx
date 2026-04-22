'use client'

/**
 * Exchange Rates — multi-currency conversion rates, per company.
 */

import { useState } from 'react'
import { ArrowLeftRight, Plus, Trash2, Loader2, Calculator } from 'lucide-react'
import { useExchangeRates, useSetExchangeRate, useDeleteExchangeRate } from '@/hooks'
import { useLocale } from '@/contexts/locale-context'
import { apiClient } from '@/lib/api-client'

export default function ExchangeRatesPage() {
  const { country } = useLocale()
  const { rates, isLoading, mutate } = useExchangeRates()
  const { set } = useSetExchangeRate()
  const { remove } = useDeleteExchangeRate()

  const [newRow, setNewRow] = useState({
    date: new Date().toISOString().slice(0, 10),
    from_currency: country === 'CL' ? 'USD' : 'CLP',
    to_currency:   country === 'CL' ? 'CLP' : 'USD',
    rate: '',
    source: 'manual',
  })
  const [saving, setSaving] = useState(false)

  // Converter widget
  const [conv, setConv] = useState({ amount: '1', from: 'USD', to: 'CLP', date: new Date().toISOString().slice(0, 10) })
  const [convResult, setConvResult] = useState<any>(null)
  const [converting, setConverting] = useState(false)

  const isCL = country === 'CL'
  const L = isCL
    ? { title: 'Tipos de Cambio', subtitle: 'Mantén tipos de cambio por empresa para reportes multi-moneda.', add: 'Agregar tipo', date: 'Fecha', from: 'Desde', to: 'A', rate: 'Tasa', source: 'Fuente', save: 'Guardar', delete: 'Eliminar', empty: 'No hay tipos de cambio registrados', converter: 'Convertir monto', convert: 'Convertir', result: 'Resultado', meta: '1 unidad from = <tasa> to' }
    : { title: 'Exchange Rates', subtitle: 'Per-company exchange rates for multi-currency reporting.', add: 'Add rate', date: 'Date', from: 'From', to: 'To', rate: 'Rate', source: 'Source', save: 'Save', delete: 'Delete', empty: 'No exchange rates registered', converter: 'Convert amount', convert: 'Convert', result: 'Result', meta: '1 unit from = <rate> to' }

  const handleAdd = async () => {
    if (!newRow.date || !newRow.rate) return
    setSaving(true)
    try {
      await set({
        date: newRow.date,
        from_currency: newRow.from_currency.toUpperCase(),
        to_currency: newRow.to_currency.toUpperCase(),
        rate: Number(newRow.rate),
        source: newRow.source,
      })
      setNewRow({ ...newRow, rate: '' })
      mutate()
    } finally { setSaving(false) }
  }

  const handleConvert = async () => {
    if (!conv.amount || !conv.from || !conv.to) return
    setConverting(true)
    try {
      const r = await apiClient.get('/api/v1/accounting/exchange-rates/convert', {
        params: conv,
      }).then(res => res.data)
      setConvResult(r)
    } catch (e: any) {
      setConvResult({ error: e?.response?.data?.message || 'No rate found' })
    } finally { setConverting(false) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ArrowLeftRight className="w-6 h-6" /> {L.title}
        </h1>
        <p className="text-sm text-zinc-400 mt-1">{L.subtitle}</p>
      </div>

      {/* Converter */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h2 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
          <Calculator className="w-4 h-4" /> {L.converter}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <input type="number" value={conv.amount} onChange={e => setConv({ ...conv, amount: e.target.value })}
            placeholder="Amount" className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
          <input type="text" value={conv.from} onChange={e => setConv({ ...conv, from: e.target.value.toUpperCase() })}
            placeholder={L.from} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono" />
          <input type="text" value={conv.to} onChange={e => setConv({ ...conv, to: e.target.value.toUpperCase() })}
            placeholder={L.to} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono" />
          <input type="date" value={conv.date} onChange={e => setConv({ ...conv, date: e.target.value })}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
          <button onClick={handleConvert} disabled={converting}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {converting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
            {L.convert}
          </button>
        </div>
        {convResult && (
          <div className={`mt-3 text-sm p-3 rounded-lg ${convResult.error ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
            {convResult.error ? (
              <>⚠ {convResult.error}</>
            ) : (
              <>✓ {conv.amount} {conv.from} = <span className="font-bold">{convResult.amount.toLocaleString()}</span> {conv.to}
              <span className="text-xs text-zinc-500 ml-2">
                (rate {convResult.rate}, {convResult.rate_date})
              </span></>
            )}
          </div>
        )}
      </section>

      {/* Add new rate */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h2 className="text-sm font-medium text-white mb-3">{L.add}</h2>
        <p className="text-xs text-zinc-500 mb-3">{L.meta}</p>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
          <input type="date" value={newRow.date} onChange={e => setNewRow({ ...newRow, date: e.target.value })}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
          <input type="text" value={newRow.from_currency} onChange={e => setNewRow({ ...newRow, from_currency: e.target.value.toUpperCase() })}
            placeholder={L.from} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono" />
          <input type="text" value={newRow.to_currency} onChange={e => setNewRow({ ...newRow, to_currency: e.target.value.toUpperCase() })}
            placeholder={L.to} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono" />
          <input type="number" step="0.00000001" value={newRow.rate} onChange={e => setNewRow({ ...newRow, rate: e.target.value })}
            placeholder={L.rate} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
          <input type="text" value={newRow.source} onChange={e => setNewRow({ ...newRow, source: e.target.value })}
            placeholder={L.source} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
          <button onClick={handleAdd} disabled={saving || !newRow.rate}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {L.save}
          </button>
        </div>
      </section>

      {/* Existing rates */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {isLoading ? <div className="py-12 text-center text-zinc-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
         : rates.length === 0 ? <div className="py-12 text-center text-zinc-500 text-sm">{L.empty}</div>
         : (
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800">
              <tr className="text-left text-xs text-zinc-500">
                <th className="px-4 py-2">{L.date}</th>
                <th className="px-4 py-2">{L.from}</th>
                <th className="px-4 py-2">{L.to}</th>
                <th className="px-4 py-2 text-right">{L.rate}</th>
                <th className="px-4 py-2">{L.source}</th>
                <th className="px-4 py-2 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {rates.map(r => (
                <tr key={r.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-2 text-zinc-300">{r.date}</td>
                  <td className="px-4 py-2 text-white font-mono">{r.from_currency}</td>
                  <td className="px-4 py-2 text-white font-mono">{r.to_currency}</td>
                  <td className="px-4 py-2 text-right font-mono">{r.rate}</td>
                  <td className="px-4 py-2 text-zinc-500 text-xs">{r.source || '—'}</td>
                  <td className="px-4 py-2 text-center">
                    <button onClick={() => { remove(r.id).then(() => mutate()) }}
                      className="text-red-400 hover:text-red-300 p-1"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
