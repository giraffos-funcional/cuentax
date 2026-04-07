/**
 * CUENTAX — Libro de Remuneraciones
 * Monthly payroll register report with export to PDF and CSV.
 */

'use client'

import { useState } from 'react'
import {
  BookText, Loader2, AlertCircle, Download, FileSpreadsheet,
} from 'lucide-react'
import { useLibroRemuneraciones } from '@/hooks/use-remuneraciones'
import { formatCLP, MONTHS } from '@/lib/formatters'

// ── State components ────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Generando libro de remuneraciones...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando libro de remuneraciones'}</span>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-1">
      <div className="w-16 h-16 mb-3 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center shadow-sm">
        <BookText size={28} className="text-violet-500" />
      </div>
      <p className="text-base font-semibold text-[var(--cx-text-primary)]">
        Sin datos para este período
      </p>
      <p className="text-sm text-[var(--cx-text-muted)] max-w-sm text-center">
        No se encontraron liquidaciones confirmadas para el período seleccionado.
        Asegúrate de que las liquidaciones estén en estado &quot;Confirmado&quot;.
      </p>
    </div>
  )
}

// ── Table column definitions ────────────────────────────────────

interface TableColumn {
  header: string
  key: string
  align?: 'left' | 'right' | 'center'
  format?: (v: number) => string
  className?: string
}

const TABLE_COLUMNS: TableColumn[] = [
  { header: 'N°',            key: '_index',              align: 'center' },
  { header: 'RUT',           key: 'employee_rut',        align: 'left' },
  { header: 'Nombre',        key: 'employee_name',       align: 'left',  className: 'min-w-[140px]' },
  { header: 'Depto.',        key: 'department',          align: 'left' },
  { header: 'Días',          key: 'dias_trabajados',     align: 'center' },
  { header: 'Sueldo Base',   key: 'sueldo_base',         align: 'right', format: formatCLP },
  { header: 'Gratif.',       key: 'gratificacion',       align: 'right', format: formatCLP },
  { header: 'Otros Hab.',    key: 'otros_haberes',       align: 'right', format: formatCLP },
  { header: 'Hab. Imp.',     key: 'total_haberes_imp',   align: 'right', format: formatCLP },
  { header: 'Hab. No Imp.',  key: 'total_haberes_no_imp', align: 'right', format: formatCLP },
  { header: 'AFP',           key: 'afp',                 align: 'right', format: formatCLP },
  { header: 'Salud',         key: 'salud',               align: 'right', format: formatCLP },
  { header: 'Cesantía',      key: 'cesantia',            align: 'right', format: formatCLP },
  { header: 'Impuesto',      key: 'impuesto',            align: 'right', format: formatCLP },
  { header: 'Tot. Desc.',    key: 'total_descuentos',    align: 'right', format: formatCLP },
  { header: 'Líquido',       key: 'liquido',             align: 'right', format: formatCLP, className: 'font-semibold' },
]

// ── Main page ───────────────────────────────────────────────────

export default function LibroRemuneracionesPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const { registros, totales, total_empleados, isLoading, error } = useLibroRemuneraciones(month, year)

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  const handleExportPDF = () => {
    const bffUrl = process.env['NEXT_PUBLIC_BFF_URL'] ?? 'http://localhost:4000'
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') ?? '' : ''
    window.open(
      `${bffUrl}/api/v1/remuneraciones/libro-remuneraciones/pdf?mes=${month}&year=${year}&token=${token}`,
      '_blank',
    )
  }

  const handleExportCSV = () => {
    const bffUrl = process.env['NEXT_PUBLIC_BFF_URL'] ?? 'http://localhost:4000'
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') ?? '' : ''
    window.open(
      `${bffUrl}/api/v1/remuneraciones/libro-remuneraciones/csv?mes=${month}&year=${year}&token=${token}`,
      '_blank',
    )
  }

  const alignClass = (align?: string) => {
    if (align === 'right') return 'text-right'
    if (align === 'center') return 'text-center'
    return 'text-left'
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Libro de Remuneraciones</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            Registro mensual de remuneraciones del personal
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportPDF}
            disabled={isLoading || registros.length === 0}
            className="btn-secondary flex items-center gap-1.5 disabled:opacity-40"
          >
            <Download size={14} /> PDF
          </button>
          <button
            onClick={handleExportCSV}
            disabled={isLoading || registros.length === 0}
            className="btn-secondary flex items-center gap-1.5 disabled:opacity-40"
          >
            <FileSpreadsheet size={14} /> CSV
          </button>
        </div>
      </div>

      {/* Period filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={month}
          onChange={e => setMonth(Number(e.target.value))}
          className="input-field py-2 text-sm w-auto"
        >
          {MONTHS.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="input-field py-2 text-sm w-auto"
        >
          {years.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        {!isLoading && registros.length > 0 && (
          <span className="self-center text-xs text-[var(--cx-text-muted)]">
            {total_empleados} empleado{total_empleados !== 1 ? 's' : ''} en el período
          </span>
        )}
      </div>

      {/* Content */}
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error?.message} />}

      {!isLoading && !error && (
        registros.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                {/* Header */}
                <thead>
                  <tr className="border-b border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)]">
                    {TABLE_COLUMNS.map(col => (
                      <th
                        key={col.key}
                        className={`px-2 py-2.5 text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest whitespace-nowrap ${alignClass(col.align)}`}
                      >
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* Body */}
                <tbody className="divide-y divide-[var(--cx-border-light)]">
                  {registros.map((r: any, idx: number) => (
                    <tr key={r.employee_id ?? idx} className="hover:bg-[var(--cx-hover-bg)] transition-colors">
                      {TABLE_COLUMNS.map(col => {
                        const raw = col.key === '_index' ? idx + 1 : r[col.key]
                        const display = col.format ? col.format(raw as number) : String(raw ?? '-')
                        return (
                          <td
                            key={col.key}
                            className={`px-2 py-2 text-xs text-[var(--cx-text-primary)] whitespace-nowrap ${alignClass(col.align)} ${col.className ?? ''}`}
                          >
                            {display}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>

                {/* Totals footer */}
                <tfoot>
                  <tr className="border-t-2 border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)] font-semibold">
                    {TABLE_COLUMNS.map(col => {
                      let display = ''
                      if (col.key === '_index') {
                        display = ''
                      } else if (col.key === 'employee_rut') {
                        display = 'TOTALES'
                      } else if (col.key === 'employee_name' || col.key === 'department' || col.key === 'dias_trabajados') {
                        display = ''
                      } else {
                        const val = (totales as Record<string, number>)[col.key] ?? 0
                        display = formatCLP(val)
                      }
                      return (
                        <td
                          key={col.key}
                          className={`px-2 py-2.5 text-xs text-[var(--cx-text-primary)] whitespace-nowrap ${alignClass(col.align)}`}
                        >
                          {display}
                        </td>
                      )
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  )
}
