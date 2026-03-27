/**
 * CUENTAX — Dashboard Principal (Light Theme)
 */

'use client'

import { TrendingUp, TrendingDown, FileText, CheckCircle2,
         Clock, AlertTriangle, ArrowRight, Zap } from 'lucide-react'

// ── KPI Card ──────────────────────────────────────────────────
interface KPICardProps {
  label: string
  value: string
  subValue?: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  accent?: string
  icon: React.ReactNode
}

function KPICard({ label, value, subValue, trend, trendValue, accent = 'violet', icon }: KPICardProps) {
  const accentMap = {
    violet: { ring: 'ring-violet-200', icon: 'bg-violet-50 text-violet-600', glow: 'shadow-violet-100' },
    emerald: { ring: 'ring-emerald-200', icon: 'bg-emerald-50 text-emerald-600', glow: 'shadow-emerald-100' },
    amber: { ring: 'ring-amber-200', icon: 'bg-amber-50 text-amber-600', glow: 'shadow-amber-100' },
    blue: { ring: 'ring-blue-200', icon: 'bg-blue-50 text-blue-600', glow: 'shadow-blue-100' },
  }
  const colors = accentMap[accent as keyof typeof accentMap] ?? accentMap.violet

  return (
    <div className={`
      relative overflow-hidden
      bg-white
      border border-slate-200 rounded-2xl p-5
      ring-1 ${colors.ring}
      hover:shadow-md hover:border-slate-300
      transition-all duration-200 group
    `}>
      <div className="relative flex items-start justify-between mb-4">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
        <div className={`p-2 rounded-xl ${colors.icon}`}>
          {icon}
        </div>
      </div>

      <div className="relative">
        <p className="text-2xl font-bold text-slate-800 mb-1 tracking-tight">{value}</p>
        {subValue && <p className="text-xs text-slate-400">{subValue}</p>}
        {trend && trendValue && (
          <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${
            trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-slate-400'
          }`}>
            {trend === 'up' ? <TrendingUp size={12} /> : trend === 'down' ? <TrendingDown size={12} /> : null}
            {trendValue}
          </div>
        )}
      </div>
    </div>
  )
}

// ── DTE Status Badge ──────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string, cls: string }> = {
    borrador:   { label: 'Borrador',   cls: 'badge-dte-draft' },
    enviado:    { label: 'Enviado',    cls: 'badge-dte-sent' },
    aceptado:   { label: 'Aceptado',  cls: 'badge-dte-accepted' },
    rechazado:  { label: 'Rechazado', cls: 'badge-dte-rejected' },
    anulado:    { label: 'Anulado',   cls: 'badge-dte-cancelled' },
  }
  const { label, cls } = map[status] ?? map.borrador
  return <span className={cls}>{label}</span>
}

// ── Recent Activity ───────────────────────────────────────────
const MOCK_DOCUMENTS = [
  { folio: 1042, tipo: 'Factura', receptor: 'Empresa ABC Ltda.', monto: '$1.250.000', status: 'aceptado', fecha: 'Hoy 14:32' },
  { folio: 1041, tipo: 'Boleta',  receptor: 'Cliente Persona',  monto: '$45.900',    status: 'aceptado', fecha: 'Hoy 11:15' },
  { folio: 1040, tipo: 'Factura', receptor: 'Tech Solutions SpA', monto: '$890.000', status: 'enviado',  fecha: 'Ayer 18:00' },
  { folio: 1039, tipo: 'Nota C.', receptor: 'Empresa ABC Ltda.', monto: '$125.000',  status: 'aceptado', fecha: 'Ayer 09:30' },
  { folio: 1038, tipo: 'Factura', receptor: 'Import & Co.',     monto: '$2.100.000', status: 'rechazado',fecha: '24 Mar' },
]

// ── Alerta SII ────────────────────────────────────────────────
function SIIAlert() {
  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl bg-amber-50 border border-amber-200">
      <div className="p-2 bg-amber-100 rounded-xl shrink-0">
        <AlertTriangle size={16} className="text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-800">Certificado digital no configurado</p>
        <p className="text-xs text-amber-600 mt-0.5">
          Sin certificado no puedes emitir DTEs. Configúralo para habilitar la emisión.
        </p>
      </div>
      <a
        href="/dashboard/configuracion"
        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors whitespace-nowrap shrink-0"
      >
        Configurar <ArrowRight size={12} />
      </a>
    </div>
  )
}

// ── Quick Actions ─────────────────────────────────────────────
function QuickActions() {
  const actions = [
    { label: 'Nueva Factura', href: '/dashboard/emitir?tipo=33', icon: FileText, color: 'text-violet-700 bg-violet-50 border-violet-200 hover:bg-violet-100' },
    { label: 'Nueva Boleta',  href: '/dashboard/emitir?tipo=39', icon: Zap,      color: 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100' },
    { label: 'Nota de Crédito', href: '/dashboard/emitir?tipo=61', icon: ArrowRight, color: 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100' },
  ]
  return (
    <div className="flex gap-3">
      {actions.map((a) => (
        <a
          key={a.href}
          href={a.href}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${a.color}`}
        >
          <a.icon size={14} />
          {a.label}
        </a>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────
export default function DashboardPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Alert SII */}
      <SIIAlert />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard
          label="Ingresos del Mes"
          value="$12.450.000"
          subValue="IVA incluido"
          trend="up"
          trendValue="+18% vs mes anterior"
          accent="violet"
          icon={<TrendingUp size={16} />}
        />
        <KPICard
          label="DTEs Emitidos"
          value="87"
          subValue="Este mes"
          trend="up"
          trendValue="+12 vs mes anterior"
          accent="blue"
          icon={<FileText size={16} />}
        />
        <KPICard
          label="Aceptados SII"
          value="84"
          subValue="96.5% tasa de éxito"
          trend="up"
          trendValue="3 pendientes"
          accent="emerald"
          icon={<CheckCircle2 size={16} />}
        />
        <KPICard
          label="Folios Disponibles"
          value="213"
          subValue="Tipo 33 — Factura"
          trend="down"
          trendValue="⚠ Quedan < 300"
          accent="amber"
          icon={<Clock size={16} />}
        />
      </div>

      {/* Quick Actions */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Acciones Rápidas</p>
        <QuickActions />
      </div>

      {/* Actividad reciente */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Documentos Recientes</h2>
          <a href="/dashboard/documentos" className="text-xs text-violet-600 hover:text-violet-500 flex items-center gap-1 transition-colors">
            Ver todos <ArrowRight size={12} />
          </a>
        </div>

        <div className="divide-y divide-slate-100">
          {MOCK_DOCUMENTS.map((doc) => (
            <div
              key={doc.folio}
              className="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <FileText size={13} className="text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">
                    {doc.tipo} #{doc.folio}
                  </span>
                  <StatusBadge status={doc.status} />
                </div>
                <p className="text-xs text-slate-400 truncate mt-0.5">{doc.receptor}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-slate-800">{doc.monto}</p>
                <p className="text-[11px] text-slate-400">{doc.fecha}</p>
              </div>
              <ArrowRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
