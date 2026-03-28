/**
 * CUENTAX — Dashboard RRHH
 * KPI overview: headcount, departments, monthly payroll, absences.
 */

'use client'

import { useState, useCallback } from 'react'
import { Users, Building2, DollarSign, Calendar, Clock, Loader2, AlertCircle, LayoutDashboard, RefreshCw } from 'lucide-react'
import { useHRStats, useIndicators } from '@/hooks/use-remuneraciones'
import { apiClient } from '@/lib/api-client'

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const formatUF = (n: number) =>
  `$${new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando estadísticas...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando estadísticas de RRHH'}</span>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <LayoutDashboard size={32} className="text-[var(--cx-text-muted)]" />
      <p className="text-sm font-medium text-[var(--cx-text-secondary)]">No hay datos disponibles para el período seleccionado</p>
      <p className="text-xs text-[var(--cx-text-muted)]">Selecciona otro mes o año para ver estadísticas</p>
    </div>
  )
}

interface KPICardProps {
  icon: React.ReactNode
  label: string
  value: string
  trend?: { value: number; label: string }
}

function KPICard({ icon, label, value, trend }: KPICardProps) {
  return (
    <div className="card border border-[var(--cx-border-light)] rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[var(--cx-text-muted)]">{icon}</span>
        {trend && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-xl ${
            trend.value >= 0
              ? 'bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border border-[var(--cx-status-ok-border)]'
              : 'bg-[var(--cx-status-error-bg)] text-[var(--cx-status-error-text)] border border-[var(--cx-status-error-border)]'
          }`}>
            {trend.value >= 0 ? '+' : ''}{trend.value}% {trend.label}
          </span>
        )}
      </div>
      <div>
        <p className="text-xs text-[var(--cx-text-muted)] uppercase tracking-widest font-semibold">{label}</p>
        <p className="text-2xl font-bold text-[var(--cx-text-primary)] mt-1">{value}</p>
      </div>
    </div>
  )
}

// -- Page --
export default function RemuneracionesDashboardPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const { stats, isLoading, error } = useHRStats(year, month)
  const { indicators, refresh: refreshIndicators } = useIndicators(month, year)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const syncIndicators = useCallback(async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const { data } = await apiClient.post('/api/v1/indicators/sync')
      setSyncMsg(data?.success ? 'Indicadores actualizados' : 'Error al sincronizar')
      refreshIndicators()
    } catch {
      setSyncMsg('Error al conectar con Previred')
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 4000)
    }
  }, [])

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Remuneraciones</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">Panel de recursos humanos y nómina</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
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
          <button
            onClick={syncIndicators}
            disabled={syncing}
            className="btn-secondary flex items-center gap-2 py-2 px-3 text-sm"
            title="Actualizar indicadores desde Previred"
          >
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sincronizando...' : 'Actualizar Indicadores'}
          </button>
        </div>
      </div>

      {/* Sync feedback */}
      {syncMsg && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border ${
          syncMsg.includes('Error')
            ? 'bg-[var(--cx-status-error-bg)] text-[var(--cx-status-error-text)] border-[var(--cx-status-error-border)]'
            : 'bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border-[var(--cx-status-ok-border)]'
        }`}>
          {syncMsg}
        </div>
      )}

      {/* Content */}
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error?.message} />}

      {!isLoading && !error && !stats && <EmptyState />}

      {!isLoading && !error && stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <KPICard
            icon={<Users size={20} />}
            label="Total Empleados"
            value={String(stats.total_employees ?? 0)}
          />
          <KPICard
            icon={<Building2 size={20} />}
            label="Departamentos"
            value={String(stats.total_departments ?? 0)}
          />
          <KPICard
            icon={<DollarSign size={20} />}
            label="Nómina Mensual"
            value={formatCLP(stats.payroll_total ?? 0)}
          />
          <KPICard
            icon={<Calendar size={20} />}
            label="Ausencias del Mes"
            value={String(stats.leaves_this_month ?? 0)}
          />
          <KPICard
            icon={<Clock size={20} />}
            label="Ausencias Pendientes"
            value={String(stats.pending_leaves ?? 0)}
          />
        </div>
      )}

      {/* Indicadores Económicos */}
      {indicators && (
        <div className="card border border-[var(--cx-border-light)] rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-[var(--cx-text-primary)] uppercase tracking-wider mb-4">
            Indicadores Previsionales — {MONTHS[month - 1]} {year}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-widest font-semibold">UF</p>
              <p className="text-lg font-bold text-[var(--cx-text-primary)] mt-1">
                {formatUF(indicators.uf ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-widest font-semibold">UTM</p>
              <p className="text-lg font-bold text-[var(--cx-text-primary)] mt-1">
                {formatCLP(indicators.utm ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-widest font-semibold">Sueldo Minimo</p>
              <p className="text-lg font-bold text-[var(--cx-text-primary)] mt-1">
                {formatCLP(indicators.imm ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-widest font-semibold">Tope AFP</p>
              <p className="text-lg font-bold text-[var(--cx-text-primary)] mt-1">
                {indicators.tope_imponible_afp ?? 0} UF
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-widest font-semibold">Tope Salud</p>
              <p className="text-lg font-bold text-[var(--cx-text-primary)] mt-1">
                {indicators.tope_imponible_salud ?? 0} UF
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-widest font-semibold">Tope Cesantia</p>
              <p className="text-lg font-bold text-[var(--cx-text-primary)] mt-1">
                {indicators.tope_seg_cesantia ?? 0} UF
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
