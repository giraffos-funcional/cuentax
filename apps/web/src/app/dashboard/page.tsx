/**
 * CUENTAX — Dashboard Principal (Light Theme)
 * Connected to real data via useStats, useDTEs, useGastos hooks.
 */

'use client'

import { TrendingUp, TrendingDown, FileText, CheckCircle2,
         Clock, AlertTriangle, ArrowRight, Zap, Loader2, Building2,
         Camera, Receipt, ShoppingCart, Wallet } from 'lucide-react'
import useSWR from 'swr'
import { useStats, useDTEs, useCAFStatus, useSIIStatus, useGastos, type Gasto } from '@/hooks'
import { useAuthStore } from '@/stores/auth.store'
import { apiClient } from '@/lib/api-client'

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const fetcher = (url: string) => apiClient.get(url).then(r => r.data)

const TIPO_LABELS: Record<number, string> = {
  33: 'Factura', 39: 'Boleta', 41: 'B. No Afecta', 56: 'Nota D.', 61: 'Nota C.', 110: 'Fac. Export',
}

const CATEGORIA_LABELS: Record<string, string> = {
  oficina: 'Oficina',
  servicios: 'Servicios',
  transporte: 'Transporte',
  alimentacion: 'Alimentación',
  tecnologia: 'Tecnología',
  otros: 'Otros',
}

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
    violet:  { icon: 'bg-[var(--cx-active-bg)] text-[var(--cx-active-text)]' },
    emerald: { icon: 'bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)]' },
    amber:   { icon: 'bg-[var(--cx-status-warn-bg)] text-[var(--cx-status-warn-text)]' },
    blue:    { icon: 'bg-[var(--cx-active-bg)] text-[var(--cx-active-text)]' },
    red:     { icon: 'bg-red-50 text-red-600' },
  }
  const colors = accentMap[accent as keyof typeof accentMap] ?? accentMap.violet

  return (
    <div className="
      relative overflow-hidden
      bg-[var(--cx-bg-surface)]
      border border-[var(--cx-border-light)] rounded-2xl p-5
      hover:bg-[var(--cx-hover-bg)]
      transition-all duration-200 group
    ">
      <div className="relative flex items-start justify-between mb-4">
        <span className="text-xs font-medium text-[var(--cx-text-secondary)] uppercase tracking-wide">{label}</span>
        <div className={`p-2 rounded-xl ${colors.icon}`}>
          {icon}
        </div>
      </div>

      <div className="relative">
        <p className="text-2xl font-bold text-[var(--cx-text-primary)] mb-1 tracking-tight">{value}</p>
        {subValue && <p className="text-xs text-[var(--cx-text-muted)]">{subValue}</p>}
        {trend && trendValue && (
          <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${
            trend === 'up' ? 'text-[var(--cx-status-ok-text)]' : trend === 'down' ? 'text-[var(--cx-status-error-text)]' : 'text-[var(--cx-text-muted)]'
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
    firmado:    { label: 'Firmado',    cls: 'badge-dte-sent' },
    enviado:    { label: 'Enviado',    cls: 'badge-dte-sent' },
    aceptado:   { label: 'Aceptado',  cls: 'badge-dte-accepted' },
    rechazado:  { label: 'Rechazado', cls: 'badge-dte-rejected' },
    anulado:    { label: 'Anulado',   cls: 'badge-dte-cancelled' },
  }
  const { label, cls } = map[status] ?? map.borrador
  return <span className={cls}>{label}</span>
}

// ── Alerta SII ────────────────────────────────────────────────
function SIIAlert() {
  const { cert, connectivity } = useSIIStatus()

  // Don't show alert if certificate is loaded
  if (cert.cargado) {
    return (
      <div className="flex items-center gap-4 p-4 rounded-2xl bg-[var(--cx-status-ok-bg)] border border-[var(--cx-status-ok-border)]">
        <div className="p-2 bg-[var(--cx-status-ok-bg)] rounded-xl shrink-0">
          <CheckCircle2 size={16} className="text-[var(--cx-status-ok-text)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--cx-status-ok-text)]">Certificado digital configurado</p>
          <p className="text-xs text-[var(--cx-status-ok-text)] opacity-80 mt-0.5">
            {cert.rut ? `RUT: ${cert.rut}` : ''}{cert.diasParaVencer ? ` · Vence en ${cert.diasParaVencer} días` : ''}
            {connectivity.conectado ? ' · SII conectado' : ''}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200">
      <div className="p-2.5 bg-white/80 rounded-xl shrink-0 shadow-sm">
        <AlertTriangle size={16} className="text-violet-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-violet-900">Certificado digital no configurado</p>
        <p className="text-xs text-violet-600 mt-0.5">
          Sin certificado no puedes emitir DTEs. Configúralo para habilitar la emisión.
        </p>
      </div>
      <a
        href="/dashboard/configuracion"
        className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-bold hover:from-violet-700 hover:to-indigo-700 transition-all shadow-md shadow-violet-500/25 whitespace-nowrap shrink-0"
      >
        Configurar <ArrowRight size={12} />
      </a>
    </div>
  )
}

// ── Quick Actions ─────────────────────────────────────────────
function QuickActions() {
  const actions = [
    { label: 'Nueva Factura', href: '/dashboard/emitir?tipo=33', icon: FileText, color: 'text-[var(--cx-active-text)] bg-[var(--cx-active-bg)] border-[var(--cx-active-border)] hover:bg-[var(--cx-hover-bg)]' },
    { label: 'Nueva Boleta',  href: '/dashboard/emitir?tipo=39', icon: Zap,      color: 'text-[var(--cx-active-text)] bg-[var(--cx-active-bg)] border-[var(--cx-active-border)] hover:bg-[var(--cx-hover-bg)]' },
    { label: 'Nota de Crédito', href: '/dashboard/emitir?tipo=61', icon: ArrowRight, color: 'text-[var(--cx-status-ok-text)] bg-[var(--cx-status-ok-bg)] border-[var(--cx-status-ok-border)] hover:bg-[var(--cx-hover-bg)]' },
    { label: 'Escanear Boleta', href: '/dashboard/gastos/escanear', icon: Camera, color: 'text-[var(--cx-status-warn-text)] bg-[var(--cx-status-warn-bg)] border-[var(--cx-status-warn-border)] hover:bg-[var(--cx-hover-bg)]' },
  ]
  return (
    <div className="flex flex-wrap gap-3">
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

// ── Recent Gastos Section ─────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RecentGastos({ gastos, isLoading }: { gastos: Array<any>; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="bg-[var(--cx-bg-surface)] border border-[var(--cx-border-light)] rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--cx-border-lighter)]">
          <h2 className="text-sm font-semibold text-[var(--cx-text-primary)]">Últimos Gastos</h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin text-[var(--cx-active-text)]" />
          <span className="ml-2 text-sm text-[var(--cx-text-muted)]">Cargando gastos...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[var(--cx-bg-surface)] border border-[var(--cx-border-light)] rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--cx-border-lighter)]">
        <h2 className="text-sm font-semibold text-[var(--cx-text-primary)]">Últimos Gastos</h2>
        <a href="/dashboard/gastos" className="text-xs text-[var(--cx-active-text)] hover:opacity-80 flex items-center gap-1 transition-colors">
          Ver todos <ArrowRight size={12} />
        </a>
      </div>

      {gastos.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-[var(--cx-bg-elevated)] flex items-center justify-center">
            <Receipt size={20} className="text-[var(--cx-text-muted)]" />
          </div>
          <p className="text-sm font-medium text-[var(--cx-text-secondary)] mb-1">No hay gastos registrados</p>
          <p className="text-xs text-[var(--cx-text-muted)] mb-4">Escanea una boleta o registra un gasto manualmente</p>
          <a href="/dashboard/gastos/escanear" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-bold hover:from-violet-700 hover:to-indigo-700 transition-all shadow-md shadow-violet-500/20">
            <Camera size={12} /> Escanear Boleta
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4">
          {gastos.map((gasto: Gasto) => (
            <a
              key={gasto.id as string}
              href={`/dashboard/gastos/${gasto.id}`}
              className="
                bg-[var(--cx-bg-elevated)] border border-[var(--cx-border-lighter)]
                rounded-xl p-4 hover:bg-[var(--cx-hover-bg)] transition-all cursor-pointer group
              "
            >
              <div className="flex items-start justify-between mb-2">
                <div className="p-1.5 rounded-lg bg-[var(--cx-status-warn-bg)]">
                  <ShoppingCart size={12} className="text-[var(--cx-status-warn-text)]" />
                </div>
                <span className="text-[11px] text-[var(--cx-text-muted)]">
                  {gasto.fecha_documento as string}
                </span>
              </div>
              <p className="text-sm font-medium text-[var(--cx-text-primary)] truncate mb-0.5">
                {(gasto.emisor_razon_social as string) || 'Sin emisor'}
              </p>
              <p className="text-xs text-[var(--cx-text-muted)] mb-2">
                {CATEGORIA_LABELS[(gasto.categoria as string)] ?? (gasto.categoria as string)}
              </p>
              <p className="text-base font-bold text-[var(--cx-text-primary)]">
                {formatCLP(gasto.monto_total as number)}
              </p>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────
export default function DashboardPage() {
  const user = useAuthStore(s => s.user)
  const { stats, isLoading: statsLoading } = useStats()
  const { documentos, isLoading: dtesLoading } = useDTEs({ page: 1 })
  const { cafs } = useCAFStatus()

  // Gastos data
  const currentMonth = new Date().getMonth() + 1
  const currentYear = new Date().getFullYear()
  const { data: gastosStats, isLoading: gastosStatsLoading } = useSWR<{
    total_gastos: number
    total_iva: number
    total_neto: number
    cantidad: number
  }>(`/api/v1/gastos/stats?mes=${currentMonth}&year=${currentYear}`, fetcher, { refreshInterval: 30_000 })
  const { gastos: recentGastos, isLoading: gastosLoading } = useGastos(1, {
    mes: String(currentMonth),
    year: String(currentYear),
  })
  const latestGastos = recentGastos.slice(0, 3)

  // Extract KPI values from real data
  const totalEmitidos = stats?.total_emitidos ?? stats?.por_estado
    ? Object.values(stats?.por_estado ?? {}).reduce((s: number, v: any) => s + (v.count ?? 0), 0)
    : 0
  const totalAceptados = stats?.total_aceptados ?? stats?.por_estado?.aceptado?.count ?? 0
  const ingresosMes = stats?.total_aceptados ?? stats?.por_estado?.aceptado?.total ?? 0
  const tasaExito = totalEmitidos > 0 ? ((totalAceptados / totalEmitidos) * 100).toFixed(1) : '0'
  const pendientes = totalEmitidos - totalAceptados

  // Folios from CAF
  const folioFactura = cafs.find((c: any) => c.tipo_dte === 33)
  const foliosDisp = folioFactura?.folios_disponibles ?? 0

  // Recent documents (last 5)
  const recentDocs = documentos.slice(0, 5)

  // Gastos KPI values
  const gastosMes = gastosStats?.total_gastos ?? 0
  const ivaCredito = gastosStats?.total_iva ?? 0
  // IVA Débito is 19% of net sales (ingresosMes is total, net = total / 1.19)
  const ivaDebito = Math.round(ingresosMes - (ingresosMes / 1.19))
  const balanceIVA = ivaDebito - ivaCredito

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Company Header */}
      {user?.company_name && (
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md shadow-violet-500/20">
            <Building2 size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--cx-text-primary)]">{user.company_name}</h2>
            {user.company_rut && String(user.company_rut) !== 'false' && String(user.company_rut) !== 'False' && (
              <p className="text-xs text-[var(--cx-text-muted)] font-mono">{user.company_rut}</p>
            )}
          </div>
        </div>
      )}

      {/* Alert SII */}
      <SIIAlert />

      {/* KPIs — Ventas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard
          label="Ingresos del Mes"
          value={statsLoading ? '...' : formatCLP(ingresosMes)}
          subValue="IVA incluido"
          accent="violet"
          icon={<TrendingUp size={16} />}
        />
        <KPICard
          label="DTEs Emitidos"
          value={statsLoading ? '...' : String(totalEmitidos)}
          subValue="Este mes"
          accent="blue"
          icon={<FileText size={16} />}
        />
        <KPICard
          label="Aceptados SII"
          value={statsLoading ? '...' : String(totalAceptados)}
          subValue={`${tasaExito}% tasa de éxito`}
          trend={pendientes > 0 ? 'neutral' : 'up'}
          trendValue={pendientes > 0 ? `${pendientes} pendientes` : 'Todo al día'}
          accent="emerald"
          icon={<CheckCircle2 size={16} />}
        />
        <KPICard
          label="Folios Disponibles"
          value={String(foliosDisp)}
          subValue="Tipo 33 — Factura"
          trend={foliosDisp === 0 ? 'down' : foliosDisp < 300 ? 'down' : 'up'}
          trendValue={foliosDisp === 0 ? 'Sin folios — Solicitar CAF' : foliosDisp < 100 ? `Quedan pocos folios` : foliosDisp < 300 ? `Quedan ${foliosDisp}` : 'Suficientes'}
          accent={foliosDisp === 0 ? 'amber' : 'amber'}
          icon={<Clock size={16} />}
        />
      </div>

      {/* KPIs — Gastos e IVA */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard
          label="Gastos del Mes"
          value={gastosStatsLoading ? '...' : formatCLP(gastosMes)}
          subValue={gastosStats?.cantidad ? `${gastosStats.cantidad} documentos` : 'Sin gastos registrados'}
          accent="amber"
          icon={<ShoppingCart size={16} />}
        />
        <KPICard
          label="IVA Crédito (Gastos)"
          value={gastosStatsLoading ? '...' : formatCLP(ivaCredito)}
          subValue="IVA recuperable este mes"
          accent="blue"
          icon={<Wallet size={16} />}
        />
        <KPICard
          label="Balance IVA Estimado"
          value={statsLoading || gastosStatsLoading ? '...' : formatCLP(Math.abs(balanceIVA))}
          subValue={balanceIVA > 0 ? 'IVA a pagar al SII' : balanceIVA < 0 ? 'IVA a favor (crédito)' : 'IVA equilibrado'}
          trend={balanceIVA <= 0 ? 'up' : 'down'}
          trendValue={balanceIVA > 0 ? 'Débito > Crédito' : balanceIVA < 0 ? 'Crédito > Débito' : 'Equilibrado'}
          accent={balanceIVA <= 0 ? 'emerald' : 'red'}
          icon={<Receipt size={16} />}
        />
      </div>

      {/* Quick Actions */}
      <div>
        <p className="text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest mb-3">Acciones Rápidas</p>
        <QuickActions />
      </div>

      {/* Actividad reciente */}
      <div className="bg-[var(--cx-bg-surface)] border border-[var(--cx-border-light)] rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--cx-border-lighter)]">
          <h2 className="text-sm font-semibold text-[var(--cx-text-primary)]">Documentos Recientes</h2>
          <a href="/dashboard/documentos" className="text-xs text-[var(--cx-active-text)] hover:opacity-80 flex items-center gap-1 transition-colors">
            Ver todos <ArrowRight size={12} />
          </a>
        </div>

        {dtesLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={18} className="animate-spin text-[var(--cx-active-text)]" />
            <span className="ml-2 text-sm text-[var(--cx-text-muted)]">Cargando documentos...</span>
          </div>
        ) : recentDocs.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-[var(--cx-bg-elevated)] flex items-center justify-center">
              <FileText size={20} className="text-[var(--cx-text-muted)]" />
            </div>
            <p className="text-sm font-medium text-[var(--cx-text-secondary)] mb-1">No hay documentos emitidos aún</p>
            <p className="text-xs text-[var(--cx-text-muted)] mb-4">Emite tu primer DTE para verlo aquí</p>
            <a href="/dashboard/emitir" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-bold hover:from-violet-700 hover:to-indigo-700 transition-all shadow-md shadow-violet-500/20">
              <Zap size={12} /> Emitir DTE
            </a>
          </div>
        ) : (
          <div className="divide-y divide-[var(--cx-border-lighter)]">
            {recentDocs.map((doc: any) => (
              <div
                key={doc.id ?? doc.folio}
                className="flex items-center gap-4 px-6 py-3.5 hover:bg-[var(--cx-hover-bg)] transition-colors cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-lg bg-[var(--cx-bg-elevated)] flex items-center justify-center shrink-0">
                  <FileText size={13} className="text-[var(--cx-text-muted)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--cx-text-primary)]">
                      {TIPO_LABELS[doc.tipo_dte] ?? `Tipo ${doc.tipo_dte}`} #{doc.folio ?? '-'}
                    </span>
                    <StatusBadge status={doc.estado} />
                  </div>
                  <p className="text-xs text-[var(--cx-text-muted)] truncate mt-0.5">{doc.razon_social_receptor}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-[var(--cx-text-primary)]">{formatCLP(doc.monto_total)}</p>
                  <p className="text-[11px] text-[var(--cx-text-muted)]">{doc.fecha_emision}</p>
                </div>
                <ArrowRight size={14} className="text-[var(--cx-text-muted)] group-hover:text-[var(--cx-text-secondary)] transition-colors" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Últimos Gastos */}
      <RecentGastos gastos={latestGastos} isLoading={gastosLoading} />
    </div>
  )
}
