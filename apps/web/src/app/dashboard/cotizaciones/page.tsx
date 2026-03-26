/**
 * CUENTAX — Cotizaciones (Sprint 3)
 * Mia: "Las cotizaciones son el primer paso para una factura.
 * Timeline visual, conversión a DTE en 1 click, y PDF premium."
 */

'use client'

import { useState } from 'react'
import { FileText, Plus, Send, CheckCircle2, Clock, XCircle,
         ArrowRight, Eye, Trash2, Edit } from 'lucide-react'

type CotizacionStatus = 'borrador' | 'enviada' | 'aceptada' | 'rechazada' | 'expirada' | 'convertida'

interface Cotizacion {
  id: string
  numero: number
  cliente: string
  rut: string
  fecha: string
  valida_hasta: string
  monto: number
  status: CotizacionStatus
  items_count: number
}

const MOCK: Cotizacion[] = [
  { id: '1', numero: 42, cliente: 'Empresa ABC Ltda.',  rut: '12.345.678-9', fecha: '2026-03-26', valida_hasta: '2026-04-09', monto: 1250000, status: 'enviada',    items_count: 3 },
  { id: '2', numero: 41, cliente: 'Tech Solutions SpA', rut: '76.543.210-K', fecha: '2026-03-24', valida_hasta: '2026-04-07', monto: 890000,  status: 'aceptada',   items_count: 5 },
  { id: '3', numero: 40, cliente: 'Import & Co.',        rut: '99.887.766-5', fecha: '2026-03-20', valida_hasta: '2026-04-03', monto: 3200000, status: 'rechazada',  items_count: 2 },
  { id: '4', numero: 39, cliente: 'Startup XYZ',         rut: '77.665.544-3', fecha: '2026-03-18', valida_hasta: '2026-04-01', monto: 450000,  status: 'convertida', items_count: 1 },
  { id: '5', numero: 38, cliente: 'Consultora Sur',      rut: '66.554.433-2', fecha: '2026-03-10', valida_hasta: '2026-03-24', monto: 780000,  status: 'expirada',   items_count: 4 },
]

const STATUS_CONFIG: Record<CotizacionStatus, { label: string, cls: string, icon: any }> = {
  borrador:   { label: 'Borrador',    cls: 'badge-dte-draft',     icon: Edit },
  enviada:    { label: 'Enviada',     cls: 'badge-dte-sent',      icon: Send },
  aceptada:   { label: 'Aceptada',   cls: 'badge-dte-accepted',  icon: CheckCircle2 },
  rechazada:  { label: 'Rechazada',  cls: 'badge-dte-rejected',  icon: XCircle },
  expirada:   { label: 'Expirada',   cls: 'badge-dte-cancelled', icon: Clock },
  convertida: { label: 'Convertida', cls: 'badge-dte-accepted',  icon: ArrowRight },
}

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

export default function CotizacionesPage() {
  const [filter, setFilter] = useState<CotizacionStatus | 'todas'>('todas')

  const filtered = MOCK.filter(c => filter === 'todas' || c.status === filter)
  const totalEnviadas  = MOCK.filter(c => c.status === 'enviada').length
  const totalAceptadas = MOCK.filter(c => c.status === 'aceptada' || c.status === 'convertida').length
  const conversionRate = Math.round((totalAceptadas / MOCK.length) * 100)

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Cotizaciones</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {filtered.length} cotizaciones · Tasa de cierre: <span className="text-emerald-400 font-semibold">{conversionRate}%</span>
          </p>
        </div>
        <button className="btn-primary">
          <Plus size={14} /> Nueva Cotización
        </button>
      </div>

      {/* KPIs rápidos */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Enviadas', value: totalEnviadas, color: 'text-blue-400 bg-blue-500/10' },
          { label: 'Aceptadas', value: totalAceptadas, color: 'text-emerald-400 bg-emerald-500/10' },
          { label: 'Tasa de Cierre', value: `${conversionRate}%`, color: 'text-violet-400 bg-violet-500/10' },
        ].map(k => (
          <div key={k.label} className="p-4 rounded-xl bg-slate-900/60 border border-white/[0.07]">
            <p className="text-[10px] text-slate-600 uppercase tracking-wide mb-1">{k.label}</p>
            <p className={`text-xl font-bold ${k.color.split(' ')[0]}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {(['todas', 'enviada', 'aceptada', 'rechazada', 'expirada'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
              filter === f
                ? 'bg-violet-500/15 text-violet-300 border border-violet-500/20'
                : 'bg-white/[0.03] text-slate-500 border border-white/[0.05] hover:text-slate-300'
            }`}
          >
            {f === 'todas' ? 'Todas' : STATUS_CONFIG[f].label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {filtered.map(c => {
          const sc = STATUS_CONFIG[c.status]
          const isAceptada = c.status === 'aceptada'
          return (
            <div
              key={c.id}
              className="flex items-center gap-4 p-4 bg-slate-900/60 border border-white/[0.07] rounded-2xl hover:bg-slate-900/80 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                <FileText size={16} className="text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">Cotización #{c.numero}</span>
                  <span className={sc.cls}>{sc.label}</span>
                </div>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  {c.cliente} · {c.rut} · {c.items_count} ítem{c.items_count !== 1 ? 's' : ''}
                </p>
                <p className="text-[11px] text-slate-600 mt-1">
                  Válida hasta: {c.valida_hasta}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-base font-bold text-white">{formatCLP(c.monto)}</p>
                <p className="text-xs text-slate-600">{c.fecha}</p>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.05]">
                  <Eye size={13} />
                </button>
                {isAceptada && (
                  <button className="btn-primary py-1.5 px-3 text-xs">
                    → Convertir a Factura
                  </button>
                )}
                <button className="p-1.5 rounded-lg text-slate-700 hover:text-red-400 hover:bg-red-500/5">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
