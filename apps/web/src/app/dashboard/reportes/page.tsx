/**
 * CUENTAX — Reportes (LCV + F29)
 * Connected to real data via useLCV, useF29 hooks (Odoo accounting).
 * Falls back gracefully when Odoo is unavailable.
 */

'use client'

import { useState } from 'react'
import { Download, Calendar, TrendingUp, TrendingDown,
         FileSpreadsheet, Printer, BarChart3, Loader2, AlertCircle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
         ResponsiveContainer, Legend } from 'recharts'
import { useLCV, useF29 } from '@/hooks'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
               'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

type Tab = 'lcv' | 'f29' | 'graficos'

function TabButton({ id, current, label, icon, onClick }: {
  id: Tab, current: Tab, label: string, icon: React.ReactNode, onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
        ${current === id
          ? 'bg-[var(--cx-active-bg)] text-[var(--cx-active-text)] border border-[var(--cx-active-border)]'
          : 'text-[var(--cx-text-secondary)] border-[var(--cx-border-light)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)]'
        }
      `}
    >
      {icon}{label}
    </button>
  )
}

function SourceBadge({ source }: { source: string }) {
  if (source === 'odoo') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border border-[var(--cx-status-ok-border)]">
        Odoo
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--cx-status-warn-bg)] text-[var(--cx-status-warn-text)] border border-[var(--cx-status-warn-border)]">
        Local
    </span>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando datos...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando datos'}</span>
    </div>
  )
}

// ── LCV Table ─────────────────────────────────────────────────
function LCVTable({ mes, year }: { mes: number, year: number }) {
  const [activeBook, setActive] = useState<'ventas' | 'compras'>('ventas')
  const { registros, totales, source, isLoading, error } = useLCV(mes, year, activeBook)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(['ventas', 'compras'] as const).map(b => (
          <button
            key={b}
            onClick={() => setActive(b)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
              activeBook === b
                ? b === 'ventas'
                  ? 'bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border border-[var(--cx-status-ok-border)]'
                  : 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'text-[var(--cx-text-secondary)] hover:text-[var(--cx-text-primary)]'
            }`}
          >
            {b === 'ventas' ? 'Libro de Ventas' : 'Libro de Compras'}
          </button>
        ))}
        <div className="flex-1" />
        <button
          className="btn-secondary flex items-center gap-2 text-xs py-1.5 px-3"
          onClick={() => exportCSV(registros, `lcv-${activeBook}`)}
        >
          <Download size={12} /> Exportar CSV
        </button>
        <SourceBadge source={source} />
      </div>

      {isLoading && <LoadingState />}
      {error && <ErrorState />}

      {!isLoading && !error && (
        <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-[var(--cx-border-light)] text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest">
            <div className="col-span-1">Folio</div>
            <div className="col-span-1">Tipo</div>
            <div className="col-span-3">Razón Social</div>
            <div className="col-span-2">RUT</div>
            <div className="col-span-1">Fecha</div>
            <div className="col-span-2 text-right">Neto</div>
            <div className="col-span-1 text-right">IVA</div>
            <div className="col-span-1 text-right">Total</div>
          </div>

          {registros.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--cx-text-muted)]">
              No hay registros para este período
            </div>
          ) : (
            <div className="divide-y divide-[var(--cx-border-light)]">
              {registros.map((r: any, i: number) => (
                <div key={r.folio ?? i} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors">
                  <div className="col-span-1 text-[var(--cx-text-primary)] font-mono">#{r.folio ?? r.l10n_latam_document_number ?? '-'}</div>
                  <div className="col-span-1 text-[var(--cx-text-secondary)]">{r.tipo_dte ?? r.tipo ?? '-'}</div>
                  <div className="col-span-3 text-[var(--cx-text-primary)] truncate">{r.razon_social_receptor ?? r.receptor ?? '-'}</div>
                  <div className="col-span-2 text-[var(--cx-text-secondary)] font-mono text-xs">{r.rut_receptor ?? r.rut ?? '-'}</div>
                  <div className="col-span-1 text-[var(--cx-text-secondary)] text-xs">{(r.fecha_emision ?? r.fecha ?? '').slice(5)}</div>
                  <div className="col-span-2 text-right text-[var(--cx-text-primary)]">{formatCLP(r.monto_neto ?? r.neto ?? r.amount_untaxed ?? 0)}</div>
                  <div className="col-span-1 text-right text-[var(--cx-text-secondary)] text-xs">{formatCLP(r.monto_iva ?? r.iva ?? r.amount_tax ?? 0)}</div>
                  <div className="col-span-1 text-right text-[var(--cx-text-primary)] font-semibold">{formatCLP(r.monto_total ?? r.total ?? r.amount_total ?? 0)}</div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)] text-sm font-bold">
            <div className="col-span-7 text-[var(--cx-text-secondary)]">TOTALES</div>
            <div className="col-span-2 text-right text-[var(--cx-text-primary)]">{formatCLP(totales.neto)}</div>
            <div className="col-span-1 text-right text-[var(--cx-text-secondary)]">{formatCLP(totales.iva)}</div>
            <div className="col-span-2 text-right text-[var(--cx-active-icon)]">{formatCLP(totales.total)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── F29 Preview ───────────────────────────────────────────────
function F29Preview({ mes, year }: { mes: number, year: number }) {
  const { f29, source, nota, isLoading, error } = useF29(mes, year)

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState />
  if (!f29) return <div className="text-sm text-[var(--cx-text-muted)] py-8 text-center">Sin datos para este período</div>

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--cx-status-warn-bg)] border border-[var(--cx-status-warn-border)]">
        <span className="text-[var(--cx-status-warn-text)] text-xs font-medium">
          ⚠ {nota ?? `Vista previa — Período: ${MESES[mes - 1]} ${year}. Verificar antes de presentar al SII.`}
        </span>
        <div className="flex-1" />
        <SourceBadge source={source} />
      </div>

      <div className="card border border-[var(--cx-border-light)] rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-[var(--cx-text-primary)] flex items-center gap-2">
          <FileSpreadsheet size={15} className="text-[var(--cx-active-icon)]" />
          Formulario 29 — Declaración IVA Mensual
        </h3>

        <div className="space-y-2">
          {[
            { label: 'Débito Fiscal (IVA Ventas)',   value: f29.debito_fiscal,     color: 'text-[var(--cx-status-error-text)]' },
            { label: 'Crédito Fiscal (IVA Compras)',  value: -f29.credito_fiscal,   color: 'text-[var(--cx-status-ok-text)]' },
            { label: 'PPM (1.5% ventas netas)',       value: f29.ppm_1_5pct ?? f29.ppm ?? 0, color: 'text-[var(--cx-status-warn-text)]' },
          ].map(row => (
            <div key={row.label} className="flex justify-between py-2 border-b border-[var(--cx-border-light)]">
              <span className="text-sm text-[var(--cx-text-secondary)]">{row.label}</span>
              <span className={`text-sm font-semibold ${row.color}`}>
                {row.value < 0 ? '-' : ''}{formatCLP(Math.abs(row.value))}
              </span>
            </div>
          ))}
          <div className="flex justify-between pt-3">
            <span className="font-bold text-[var(--cx-text-primary)]">TOTAL A PAGAR</span>
            <span className="font-bold text-xl text-[var(--cx-active-icon)]">{formatCLP(f29.total_a_pagar)}</span>
          </div>
        </div>

        <button className="btn-primary w-full justify-center" onClick={() => window.print()}>
          <Printer size={14} /> Generar PDF F29
        </button>
      </div>
    </div>
  )
}

