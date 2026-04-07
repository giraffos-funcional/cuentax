/**
 * CUENTAX — Portal del Trabajador: Detalle de Liquidacion
 * Shows payslip breakdown: haberes, descuentos, totals.
 */

'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePortalPayslipDetail, downloadPortalPayslipPDF } from '@/hooks/use-portal'
import {
  ArrowLeft, Download, Loader2, AlertCircle, FileText,
  TrendingUp, TrendingDown, Banknote,
} from 'lucide-react'

// ── CLP formatter ─────────────────────────────────────────────
const clpFmt = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

export default function PortalPayslipDetailPage() {
  const params = useParams()
  const router = useRouter()
  const payslipId = params.id ? Number(params.id) : null
  const { data, isLoading, error } = usePortalPayslipDetail(payslipId)
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    if (!payslipId) return
    setDownloading(true)
    try {
      await downloadPortalPayslipPDF(payslipId, data?.liquidacion?.period_label, data?.liquidacion?.name)
    } catch {
      // Handled by interceptor
    } finally {
      setDownloading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-violet-500" />
        <span className="ml-2 text-sm text-slate-500">Cargando liquidacion...</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link href="/portal" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-violet-600 transition-colors">
          <ArrowLeft size={14} /> Volver a liquidaciones
        </Link>
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200">
          <AlertCircle size={16} className="text-red-500" />
          <span className="text-sm text-red-600">Liquidacion no encontrada</span>
        </div>
      </div>
    )
  }

  const { liquidacion, haberes, descuentos, totals } = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link href="/portal" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-violet-600 transition-colors mb-2">
            <ArrowLeft size={12} /> Volver a liquidaciones
          </Link>
          <h1 className="text-xl font-semibold text-slate-800">
            Liquidacion {liquidacion.period_label}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {liquidacion.number} &middot; {liquidacion.date_from} al {liquidacion.date_to}
          </p>
        </div>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="btn-primary self-start"
        >
          {downloading ? (
            <><Loader2 size={14} className="animate-spin" /> Descargando...</>
          ) : (
            <><Download size={14} /> Descargar PDF</>
          )}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[var(--cx-border)] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-emerald-500" />
            <span className="text-xs text-slate-500">Total Haberes</span>
          </div>
          <p className="text-lg font-semibold text-slate-800 tabular-nums">
            {clpFmt(totals.total_haberes)}
          </p>
        </div>
        <div className="bg-white border border-[var(--cx-border)] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown size={14} className="text-red-500" />
            <span className="text-xs text-slate-500">Total Descuentos</span>
          </div>
          <p className="text-lg font-semibold text-slate-800 tabular-nums">
            {clpFmt(totals.total_descuentos)}
          </p>
        </div>
        <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Banknote size={14} className="text-violet-600" />
            <span className="text-xs text-violet-600 font-medium">Liquido a Pagar</span>
          </div>
          <p className="text-lg font-bold text-violet-700 tabular-nums">
            {clpFmt(totals.total_pagar)}
          </p>
        </div>
      </div>

      {/* Haberes section */}
      <div className="bg-white border border-[var(--cx-border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100">
          <h2 className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
            <TrendingUp size={14} /> Haberes
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--cx-border)]">
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Concepto</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-500">Monto</th>
            </tr>
          </thead>
          <tbody>
            {haberes.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-center text-xs text-slate-400">
                  Sin haberes registrados
                </td>
              </tr>
            )}
            {haberes.map((line) => (
              <tr key={line.id} className="border-b border-[var(--cx-border)] last:border-0">
                <td className="px-4 py-2.5">
                  <span className="text-slate-700">{line.name}</span>
                  <span className="text-xs text-slate-400 ml-2">({line.code})</span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-800">
                  {clpFmt(line.total)}
                </td>
              </tr>
            ))}
            <tr className="bg-emerald-50/50">
              <td className="px-4 py-2.5 font-semibold text-emerald-800">Subtotal Haberes</td>
              <td className="px-4 py-2.5 text-right font-semibold text-emerald-800 tabular-nums">
                {clpFmt(totals.total_haberes)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Descuentos section */}
      <div className="bg-white border border-[var(--cx-border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-red-50 border-b border-red-100">
          <h2 className="text-sm font-semibold text-red-800 flex items-center gap-2">
            <TrendingDown size={14} /> Descuentos
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--cx-border)]">
              <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Concepto</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-500">Monto</th>
            </tr>
          </thead>
          <tbody>
            {descuentos.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-center text-xs text-slate-400">
                  Sin descuentos registrados
                </td>
              </tr>
            )}
            {descuentos.map((line) => (
              <tr key={line.id} className="border-b border-[var(--cx-border)] last:border-0">
                <td className="px-4 py-2.5">
                  <span className="text-slate-700">{line.name}</span>
                  <span className="text-xs text-slate-400 ml-2">({line.code})</span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-red-600">
                  -{clpFmt(Math.abs(line.total))}
                </td>
              </tr>
            ))}
            <tr className="bg-red-50/50">
              <td className="px-4 py-2.5 font-semibold text-red-800">Subtotal Descuentos</td>
              <td className="px-4 py-2.5 text-right font-semibold text-red-800 tabular-nums">
                -{clpFmt(totals.total_descuentos)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Total final */}
      <div className="bg-gradient-to-r from-violet-600 to-indigo-600 rounded-xl p-5 text-center">
        <p className="text-sm text-violet-200 mb-1">Liquido a Pagar</p>
        <p className="text-3xl font-bold text-white tabular-nums">
          {clpFmt(totals.total_pagar)}
        </p>
      </div>
    </div>
  )
}
