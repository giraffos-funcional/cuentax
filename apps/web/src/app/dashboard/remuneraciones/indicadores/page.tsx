/**
 * CUENTAX — Indicadores Previsionales
 * Replica de previred.com/indicadores-previsionales con datos desde Odoo.
 */

'use client'

import { useState, useCallback } from 'react'
import {
  Loader2, AlertCircle, RefreshCw, ExternalLink,
  DollarSign, TrendingUp, Shield, Users, Briefcase, PiggyBank,
} from 'lucide-react'
import { useIndicators } from '@/hooks/use-remuneraciones'
import { apiClient } from '@/lib/api-client'
import { formatCLP, formatUF, MONTHS } from '@/lib/formatters'

const formatPct = (n: number) => `${n.toFixed(2)}%`

// ── AFP data (static rates, updated via scraper) ──
const AFP_DATA = [
  { name: 'Capital',   code: 'CAPITAL',   dep: 1.44, mandatory: 10, sis: 1.85, total_worker: 11.44 },
  { name: 'Cuprum',    code: 'CUPRUM',    dep: 1.44, mandatory: 10, sis: 1.85, total_worker: 11.44 },
  { name: 'Habitat',   code: 'HABITAT',   dep: 1.27, mandatory: 10, sis: 1.85, total_worker: 11.27 },
  { name: 'Modelo',    code: 'MODELO',    dep: 0.58, mandatory: 10, sis: 1.85, total_worker: 10.58 },
  { name: 'PlanVital', code: 'PLANVITAL', dep: 1.16, mandatory: 10, sis: 1.85, total_worker: 11.16 },
  { name: 'ProVida',   code: 'PROVIDA',   dep: 1.45, mandatory: 10, sis: 1.85, total_worker: 11.45 },
  { name: 'Uno',       code: 'UNO',       dep: 0.49, mandatory: 10, sis: 1.85, total_worker: 10.49 },
]

const CESANTIA_DATA = [
  { tipo: 'Contrato Indefinido',       trabajador: '0,6%', empleador: '2,4%', total: '3,0%' },
  { tipo: 'Contrato Plazo Fijo',       trabajador: '0%',   empleador: '3,0%', total: '3,0%' },
  { tipo: 'Contrato Obra/Faena (>1a)', trabajador: '0%',   empleador: '3,0%', total: '3,0%' },
  { tipo: 'Trabajador de Casa Particular', trabajador: '0%', empleador: '3,0%', total: '3,0%' },
]

const ASIG_FAMILIAR = [
  { tramo: 'A', desde: '$0', hasta: '$434.545', monto: '$22.007' },
  { tramo: 'B', desde: '$434.546', hasta: '$634.445', monto: '$13.497' },
  { tramo: 'C', desde: '$634.446', hasta: '$989.398', monto: '$4.267' },
  { tramo: 'D', desde: '$989.399', hasta: 'y mas', monto: '$0' },
]

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando indicadores...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando indicadores'}</span>
    </div>
  )
}

// ── Section wrapper ──
function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 bg-[var(--cx-bg-elevated)] border-b border-[var(--cx-border-light)]">
        <span className="text-[var(--cx-active-icon)]">{icon}</span>
        <h3 className="text-sm font-semibold text-[var(--cx-text-primary)] uppercase tracking-wider">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ── Table helpers ──
function TableHeader({ cols }: { cols: string[] }) {
  return (
    <div className={`grid gap-2 px-3 py-2 bg-[var(--cx-bg-elevated)] rounded-lg text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest`}
      style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}
    >
      {cols.map(c => <div key={c}>{c}</div>)}
    </div>
  )
}

function TableRow({ cols, highlight }: { cols: string[]; highlight?: boolean }) {
  return (
    <div className={`grid gap-2 px-3 py-2.5 text-sm border-b border-[var(--cx-border-lighter)] last:border-0 hover:bg-[var(--cx-hover-bg)] transition-colors ${highlight ? 'bg-[var(--cx-active-bg)]' : ''}`}
      style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}
    >
      {cols.map((c, i) => (
        <div key={i} className={i === 0 ? 'font-medium text-[var(--cx-text-primary)]' : 'text-[var(--cx-text-secondary)] font-mono'}>
          {c}
        </div>
      ))}
    </div>
  )
}

