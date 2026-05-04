/**
 * CUENTAX — Honorarios (Revenue share del contador)
 *
 * Permite al contador declarar honorarios mensuales por PYME y ver la
 * proyección de revenue-share del período en curso.
 *
 * Refs: docs/multitenancy/phase-03-revenue-share.md T3.3
 */
'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Calculator, Save, AlertCircle } from 'lucide-react'
import { apiClient } from '@/lib/api-client'

interface Company {
  id: number
  local_id: number
  name: string
  rut: string
}

interface TenantFee {
  id: number
  tenant_id: number
  company_id: number
  fee_type: 'contabilidad' | 'remuneraciones'
  monthly_clp: number
  billing_day: number
  active: boolean
  valid_from: string
  valid_to: string | null
  notes: string | null
}

interface Projection {
  rate_contabilidad: number
  rate_remuneraciones: number
  total_contabilidad_clp: number
  total_remuneraciones_clp: number
  share_contabilidad_clp: number
  share_remuneraciones_clp: number
  total_share_clp: number
  detail: Array<{
    company_id: number
    company_name: string
    fee_type: 'contabilidad' | 'remuneraciones'
    monthly_clp: number
    share_clp: number
  }>
}

const clpFmt = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const currentPeriod = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function HonorariosPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [fees, setFees] = useState<TenantFee[]>([])
  const [projection, setProjection] = useState<Projection | null>(null)
  const [period, setPeriod] = useState(currentPeriod())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const [cs, fs, proj] = await Promise.all([
        apiClient.get<{ companies: Company[] }>('/api/v1/companies'),
        apiClient.get<{ data: TenantFee[] }>('/api/v1/tenant-fees'),
        apiClient.get<Projection>(`/api/v1/tenant-fees/projection?period=${period}`),
      ])
      setCompanies(cs.data.companies)
      setFees(fs.data.data)
      setProjection(proj.data)
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { refresh() }, [refresh])

  const upsertFee = async (
    company_id: number,
    fee_type: 'contabilidad' | 'remuneraciones',
    monthly_clp: number,
  ) => {
    const today = new Date().toISOString().slice(0, 10)
    // Soft-deactivate any existing active fee for same (company, type)
    const existing = fees.find(
      (f) => f.company_id === company_id && f.fee_type === fee_type && f.active,
    )
    if (existing) {
      await apiClient.patch(`/api/v1/tenant-fees/${existing.id}`, {
        active: false,
        valid_to: today,
      })
    }
    if (monthly_clp > 0) {
      await apiClient.post('/api/v1/tenant-fees', {
        company_id, fee_type, monthly_clp, valid_from: today,
      })
    }
    await refresh()
  }

  const findActiveFee = (company_id: number, fee_type: 'contabilidad' | 'remuneraciones') =>
    fees.find((f) => f.company_id === company_id && f.fee_type === fee_type && f.active)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-zinc-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando honorarios…
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Calculator className="w-6 h-6 text-blue-600" /> Honorarios y revenue share
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Declarar honorarios mensuales por PYME. El revenue share se calcula automáticamente al cierre del período.
        </p>
      </header>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {projection && (
        <section className="mb-6 bg-white rounded-lg border border-zinc-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Proyección período {period}</h2>
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-mono"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Card
              label={`Contabilidad (${(projection.rate_contabilidad * 100).toFixed(1)}%)`}
              value={clpFmt(projection.share_contabilidad_clp)}
              total={projection.total_contabilidad_clp}
            />
            <Card
              label={`Remuneraciones (${(projection.rate_remuneraciones * 100).toFixed(1)}%)`}
              value={clpFmt(projection.share_remuneraciones_clp)}
              total={projection.total_remuneraciones_clp}
            />
            <Card
              label="Total revenue share"
              value={clpFmt(projection.total_share_clp)}
              primary
            />
          </div>
          <p className="text-xs text-zinc-500 mt-3">
            Los cambios de hoy aplican al cálculo del próximo cierre (1° del mes siguiente).
            Tu administrador puede ajustar los porcentajes en `tenants.revenue_share_rate_*`.
          </p>
        </section>
      )}

      <section className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="text-left  px-4 py-2">PYME</th>
              <th className="text-left  px-4 py-2">RUT</th>
              <th className="text-right px-4 py-2">Contabilidad / mes</th>
              <th className="text-right px-4 py-2">Remuneraciones / mes</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => {
              const cont = findActiveFee(c.local_id, 'contabilidad')
              const rem  = findActiveFee(c.local_id, 'remuneraciones')
              return (
                <tr key={c.id} className="border-t border-zinc-200">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{c.rut}</td>
                  <td className="px-4 py-2">
                    <FeeInput
                      initial={cont?.monthly_clp ?? 0}
                      onSave={(v) => upsertFee(c.local_id, 'contabilidad', v)}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <FeeInput
                      initial={rem?.monthly_clp ?? 0}
                      onSave={(v) => upsertFee(c.local_id, 'remuneraciones', v)}
                    />
                  </td>
                </tr>
              )
            })}
            {companies.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-zinc-500">
                  No hay PYMEs cargadas. Crealas desde Configuración → Empresa.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function Card({ label, value, total, primary }: { label: string; value: string; total?: number; primary?: boolean }) {
  return (
    <div className={`rounded-lg p-4 ${primary ? 'bg-blue-600 text-white' : 'bg-zinc-50'}`}>
      <p className={`text-xs ${primary ? 'opacity-90' : 'text-zinc-500'}`}>{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      {total !== undefined && (
        <p className={`text-xs mt-1 ${primary ? 'opacity-80' : 'text-zinc-500'}`}>
          base: {clpFmt(total)}
        </p>
      )}
    </div>
  )
}

function FeeInput({ initial, onSave }: { initial: number; onSave: (v: number) => Promise<void> }) {
  const [value, setValue] = useState(String(initial))
  const [saving, setSaving] = useState(false)
  const dirty = Number(value) !== initial

  return (
    <div className="flex items-center gap-1.5 justify-end">
      <input
        type="number"
        min="0"
        step="1000"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-32 rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {dirty && (
        <button
          onClick={async () => {
            setSaving(true)
            try { await onSave(Math.max(0, Number(value) || 0)) }
            finally { setSaving(false) }
          }}
          disabled={saving}
          className="p-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  )
}

