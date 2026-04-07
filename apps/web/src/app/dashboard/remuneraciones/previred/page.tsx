/**
 * CUENTAX — Previred File Generator
 * Monthly contribution file (.pre) for AFP, health, and unemployment declarations.
 */

'use client'

import { useState } from 'react'
import {
  Send, Loader2, AlertCircle, Download, CheckCircle2, XCircle,
  Users, ShieldCheck, FileText,
} from 'lucide-react'
import { usePreviredPreview } from '@/hooks/use-remuneraciones'
import { formatCLP, MONTHS } from '@/lib/formatters'

// ── State components ────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando datos de Previred...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando datos de Previred'}</span>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-1">
      <div className="w-16 h-16 mb-3 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center shadow-sm">
        <Send size={28} className="text-blue-500" />
      </div>
      <p className="text-base font-semibold text-[var(--cx-text-primary)]">
        Sin datos para este periodo
      </p>
      <p className="text-sm text-[var(--cx-text-muted)] max-w-sm text-center">
        No se encontraron liquidaciones confirmadas para el periodo seleccionado.
        Confirma las liquidaciones antes de generar el archivo Previred.
      </p>
    </div>
  )
}

// ── Summary card ────────────────────────────────────────────────

function SummaryCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Users }) {
  return (
    <div className="card border border-[var(--cx-border-light)] rounded-2xl p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-[var(--cx-bg-elevated)] flex items-center justify-center">
        <Icon size={18} className="text-[var(--cx-active-icon)]" />
      </div>
      <div>
        <p className="text-xs text-[var(--cx-text-muted)] uppercase tracking-wide">{label}</p>
        <p className="text-lg font-bold text-[var(--cx-text-primary)]">{value}</p>
      </div>
    </div>
  )
}

// ── Validation panel ────────────────────────────────────────────

interface ValidationData {
  valid: boolean
  errors: Array<{ employee: string; rut: string; issues: string[] }>
}

function ValidationPanel({ validation, total }: { validation: ValidationData; total: number }) {
  if (total === 0) return null

  return (
    <div className={`rounded-2xl border p-4 ${
      validation.valid
        ? 'bg-green-50 border-green-200'
        : 'bg-red-50 border-red-200'
    }`}>
      <div className="flex items-center gap-2 mb-2">
        {validation.valid ? (
          <>
            <CheckCircle2 size={18} className="text-green-600" />
            <span className="text-sm font-semibold text-green-800">
              Validacion exitosa - {total} empleado{total !== 1 ? 's' : ''} listos para Previred
            </span>
          </>
        ) : (
          <>
            <XCircle size={18} className="text-red-600" />
            <span className="text-sm font-semibold text-red-800">
              {validation.errors.length} empleado{validation.errors.length !== 1 ? 's' : ''} con problemas
            </span>
          </>
        )}
      </div>

      {!validation.valid && validation.errors.length > 0 && (
        <ul className="space-y-1.5 mt-3">
          {validation.errors.map((err, i) => (
            <li key={i} className="text-xs text-red-700 bg-red-100/60 rounded-lg px-3 py-2">
              <span className="font-medium">{err.rut || 'Sin RUT'}</span>
              <ul className="mt-0.5 ml-3 list-disc">
                {err.issues.map((issue, j) => (
                  <li key={j}>{issue}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Table columns ───────────────────────────────────────────────

interface TableColumn {
  header: string
  key: string
  align?: 'left' | 'right' | 'center'
  format?: (v: number) => string
}

const TABLE_COLUMNS: TableColumn[] = [
  { header: 'N',              key: '_index',              align: 'center' },
  { header: 'RUT',             key: 'rut',                 align: 'left' },
  { header: 'AFP',             key: 'afp_code',            align: 'center' },
  { header: 'Isapre',          key: 'isapre_code',         align: 'center' },
  { header: 'Renta Imp.',      key: 'renta_imponible',     align: 'right', format: formatCLP },
  { header: 'Cotiz. AFP',      key: 'cotiz_afp',           align: 'right', format: formatCLP },
  { header: 'Salud',           key: 'cotiz_salud',         align: 'right', format: formatCLP },
  { header: 'Ces. Trab.',      key: 'cesantia_trabajador',  align: 'right', format: formatCLP },
  { header: 'Ces. Emp.',       key: 'cesantia_empleador',   align: 'right', format: formatCLP },
  { header: 'Impuesto',        key: 'impuesto_unico',      align: 'right', format: formatCLP },
  { header: 'Mutual',          key: 'mutual',              align: 'right', format: formatCLP },
]

// ── Main page ───────────────────────────────────────────────────

export default function PreviredPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const { employees, validation, total, isLoading, error } = usePreviredPreview(month, year)

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  // Compute summary totals
  const totalAFP = employees.reduce((s: number, e: any) => s + (e.cotiz_afp ?? 0), 0)
  const totalSalud = employees.reduce((s: number, e: any) => s + (e.cotiz_salud ?? 0) + (e.salud_adicional ?? 0), 0)
  const totalCesantia = employees.reduce(
    (s: number, e: any) => s + (e.cesantia_trabajador ?? 0) + (e.cesantia_empleador ?? 0), 0,
  )

  const handleDownload = () => {
    const bffUrl = process.env['NEXT_PUBLIC_BFF_URL'] ?? 'http://localhost:4000'
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') ?? '' : ''
    window.open(
      `${bffUrl}/api/v1/remuneraciones/previred/file?mes=${month}&year=${year}&token=${token}`,
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
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Archivo Previred</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            Genera el archivo .pre mensual para declarar cotizaciones AFP, salud y cesantia
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            disabled={isLoading || total === 0 || !validation.valid}
            className="btn-primary flex items-center gap-1.5 disabled:opacity-40"
          >
            <Download size={14} /> Descargar .pre
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
        {!isLoading && total > 0 && (
          <span className="self-center text-xs text-[var(--cx-text-muted)]">
            {total} empleado{total !== 1 ? 's' : ''} en el periodo
          </span>
        )}
      </div>

      {/* Loading / Error */}
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error?.message} />}

      {!isLoading && !error && (
        total === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard label="Total Empleados" value={String(total)} icon={Users} />
              <SummaryCard label="Total AFP" value={formatCLP(totalAFP)} icon={ShieldCheck} />
              <SummaryCard label="Total Salud" value={formatCLP(totalSalud)} icon={FileText} />
              <SummaryCard label="Total Cesantia" value={formatCLP(totalCesantia)} icon={Send} />
            </div>

            {/* Validation panel */}
            <ValidationPanel validation={validation} total={total} />

            {/* Data table */}
            <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
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

                  <tbody className="divide-y divide-[var(--cx-border-light)]">
                    {employees.map((emp: any, idx: number) => (
                      <tr key={emp.rut ?? idx} className="hover:bg-[var(--cx-hover-bg)] transition-colors">
                        {TABLE_COLUMNS.map(col => {
                          const raw = col.key === '_index' ? idx + 1 : emp[col.key]
                          const display = col.format ? col.format(raw as number) : String(raw ?? '-')
                          return (
                            <td
                              key={col.key}
                              className={`px-2 py-2 text-xs text-[var(--cx-text-primary)] whitespace-nowrap ${alignClass(col.align)}`}
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
                        } else if (col.key === 'rut') {
                          display = 'TOTALES'
                        } else if (col.key === 'afp_code' || col.key === 'isapre_code') {
                          display = ''
                        } else if (col.format) {
                          const val = employees.reduce((s: number, e: any) => s + (e[col.key] ?? 0), 0)
                          display = col.format(val)
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
          </>
        )
      )}
    </div>
  )
}
