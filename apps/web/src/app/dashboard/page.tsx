/**
 * CUENTAX — Dashboard Principal
 * Mia: "El dashboard es el pulso de la empresa. 
 * KPIs con trend indicators, actividad reciente en tiempo real,
 * y el estado del SII visible en 1 segundo."
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
    violet: { ring: 'ring-violet-500/20', icon: 'bg-violet-500/10 text-violet-400', glow: 'shadow-violet-500/10' },
    emerald: { ring: 'ring-emerald-500/20', icon: 'bg-emerald-500/10 text-emerald-400', glow: 'shadow-emerald-500/10' },
    amber: { ring: 'ring-amber-500/20', icon: 'bg-amber-500/10 text-amber-400', glow: 'shadow-amber-500/10' },
    blue: { ring: 'ring-blue-500/20', icon: 'bg-blue-500/10 text-blue-400', glow: 'shadow-blue-500/10' },
  }
  const colors = accentMap[accent as keyof typeof accentMap] ?? accentMap.violet

  return (
    <div className={`
      relative overflow-hidden
      bg-slate-900/60 backdrop-blur-sm
      border border-white/[0.07] rounded-2xl p-5
      ring-1 ${colors.ring}
      hover:bg-slate-900/80 hover:border-white/10
      transition-all duration-200 group
    `}>
      {/* Background glow */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
        <div className={`absolute -bottom-4 -right-4 w-24 h-24 rounded-full blur-2xl ${colors.icon} opacity-30`} />
      </div>

      <div className="relative flex items-start justify-between mb-4">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
        <div className={`p-2 rounded-xl ${colors.icon}`}>
          {icon}
        </div>
      </div>

      <div className="relative">
        <p className="text-2xl font-bold text-white mb-1 tracking-tight">{value}</p>
        {subValue && <p className="text-xs text-slate-500">{subValue}</p>}
        {trend && trendValue && (
          <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${
            trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-slate-500'
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
    <div className="flex items-center gap-4 p-4 rounded-2xl bg-amber-500/[0.06] border border-amber-500/20">
      <div className="p-2 bg-amber-500/10 rounded-xl shrink-0">
        <AlertTriangle size={16} className="text-amber-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-300">Certificado digital no configurado</p>
        <p className="text-xs text-amber-500/80 mt-0.5">
          Sin certificado no puedes emitir DTEs. Configúralo para habilitar la emisión.
        </p>
      </div>
      <a
        href="/dashboard/configuracion"
        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-amber-950 text-xs font-bold hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
      >
        Configurar <ArrowRight size={12} />
      </a>
    </div>
  )
}

// ── Quick Actions ─────────────────────────────────────────────
function QuickActions() {
  const actions = [
    { label: 'Nueva Factura', href: '/dashboard/emitir?tipo=33', icon: FileText, color: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
    { label: 'Nueva Boleta',  href: '/dashboard/emitir?tipo=39', icon: Zap,      color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
    { label: 'Nota de Crédito', href: '/dashboard/emitir?tipo=61', icon: ArrowRight, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  ]
  return (
    <div className="flex gap-3">
      {actions.map((a) => (
        <a
          key={a.href}
          href={a.href}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all hover:opacity-80 ${a.color}`}
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
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest mb-3">Acciones Rápidas</p>
        <QuickActions />
      </div>

      {/* Actividad reciente */}
      <div className="bg-slate-900/60 border border-white/[0.07] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-white">Documentos Recientes</h2>
          <a href="/dashboard/documentos" className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors">
            Ver todos <ArrowRight size={12} />
          </a>
        </div>

        <div className="divide-y divide-white/[0.04]">
          {MOCK_DOCUMENTS.map((doc) => (
            <div
              key={doc.folio}
              className="flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.02] transition-colors cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                <FileText size={13} className="text-slate-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">
                    {doc.tipo} #{doc.folio}
                  </span>
                  <StatusBadge status={doc.status} />
                </div>
                <p className="text-xs text-slate-500 truncate mt-0.5">{doc.receptor}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-white">{doc.monto}</p>
                <p className="text-[11px] text-slate-600">{doc.fecha}</p>
              </div>
              <ArrowRight size={14} className="text-slate-700 group-hover:text-slate-400 transition-colors" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
