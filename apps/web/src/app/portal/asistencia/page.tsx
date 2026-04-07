/**
 * CUENTAX — Portal del Trabajador: Asistencia
 * Shows the employee's attendance records by month.
 */

'use client'

import { useState } from 'react'
import { usePortalAttendance } from '@/hooks/use-portal'
import { Clock4, Loader2, AlertCircle, Calendar, Timer } from 'lucide-react'

// ── Month names ───────────────────────────────────────────────
const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// ── Format datetime ───────────────────────────────────────────
function formatDateTime(dt: string): string {
  if (!dt) return '-'
  const d = new Date(dt.replace(' ', 'T'))
  return d.toLocaleString('es-CL', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTime(dt: string): string {
  if (!dt) return '-'
  const d = new Date(dt.replace(' ', 'T'))
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

function formatDateOnly(dt: string): string {
  if (!dt) return '-'
  const d = new Date(dt.replace(' ', 'T'))
  return d.toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short' })
}

function formatHours(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

export default function PortalAsistenciaPage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())

  const { asistencia, resumen, total, isLoading, error } = usePortalAttendance(month, year)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Asistencia</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Tu registro de asistencia mensual
          </p>
        </div>

        {/* Period selectors */}
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            aria-label="Seleccionar mes"
            className="input-field !w-auto text-sm px-3 py-1.5"
          >
            {MONTHS_ES.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="Seleccionar año"
            className="input-field !w-auto text-sm px-3 py-1.5"
          >
            {Array.from({ length: 3 }, (_, i) => now.getFullYear() - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[var(--cx-border)] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Calendar size={14} className="text-violet-500" />
            <span className="text-xs text-slate-500">Periodo</span>
          </div>
          <p className="text-sm font-semibold text-slate-800">{resumen.periodo || `${MONTHS_ES[month - 1]} ${year}`}</p>
        </div>
        <div className="bg-white border border-[var(--cx-border)] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock4 size={14} className="text-violet-500" />
            <span className="text-xs text-slate-500">Dias Trabajados</span>
          </div>
          <p className="text-lg font-semibold text-slate-800 tabular-nums">{resumen.dias_trabajados}</p>
        </div>
        <div className="bg-white border border-[var(--cx-border)] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Timer size={14} className="text-violet-500" />
            <span className="text-xs text-slate-500">Horas Totales</span>
          </div>
          <p className="text-lg font-semibold text-slate-800 tabular-nums">{formatHours(resumen.total_horas)}</p>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-violet-500" />
          <span className="ml-2 text-sm text-slate-500">Cargando asistencia...</span>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200">
          <AlertCircle size={16} className="text-red-500" />
          <span className="text-sm text-red-600">Error al cargar asistencia</span>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && asistencia.length === 0 && (
        <div className="text-center py-12 bg-white border border-[var(--cx-border)] rounded-xl">
          <Clock4 size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">Sin registros de asistencia para este periodo</p>
        </div>
      )}

      {/* Attendance table */}
      {!isLoading && asistencia.length > 0 && (
        <div className="bg-white border border-[var(--cx-border)] rounded-xl overflow-hidden">
          {/* Desktop */}
          <div className="hidden sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-[var(--cx-border)]">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Fecha</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-slate-500">Entrada</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-slate-500">Salida</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500">Horas</th>
                </tr>
              </thead>
              <tbody>
                {asistencia.map((record) => (
                  <tr key={record.id} className="border-b border-[var(--cx-border)] last:border-0 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-2.5 text-slate-700 font-medium">
                      {formatDateOnly(record.check_in)}
                    </td>
                    <td className="px-4 py-2.5 text-center text-slate-600 tabular-nums">
                      {formatTime(record.check_in)}
                    </td>
                    <td className="px-4 py-2.5 text-center text-slate-600 tabular-nums">
                      {record.check_out ? formatTime(record.check_out) : (
                        <span className="text-amber-600 text-xs">En curso</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-800 tabular-nums font-medium">
                      {formatHours(record.worked_hours)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="sm:hidden divide-y divide-[var(--cx-border)]">
            {asistencia.map((record) => (
              <div key={record.id} className="p-4 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">
                    {formatDateOnly(record.check_in)}
                  </span>
                  <span className="text-sm font-semibold text-slate-800 tabular-nums">
                    {formatHours(record.worked_hours)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>Entrada: {formatTime(record.check_in)}</span>
                  <span>Salida: {record.check_out ? formatTime(record.check_out) : 'En curso'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
