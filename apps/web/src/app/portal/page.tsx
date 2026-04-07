/**
 * CUENTAX — Portal del Trabajador: Mis Liquidaciones
 * Main portal page listing the employee's payslips.
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePortalAuthStore } from '@/stores/portal-auth.store'
import { usePortalPayslips, downloadPortalPayslipPDF } from '@/hooks/use-portal'
import {
  Receipt, Download, ChevronRight, FileText,
  Loader2, AlertCircle,
} from 'lucide-react'

// ── CLP formatter ─────────────────────────────────────────────
const clpFmt = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

// ── State label + color ───────────────────────────────────────
function stateLabel(state: string): { label: string; color: string } {
  switch (state) {
    case 'done':
      return { label: 'Confirmada', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    case 'paid':
      return { label: 'Pagada', color: 'bg-blue-50 text-blue-700 border-blue-200' }
    default:
      return { label: state, color: 'bg-slate-50 text-slate-600 border-slate-200' }
  }
}

export default function PortalPayslipsPage() {
  const employee = usePortalAuthStore((s) => s.employee)
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const { liquidaciones, total, isLoading, error } = usePortalPayslips(year)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)

  const handleDownload = async (id: number, periodLabel?: string, name?: string) => {
    setDownloadingId(id)
    try {
      await downloadPortalPayslipPDF(id, periodLabel, name)
    } catch {
      // Handled by interceptor
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">
            Hola, {employee?.name?.split(' ')[0] ?? 'Trabajador'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Tus liquidaciones de sueldo
          </p>
        </div>

        {/* Year selector */}
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="Seleccionar año"
            className="input-field !w-auto text-sm px-3 py-1.5"
          >
            {Array.from({ length: 5 }, (_, i) => currentYear - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-violet-500" />
          <span className="ml-2 text-sm text-slate-500">Cargando liquidaciones...</span>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200">
          <AlertCircle size={16} className="text-red-500" />
          <span className="text-sm text-red-600">Error al cargar liquidaciones</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && liquidaciones.length === 0 && (
        <div className="text-center py-16">
          <FileText size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No hay liquidaciones para {year}</p>
        </div>
      )}

      {/* Payslips list */}
      {!isLoading && liquidaciones.length > 0 && (
        <div className="bg-white border border-[var(--cx-border)] rounded-xl overflow-hidden">
          {/* Desktop table */}
          <div className="hidden sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-[var(--cx-border)]">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Periodo</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500">Bruto</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500">Liquido</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-slate-500">Estado</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {liquidaciones.map((liq) => {
                  const { label, color } = stateLabel(liq.state)
                  return (
                    <tr key={liq.id} className="border-b border-[var(--cx-border)] last:border-0 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/portal/liquidaciones/${liq.id}`}
                          className="font-medium text-slate-800 hover:text-violet-600 transition-colors"
                        >
                          {liq.period_label}
                        </Link>
                        <p className="text-xs text-slate-400 mt-0.5">{liq.number}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                        {clpFmt(liq.gross_wage)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800 tabular-nums">
                        {clpFmt(liq.net_wage)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border ${color}`}>
                          {label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleDownload(liq.id, liq.period_label, liq.name)}
                            disabled={downloadingId === liq.id}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-500 hover:text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-50"
                            title="Descargar PDF"
                          >
                            {downloadingId === liq.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Download size={12} />
                            )}
                            PDF
                          </button>
                          <Link
                            href={`/portal/liquidaciones/${liq.id}`}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-500 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                          >
                            Ver <ChevronRight size={12} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-[var(--cx-border)]">
            {liquidaciones.map((liq) => {
              const { label, color } = stateLabel(liq.state)
              return (
                <div key={liq.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Link
                      href={`/portal/liquidaciones/${liq.id}`}
                      className="font-medium text-slate-800 hover:text-violet-600 transition-colors"
                    >
                      {liq.period_label}
                    </Link>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border ${color}`}>
                      {label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Liquido</span>
                    <span className="font-semibold text-slate-800 tabular-nums">
                      {clpFmt(liq.net_wage)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleDownload(liq.id, liq.period_label, liq.name)}
                      disabled={downloadingId === liq.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-600 transition-colors disabled:opacity-50"
                    >
                      {downloadingId === liq.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Download size={12} />
                      )}
                      Descargar PDF
                    </button>
                    <Link
                      href={`/portal/liquidaciones/${liq.id}`}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-600 transition-colors"
                    >
                      Ver detalle <ChevronRight size={12} />
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Total count */}
      {!isLoading && total > 0 && (
        <p className="text-xs text-slate-400 text-center">
          {total} liquidacion{total !== 1 ? 'es' : ''} encontrada{total !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}