// ── Value card ──
function ValueCard({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="rounded-xl border border-[var(--cx-border-light)] p-4 bg-[var(--cx-bg-surface)]">
      <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-widest font-semibold">{label}</p>
      <p className="text-xl font-bold text-[var(--cx-text-primary)] mt-1">{value}</p>
      {sublabel && <p className="text-[10px] text-[var(--cx-text-muted)] mt-1">{sublabel}</p>}
    </div>
  )
}

// ── Page ──
export default function IndicadoresPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const { indicators, isLoading, error, refresh } = useIndicators(month, year)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const syncIndicators = useCallback(async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const { data } = await apiClient.post('/api/v1/indicators/sync')
      setSyncMsg(data?.success ? 'Indicadores actualizados desde Previred' : 'Error al sincronizar')
      refresh()
    } catch {
      setSyncMsg('Error al conectar con Previred')
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 5000)
    }
  }, [refresh])

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  // Computed values from indicators
  const uf = indicators?.uf ?? 39842
  const utm = indicators?.utm ?? 69889
  const uta = indicators?.uta ?? (utm * 12)
  const imm = indicators?.imm ?? 539000
  const topeAFP_UF = indicators?.tope_imponible_afp ?? 90
  const topeSalud_UF = indicators?.tope_imponible_salud ?? 90
  const topeCesantia_UF = indicators?.tope_seg_cesantia ?? 135.2
  const topeAFP_CLP = Math.round(topeAFP_UF * uf)
  const topeSalud_CLP = Math.round(topeSalud_UF * uf)
  const topeCesantia_CLP = Math.round(topeCesantia_UF * uf)

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Indicadores Previsionales</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            Parámetros para el calculo de remuneraciones — {MONTHS[month - 1]} {year}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="input-field py-2 text-sm w-auto">
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="input-field py-2 text-sm w-auto">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={syncIndicators}
            disabled={syncing}
            className="btn-secondary flex items-center gap-2 py-2 px-3 text-sm"
          >
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sincronizando...' : 'Actualizar'}
          </button>
          <a
            href="https://www.previred.com/indicadores-previsionales/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary flex items-center gap-2 py-2 px-3 text-sm"
          >
            <ExternalLink size={13} /> Previred
          </a>
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

      {isLoading && <LoadingState />}
      {!isLoading && error && <ErrorState message={error?.message} />}

      {/* Valores Principales */}
      <Section title="Valores y Parámetros" icon={<DollarSign size={16} />}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <ValueCard label="UF" value={formatUF(uf)} sublabel={`${MONTHS[month - 1]} ${year}`} />
          <ValueCard label="UTM" value={formatCLP(utm)} sublabel="Mensual" />
          <ValueCard label="UTA" value={formatCLP(uta)} sublabel="Anual (UTM x 12)" />
          <ValueCard label="Sueldo Minimo" value={formatCLP(imm)} sublabel="Trabajadores dependientes" />
          <ValueCard label="Sueldo Min. <18/>65" value={formatCLP(Math.round(imm * 0.746))} sublabel="Menores 18 / Mayores 65" />
          <ValueCard label="No Remuneracional" value={formatCLP(Math.round(imm * 0.644))} sublabel="Fines no remuneracionales" />
        </div>
      </Section>

      {/* Rentas Topes Imponibles */}
      <Section title="Rentas Topes Imponibles" icon={<TrendingUp size={16} />}>
        <div className="space-y-1">
          <TableHeader cols={['Concepto', 'Tope (UF)', 'Tope (CLP)']} />
          <TableRow cols={['Afiliados AFP', `${topeAFP_UF} UF`, formatCLP(topeAFP_CLP)]} />
          <TableRow cols={['Afiliados IPS (ex-INP)', '60 UF', formatCLP(Math.round(60 * uf))]} />
          <TableRow cols={['Seguro de Cesantia', `${topeCesantia_UF} UF`, formatCLP(topeCesantia_CLP)]} />
          <TableRow cols={['Salud', `${topeSalud_UF} UF`, formatCLP(topeSalud_CLP)]} />
        </div>
      </Section>

      {/* AFP Rates */}
      <Section title="Tasas de Cotización AFP" icon={<Shield size={16} />}>
        <div className="space-y-1">
          <TableHeader cols={['AFP', 'Cotización Obligatoria', 'Comision', 'SIS (Empleador)', 'Total Trabajador']} />
          {AFP_DATA.map(afp => (
            <TableRow
              key={afp.code}
              cols={[
                afp.name,
                formatPct(afp.mandatory),
                formatPct(afp.dep),
                formatPct(afp.sis),
                formatPct(afp.total_worker),
              ]}
              highlight={afp.code === 'MODELO'}
            />
          ))}
        </div>
        <p className="text-xs text-[var(--cx-text-muted)] mt-3">
          * AFP Modelo tiene la comisión más baja. SIS (Seguro de Invalidez y Sobrevivencia) es cargo del empleador.
        </p>
      </Section>

      {/* Seguro de Cesantia */}
      <Section title="Seguro de Cesantia (AFC)" icon={<Briefcase size={16} />}>
        <div className="space-y-1">
          <TableHeader cols={['Tipo de Contrato', 'Trabajador', 'Empleador', 'Total']} />
          {CESANTIA_DATA.map(c => (
            <TableRow key={c.tipo} cols={[c.tipo, c.trabajador, c.empleador, c.total]} />
          ))}
        </div>
      </Section>

      {/* Asignacion Familiar */}
      <Section title="Asignacion Familiar" icon={<Users size={16} />}>
        <div className="space-y-1">
          <TableHeader cols={['Tramo', 'Ingreso Desde', 'Ingreso Hasta', 'Monto por Carga']} />
          {ASIG_FAMILIAR.map(a => (
            <TableRow
              key={a.tramo}
              cols={[`Tramo ${a.tramo}`, a.desde, a.hasta, a.monto]}
              highlight={a.tramo === 'D'}
            />
          ))}
        </div>
        <p className="text-xs text-[var(--cx-text-muted)] mt-3">
          * Los montos y tramos se actualizan cada 1 de julio. Tramo D no tiene derecho a asignacion.
        </p>
      </Section>

      {/* APV */}
      <Section title="APV y Deposito Convenido" icon={<PiggyBank size={16} />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-[var(--cx-border-light)] p-4">
            <p className="text-sm font-semibold text-[var(--cx-text-primary)] mb-2">Regimen A (Letra A)</p>
            <p className="text-xs text-[var(--cx-text-secondary)]">El Estado bonifica el 15% del ahorro con tope de 6 UTM anuales.</p>
            <p className="text-xs text-[var(--cx-text-muted)] mt-2">Tope anual: {formatCLP(utm * 6)}</p>
          </div>
          <div className="rounded-xl border border-[var(--cx-border-light)] p-4">
            <p className="text-sm font-semibold text-[var(--cx-text-primary)] mb-2">Regimen B (Letra B)</p>
            <p className="text-xs text-[var(--cx-text-secondary)]">Se descuenta de la renta tributable antes del calculo de impuesto unico.</p>
            <p className="text-xs text-[var(--cx-text-muted)] mt-2">Tope mensual: 50 UF ({formatCLP(Math.round(50 * uf))})</p>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-[var(--cx-border-light)] p-4">
          <p className="text-sm font-semibold text-[var(--cx-text-primary)] mb-2">Deposito Convenido</p>
          <p className="text-xs text-[var(--cx-text-secondary)]">Tope anual: 900 UF ({formatCLP(Math.round(900 * uf))})</p>
        </div>
      </Section>

      {/* Footer */}
      <div className="text-center py-4">
        <p className="text-xs text-[var(--cx-text-muted)]">
          Fuente: <a href="https://www.previred.com/indicadores-previsionales/" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--cx-text-secondary)]">previred.com</a>
          {' '}| Ultima actualizacion: {MONTHS[month - 1]} {year}
        </p>
      </div>
    </div>
  )
}
