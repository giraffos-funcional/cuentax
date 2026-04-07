/**
 * CUENTAX — Portal del Trabajador: Ausencias
 * Shows the employee's leave requests and balance.
 */

'use client'

import { usePortalLeaves } from '@/hooks/use-portal'
import { CalendarDays, Loader2, AlertCircle, BarChart3 } from 'lucide-react'

// ── Leave state ───────────────────────────────────────────────
function leaveStateLabel(state: string): { label: string; color: string } {
  switch (state) {
    case 'validate':
      return { label: 'Aprobada', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    case 'validate1':
      return { label: 'En revision', color: 'bg-amber-50 text-amber-700 border-amber-200' }
    case 'confirm':
      return { label: 'Pendiente', color: 'bg-blue-50 text-blue-700 border-blue-200' }
    case 'refuse':
      return { label: 'Rechazada', color: 'bg-red-50 text-red-600 border-red-200' }
    case 'draft':
      return { label: 'Borrador', color: 'bg-slate-50 text-slate-600 border-slate-200' }
    default:
      return { label: state, color: 'bg-slate-50 text-slate-600 border-slate-200' }
  }
}

// ── Date formatter ────────────────────────────────────────────
function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr.replace(' ', 'T'))
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function PortalAusenciasPage() {
  const { ausencias, saldos, isLoading, error } = usePortalLeaves()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-violet-500" />
        <span className="ml-2 text-sm text-slate-500">Cargando ausencias...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200">
        <AlertCircle size={16} className="text-red-500" />
        <span className="text-sm text-red-600">Error al cargar ausencias</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Ausencias</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Tus solicitudes de ausencia y saldos disponibles
        </p>
      </div>

      {/* Leave balance cards */}
      {saldos.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-3">
            <BarChart3 size={14} /> Saldo de Dias
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {saldos.map((s) => {
              const pct = s.allocated > 0 ? Math.round((s.taken / s.allocated) * 100) : 0
              return (
                <div key={s.type} className="bg-white border border-[var(--cx-border)] rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-500 mb-2">{s.type}</p>
                  <div className="flex items-end justify-between mb-2">
                    <div>
                      <span className="text-2xl font-bold text-violet-700 tabular-nums">{s.remaining}</span>
                      <span className="text-sm text-slate-400 ml-1">disponibles</span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {s.taken} de {s.allocated} usados
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-amber-400' : 'bg-violet-400'
                      }`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Leave requests */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-3">
          <CalendarDays size={14} /> Solicitudes
        </h2>

        {ausencias.length === 0 ? (
          <div className="text-center py-12 bg-white border border-[var(--cx-border)] rounded-xl">
            <CalendarDays size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-slate-500">No tienes solicitudes de ausencia</p>
          </div>
        ) : (
          <div className="bg-white border border-[var(--cx-border)] rounded-xl overflow-hidden">
            {/* Desktop table */}
            <div className="hidden sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-[var(--cx-border)]">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Tipo</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Periodo</th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-slate-500">Dias</th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-slate-500">Estado</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Descripcion</th>
                  </tr>
                </thead>
                <tbody>
                  {ausencias.map((a) => {
                    const { label, color } = leaveStateLabel(a.state)
                    return (
                      <tr key={a.id} className="border-b border-[var(--cx-border)] last:border-0 hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-slate-700">
                          {a.type}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 text-xs">
                          {formatDate(a.date_from)} - {formatDate(a.date_to)}
                        </td>
                        <td className="px-4 py-2.5 text-center tabular-nums text-slate-800 font-medium">
                          {a.days}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border ${color}`}>
                            {label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[200px] truncate">
                          {a.description || '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-[var(--cx-border)]">
              {ausencias.map((a) => {
                const { label, color } = leaveStateLabel(a.state)
                return (
                  <div key={a.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">{a.type}</span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border ${color}`}>
                        {label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{formatDate(a.date_from)} - {formatDate(a.date_to)}</span>
                      <span className="font-medium text-slate-800">{a.days} dia{a.days !== 1 ? 's' : ''}</span>
                    </div>
                    {a.description && (
                      <p className="text-xs text-slate-400">{a.description}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
