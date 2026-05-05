/**
 * CUENTAX — F29 Wizard.
 * Calcula los códigos principales del Formulario 29 SII a partir de DTEs y RCV.
 */
'use client'

import { useState } from 'react'
import { Loader2, FileText, AlertCircle, AlertTriangle, Download } from 'lucide-react'
import { apiClient } from '@/lib/api-client'

interface F29Result {
  period: string
  company_id: number
  cod_502_facturas_afectas: { neto: number; iva: number; count: number }
  cod_503_boletas_afectas:  { brutas: number; count: number }
  cod_538_total_debito: number
  cod_062_ventas_exentas: number
  cod_519_facturas_recibidas: { neto: number; iva: number; count: number }
  cod_511_total_credito: number
  cod_509_notas_credito: { neto: number; iva: number; count: number }
  iva_a_pagar_o_devolver: number
  warnings: string[]
}

const clpFmt = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const previousPeriod = (): string => {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() - 1)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export default function F29Page() {
  const [period, setPeriod] = useState(previousPeriod())
  const [result, setResult] = useState<F29Result | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const calculate = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await apiClient.get<F29Result>(`/api/v1/f29/calculate?period=${period}`)
      setResult(r.data)
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message ??
               (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
               'Error al calcular F29')
    } finally {
      setLoading(false)
    }
  }

  const download = () => {
    if (!result) return
    const csv = [
      'Codigo,Descripcion,Monto',
      `502,Facturas afectas (neto),${result.cod_502_facturas_afectas.neto}`,
      `502,Facturas afectas (IVA),${result.cod_502_facturas_afectas.iva}`,
      `503,Boletas afectas (brutas),${result.cod_503_boletas_afectas.brutas}`,
      `509,Notas de credito (IVA),${result.cod_509_notas_credito.iva}`,
      `538,Total debito fiscal,${result.cod_538_total_debito}`,
      `062,Ventas exentas,${result.cod_062_ventas_exentas}`,
      `519,Facturas recibidas (neto),${result.cod_519_facturas_recibidas.neto}`,
      `519,Facturas recibidas (IVA),${result.cod_519_facturas_recibidas.iva}`,
      `511,Total credito fiscal,${result.cod_511_total_credito}`,
      `,IVA a pagar o devolver,${result.iva_a_pagar_o_devolver}`,
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `f29-${result.period}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <FileText className="w-6 h-6 text-blue-600" /> Formulario 29 — Resumen mensual SII
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Cálculo automático de los códigos principales a partir de tus DTE emitidos + RCV de compras del período.
          <strong className="block mt-1 text-amber-700">⚠️ Esto NO presenta el F29 al SII; solo te entrega los valores para que los traspases manualmente o los verifiques.</strong>
        </p>
      </header>

      <section className="mb-6 bg-white rounded-lg border border-zinc-200 p-5">
        <div className="flex items-end gap-3">
          <label className="flex-1">
            <span className="block text-sm font-medium mb-1">Período</span>
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              max={previousPeriod()}
              className="w-full max-w-[200px] rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono"
            />
          </label>
          <button
            onClick={calculate}
            disabled={loading}
            className="rounded-md bg-blue-600 text-white px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-60 inline-flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Calcular
          </button>
          {result && (
            <button
              onClick={download}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> CSV
            </button>
          )}
        </div>
      </section>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {result && (
        <>
          {result.warnings.length > 0 && (
            <div className="mb-4 p-3 rounded bg-amber-50 border border-amber-200 text-sm text-amber-900">
              <p className="font-medium mb-1 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> Avisos
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <section className="grid grid-cols-2 gap-4 mb-6">
            <Card label="Débito fiscal (cod 538)" value={clpFmt(result.cod_538_total_debito)} variant="primary" />
            <Card label="Crédito fiscal (cod 511)" value={clpFmt(result.cod_511_total_credito)} />
            <Card label="Ventas exentas (cod 062)" value={clpFmt(result.cod_062_ventas_exentas)} />
            <Card
              label={result.iva_a_pagar_o_devolver >= 0 ? 'IVA a pagar' : 'Remanente próximo período'}
              value={clpFmt(Math.abs(result.iva_a_pagar_o_devolver))}
              variant={result.iva_a_pagar_o_devolver >= 0 ? 'pay' : 'refund'}
            />
          </section>

          <section className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="text-left  px-4 py-2 w-20">Cód</th>
                  <th className="text-left  px-4 py-2">Concepto</th>
                  <th className="text-right px-4 py-2">N°</th>
                  <th className="text-right px-4 py-2">Neto</th>
                  <th className="text-right px-4 py-2">IVA</th>
                </tr>
              </thead>
              <tbody>
                <Row code="502" label="Facturas afectas emitidas (33, 56)"
                     n={result.cod_502_facturas_afectas.count}
                     neto={result.cod_502_facturas_afectas.neto}
                     iva={result.cod_502_facturas_afectas.iva} />
                <Row code="503" label="Boletas afectas (39) — IVA incluido"
                     n={result.cod_503_boletas_afectas.count}
                     neto={result.cod_503_boletas_afectas.brutas} />
                <Row code="509" label="Notas de crédito emitidas (61) — reduce débito"
                     n={result.cod_509_notas_credito.count}
                     neto={result.cod_509_notas_credito.neto}
                     iva={-result.cod_509_notas_credito.iva}
                     muted />
                <Row code="062" label="Ventas exentas (34, 41)"
                     neto={result.cod_062_ventas_exentas} />
                <Row code="519" label="Facturas de compra recibidas — RCV"
                     n={result.cod_519_facturas_recibidas.count}
                     neto={result.cod_519_facturas_recibidas.neto}
                     iva={result.cod_519_facturas_recibidas.iva} />
              </tbody>
            </table>
          </section>

          <p className="text-xs text-zinc-500 mt-4">
            <strong>Nota:</strong> el F29 oficial debe presentarse antes del día 12 del mes siguiente en
            <a href="https://www.sii.cl" className="text-blue-600 ml-1">www.sii.cl</a>.
            Cuentax aún no presenta el formulario electrónicamente — esta página es un asistente para calcular los códigos.
          </p>
        </>
      )}
    </div>
  )
}

function Card({ label, value, variant }: { label: string; value: string; variant?: 'primary' | 'pay' | 'refund' }) {
  const styles = {
    primary: 'bg-blue-50 border-blue-200 text-blue-900',
    pay:     'bg-amber-50 border-amber-200 text-amber-900',
    refund:  'bg-green-50 border-green-200 text-green-900',
  }[variant ?? 'primary']
  return (
    <div className={`rounded-lg border p-4 ${styles}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
    </div>
  )
}

function Row({ code, label, n, neto, iva, muted }: {
  code: string; label: string; n?: number; neto?: number; iva?: number; muted?: boolean
}) {
  return (
    <tr className={`border-t border-zinc-200 ${muted ? 'text-zinc-500' : ''}`}>
      <td className="px-4 py-2 font-mono text-xs">{code}</td>
      <td className="px-4 py-2">{label}</td>
      <td className="px-4 py-2 text-right text-xs">{n ?? '—'}</td>
      <td className="px-4 py-2 text-right font-mono">{neto !== undefined ? clpFmt(neto) : '—'}</td>
      <td className="px-4 py-2 text-right font-mono">{iva !== undefined ? clpFmt(iva) : '—'}</td>
    </tr>
  )
}
