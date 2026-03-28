/**
 * CUENTAX — Dashboard RRHH
 * KPI overview: headcount, departments, monthly payroll, absences.
 */

'use client'

import { useState } from 'react'
import { Users, Building2, DollarSign, Calendar, Clock, Loader2, AlertCircle, LayoutDashboard } from 'lucide-react'
import { useHRStats } from '@/hooks/use-remuneraciones'

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

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
        </div>
      </div>

      {/* Content */}
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error?.message} />}

      {!isLoading && !error && !stats && <EmptyState />}

      {!isLoading && !error && stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <KPICard
            icon={<Users size={20} />}
            label="Total Empleados"
            value={String(stats.totalEmpleados ?? 0)}
            trend={stats.trendEmpleados}
          />
          <KPICard
            icon={<Building2 size={20} />}
            label="Departamentos"
            value={String(stats.departamentos ?? 0)}
          />
          <KPICard
            icon={<DollarSign size={20} />}
            label="Nómina Mensual"
            value={formatCLP(stats.nominaMensual ?? 0)}
            trend={stats.trendNomina}
          />
          <KPICard
            icon={<Calendar size={20} />}
            label="Ausencias del Mes"
            value={String(stats.ausenciasMes ?? 0)}
            trend={stats.trendAusencias}
          />
          <KPICard
            icon={<Clock size={20} />}
            label="Ausencias Pendientes"
            value={String(stats.ausenciasPendientes ?? 0)}
          />
        </div>
      )}
    </div>
  )
}