// ── Chart ─────────────────────────────────────────────────────
function ChartView({ mes, year }: { mes: number, year: number }) {
  // Build last 6 months for chart
  const months: { mes: string, mesNum: number, yearNum: number }[] = []
  for (let i = 5; i >= 0; i--) {
    let m = mes - i
    let y = year
    if (m <= 0) { m += 12; y -= 1 }
    months.push({ mes: MESES[m - 1], mesNum: m, yearNum: y })
  }

  return (
    <div className="card border border-[var(--cx-border-light)] rounded-2xl p-6">
      <h3 className="text-sm font-semibold text-[var(--cx-text-primary)] mb-5">Ventas vs Compras — Últimos 6 meses</h3>
      <ChartContent months={months} />
    </div>
  )
}

function ChartContent({ months }: { months: { mes: string, mesNum: number, yearNum: number }[] }) {
  // Fetch LCV data for each month to build chart
  // For now use the current month's data as sample — full implementation would need multiple SWR calls
  const chartData = months.map(m => ({
    mes: m.mes,
    ventas: 0,
    compras: 0,
  }))

  // Use the last month hook to at least show current data
  const last = months[months.length - 1]
  const { totales: ventasTotales } = useLCV(last.mesNum, last.yearNum, 'ventas')
  const { totales: comprasTotales } = useLCV(last.mesNum, last.yearNum, 'compras')

  chartData[chartData.length - 1] = {
    mes: last.mes,
    ventas: ventasTotales.total,
    compras: comprasTotales.total,
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--cx-border)" />
        <XAxis dataKey="mes" tick={{ fill: 'var(--cx-text-secondary)', fontSize: 12 }} axisLine={false} />
        <YAxis tick={{ fill: 'var(--cx-text-secondary)', fontSize: 11 }} axisLine={false} tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} />
        <Tooltip
          contentStyle={{ background: 'var(--cx-bg-surface)', border: '1px solid var(--cx-border-light)', borderRadius: 12, fontSize: 12 }}
          formatter={(v: number) => [formatCLP(v)]}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--cx-text-muted)' }} />
        {/* SVG fill doesn't support CSS vars — using brand hex values (cx-violet-600, cx-indigo-500) */}
        <Bar dataKey="ventas" name="Ventas" fill="#7c3aed" radius={[4,4,0,0]} />
        <Bar dataKey="compras" name="Compras" fill="#4f46e5" radius={[4,4,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── CSV export helper ──────────────────────────────────────────
const exportCSV = (data: any[], filename: string) => {
  if (!data.length) return
  const headers = Object.keys(data[0])
  const csv = [
    headers.join(','),
    ...data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Page ──────────────────────────────────────────────────────
export default function ReportesPage() {
  const now = new Date()
  const [tab, setTab] = useState<Tab>('lcv')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Reportes</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">LCV · F29 · Gráficos de gestión</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="input-field py-2 text-sm w-auto">
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="input-field py-2 text-sm w-auto">
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="btn-secondary flex items-center gap-2" onClick={() => window.print()}>
            <Download size={13} /> Exportar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <TabButton id="lcv"      current={tab} label="Libros CV"    icon={<FileSpreadsheet size={13} />} onClick={() => setTab('lcv')} />
        <TabButton id="f29"      current={tab} label="F29"          icon={<Calendar size={13} />}       onClick={() => setTab('f29')} />
        <TabButton id="graficos" current={tab} label="Gráficos"     icon={<BarChart3 size={13} />}      onClick={() => setTab('graficos')} />
      </div>

      {tab === 'lcv'      && <LCVTable mes={month} year={year} />}
      {tab === 'f29'      && <F29Preview mes={month} year={year} />}
      {tab === 'graficos' && <ChartView mes={month} year={year} />}
    </div>
  )
}
