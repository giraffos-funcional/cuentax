/**
 * CUENTAX — Reportes (LCV + F29)
 * Mia: "Los reportes son navegación contable. 
 * Tabs limpias, filtros por período, descarga directa.
 * El contador necesita esto en < 3 clics."
 */

'use client'

import { useState } from 'react'
import { Download, Calendar, TrendingUp, TrendingDown,
         FileSpreadsheet, Printer, BarChart3 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
         ResponsiveContainer, Legend } from 'recharts'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
               'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const CHART_DATA = [
  { mes: 'Oct', ventas: 8500000, compras: 3200000 },
  { mes: 'Nov', ventas: 11200000, compras: 4100000 },
  { mes: 'Dic', ventas: 14800000, compras: 5600000 },
  { mes: 'Ene', ventas: 9200000, compras: 3800000 },
  { mes: 'Feb', ventas: 10500000, compras: 4200000 },
  { mes: 'Mar', ventas: 12450000, compras: 4900000 },
]

const LCV_VENTAS = [
  { folio: 1043, tipo: 33, receptor: 'Empresa ABC Ltda.', rut: '12.345.678-9', fecha: '2026-03-26', neto: 1050420, iva: 199580, total: 1250000 },
  { folio: 1042, tipo: 39, receptor: 'Cliente Persona',   rut: '9.876.543-2',  fecha: '2026-03-26', neto: 38571,  iva: 7329,  total: 45900 },
  { folio: 1041, tipo: 33, receptor: 'Tech Solutions SpA',rut: '76.543.210-K', fecha: '2026-03-25', neto: 747899, iva: 142101,total: 890000 },
  { folio: 1037, tipo: 56, receptor: 'Supplier Group',    rut: '88.776.655-4', fecha: '2026-03-22', neto: 285714, iva: 54286, total: 340000 },
]

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
          ? 'bg-violet-500/10 text-violet-300 border border-violet-500/20'
          : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
        }
      `}
    >
      {icon}{label}
    </button>
  )
}

// ── LCV Table ─────────────────────────────────────────────────
function LCVTable() {
  const [activeBook, setActive] = useState<'ventas' | 'compras'>('ventas')
  const totalNeto  = LCV_VENTAS.reduce((s, r) => s + r.neto, 0)
  const totalIva   = LCV_VENTAS.reduce((s, r) => s + r.iva, 0)
  const totalTotal = LCV_VENTAS.reduce((s, r) => s + r.total, 0)

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
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20'
                  : 'bg-blue-500/15 text-blue-300 border border-blue-500/20'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {b === 'ventas' ? 'Libro de Ventas' : 'Libro de Compras'}
          </button>
        ))}
      </div>

      <div className="bg-slate-900/60 border border-white/[0.07] rounded-2xl overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-white/[0.06] text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
          <div className="col-span-1">Folio</div>
          <div className="col-span-1">Tipo</div>
          <div className="col-span-3">Razón Social</div>
          <div className="col-span-2">RUT</div>
          <div className="col-span-1">Fecha</div>
          <div className="col-span-2 text-right">Neto</div>
          <div className="col-span-1 text-right">IVA</div>
          <div className="col-span-1 text-right">Total</div>
        </div>

        <div className="divide-y divide-white/[0.04]">
          {LCV_VENTAS.map(r => (
            <div key={r.folio} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-white/[0.01] transition-colors">
              <div className="col-span-1 text-white font-mono">#{r.folio}</div>
              <div className="col-span-1 text-slate-400">{r.tipo}</div>
              <div className="col-span-3 text-white truncate">{r.receptor}</div>
              <div className="col-span-2 text-slate-400 font-mono text-xs">{r.rut}</div>
              <div className="col-span-1 text-slate-400 text-xs">{r.fecha.slice(5)}</div>
              <div className="col-span-2 text-right text-slate-300">{formatCLP(r.neto)}</div>
              <div className="col-span-1 text-right text-slate-400 text-xs">{formatCLP(r.iva)}</div>
              <div className="col-span-1 text-right text-white font-semibold">{formatCLP(r.total)}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-white/[0.07] bg-white/[0.01] text-sm font-bold">
          <div className="col-span-7 text-slate-400">TOTALES</div>
          <div className="col-span-2 text-right text-white">{formatCLP(totalNeto)}</div>
          <div className="col-span-1 text-right text-slate-400">{formatCLP(totalIva)}</div>
          <div className="col-span-2 text-right text-violet-300">{formatCLP(totalTotal)}</div>
        </div>
      </div>
    </div>
  )
}

// ── F29 Preview ───────────────────────────────────────────────
function F29Preview() {
  const ventas_neto = 2122604
  const ventas_iva  = 403296
  const compras_cf  = 156000  // Crédito fiscal compras

  const debito_fiscal  = ventas_iva
  const credito_fiscal = compras_cf
  const ppm = Math.round(ventas_neto * 0.015)
  const impuesto_pagar = debito_fiscal - credito_fiscal + ppm

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
        <span className="text-amber-400 text-xs font-medium">
          ⚠️  Vista previa — Período: Marzo 2026. Verificar antes de presentar al SII.
        </span>
      </div>

      <div className="bg-slate-900/60 border border-white/[0.07] rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <FileSpreadsheet size={15} className="text-violet-400" />
          Formulario 29 — Declaración IVA Mensual
        </h3>

        <div className="space-y-2">
          {[
            { label: 'Débito Fiscal (IVA Ventas)',          value: debito_fiscal,  color: 'text-red-400' },
            { label: 'Crédito Fiscal (IVA Compras)',        value: -credito_fiscal, color: 'text-emerald-400' },
            { label: 'PPM (1.5% ventas netas)',             value: ppm,            color: 'text-amber-400' },
          ].map(row => (
            <div key={row.label} className="flex justify-between py-2 border-b border-white/[0.04]">
              <span className="text-sm text-slate-400">{row.label}</span>
              <span className={`text-sm font-semibold ${row.color}`}>
                {row.value < 0 ? '-' : ''}{formatCLP(Math.abs(row.value))}
              </span>
            </div>
          ))}
          <div className="flex justify-between pt-3">
            <span className="font-bold text-white">TOTAL A PAGAR</span>
            <span className="font-bold text-xl text-violet-300">{formatCLP(impuesto_pagar)}</span>
          </div>
        </div>

        <button className="btn-primary w-full justify-center">
          <Printer size={14} /> Generar PDF F29
        </button>
      </div>
    </div>
  )
}

// ── Chart ─────────────────────────────────────────────────────
function ChartView() {
  return (
    <div className="bg-slate-900/60 border border-white/[0.07] rounded-2xl p-6">
      <h3 className="text-sm font-semibold text-white mb-5">Ventas vs Compras — Últimos 6 meses</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={CHART_DATA}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} />
          <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }}
            formatter={(v: number) => [formatCLP(v)]}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          <Bar dataKey="ventas" name="Ventas" fill="#7c3aed" radius={[4,4,0,0]} />
          <Bar dataKey="compras" name="Compras" fill="#1e40af" radius={[4,4,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────
export default function ReportesPage() {
  const [tab, setTab] = useState<Tab>('lcv')
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(2) // Marzo

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Reportes</h1>
          <p className="text-sm text-slate-500 mt-0.5">LCV · F29 · Gráficos de gestión</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="input-field py-2 text-sm w-auto">
            {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="input-field py-2 text-sm w-auto">
            {[2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="btn-secondary flex items-center gap-2">
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

      {tab === 'lcv'      && <LCVTable />}
      {tab === 'f29'      && <F29Preview />}
      {tab === 'graficos' && <ChartView />}
    </div>
  )
}
