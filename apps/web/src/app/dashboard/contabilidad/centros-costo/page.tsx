/**
 * CUENTAX — Centros de Costo
 * Analytic accounts management with list view, report view, and drill-down movements.
 */

'use client'

import { useState } from 'react'
import {
  Folders, Plus, Pencil, ChevronDown, ChevronRight,
  Loader2, AlertCircle, BarChart3, List, Download,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useCostCenters, useCostCenterReport, useCostCenterMovements, useCreateCostCenter } from '@/hooks'
import { formatCLP, MONTHS } from '@/lib/formatters'
import { apiClient } from '@/lib/api-client'
import { mutate as globalMutate } from 'swr'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
               'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

type Tab = 'lista' | 'reporte'

// ── Shared components ───────────────────────────────────────

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

function TabButton({ id, current, label, icon, onClick }: {
  id: Tab; current: Tab; label: string; icon: React.ReactNode; onClick: () => void
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

// ── CSV export helper ───────────────────────────────────────

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

// ── Create/Edit Modal ───────────────────────────────────────

function CentroCostoModal({
  open, onClose, initial,
}: {
  open: boolean
  onClose: () => void
  initial?: { id: number; name: string; code: string }
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [code, setCode] = useState(initial?.code ?? '')
  const [saving, setSaving] = useState(false)
  const { create } = useCreateCostCenter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      if (initial) {
        // Update existing
        await apiClient.put(`/api/v1/contabilidad/centros-costo/${initial.id}`, { name, code })
        globalMutate((key: string) => typeof key === 'string' && key.includes('/centros-costo'))
      } else {
        await create({ name, code })
      }
      onClose()
    } catch {
      // Error handled by hook
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-fade-in">
      <div className="card border border-[var(--cx-border-light)] rounded-2xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-bold text-[var(--cx-text-primary)] mb-4">
          {initial ? 'Editar Centro de Costo' : 'Nuevo Centro de Costo'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest mb-1">
              Nombre *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="input-field w-full"
              placeholder="Ej: Marketing Digital"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest mb-1">
              Codigo
            </label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              className="input-field w-full"
              placeholder="Ej: CC-001"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">
              Cancelar
            </button>
            <button type="submit" disabled={saving || !name.trim()} className="btn-primary text-sm py-2 px-4">
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {initial ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Movement rows for a cost center ─────────────────────────

function MovimientosRow({ centroId, year, mes }: { centroId: number; year: number; mes: number }) {
  const { movimientos, total, isLoading } = useCostCenterMovements(centroId, year, mes)

  if (isLoading) {
    return (
      <tr>
        <td colSpan={6} className="px-5 py-4 text-center">
          <Loader2 size={14} className="inline animate-spin text-[var(--cx-active-icon)]" />
          <span className="ml-2 text-xs text-[var(--cx-text-secondary)]">Cargando movimientos...</span>
        </td>
      </tr>
    )
  }

  if (movimientos.length === 0) {
    return (
      <tr>
        <td colSpan={6} className="px-5 py-4 text-center text-xs text-[var(--cx-text-muted)]">
          Sin movimientos en este periodo
        </td>
      </tr>
    )
  }

  return (
    <>
      {movimientos.map((m: any) => (
        <tr key={m.id} className="bg-[var(--cx-bg-elevated)] hover:bg-[var(--cx-hover-bg)] transition-colors">
          <td className="px-5 py-2 text-xs text-[var(--cx-text-secondary)]">{m.date}</td>
          <td className="px-5 py-2 text-xs text-[var(--cx-text-primary)]" colSpan={2}>{m.name || '-'}</td>
          <td className="px-5 py-2 text-xs text-[var(--cx-text-secondary)]">{m.account}</td>
          <td className="px-5 py-2 text-xs text-[var(--cx-text-secondary)]">{m.partner}</td>
          <td className="px-5 py-2 text-xs text-right tabular-nums font-mono">
            <span className={m.amount >= 0 ? 'text-[var(--cx-status-ok-text)]' : 'text-[var(--cx-status-error-text)]'}>
              {formatCLP(m.amount)}
            </span>
          </td>
        </tr>
      ))}
      <tr className="bg-[var(--cx-bg-elevated)] border-t border-[var(--cx-border-light)]">
        <td colSpan={5} className="px-5 py-2 text-xs font-bold text-[var(--cx-text-secondary)]">TOTAL MOVIMIENTOS</td>
        <td className="px-5 py-2 text-xs text-right font-bold tabular-nums text-[var(--cx-active-icon)]">
          {formatCLP(total)}
        </td>
      </tr>
    </>
  )
}

// ── Lista Tab ───────────────────────────────────────────────

function ListaView() {
  const { centros, isLoading, error } = useCostCenters()
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<{ id: number; name: string; code: string } | undefined>()
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const now = new Date()
  const [year] = useState(now.getFullYear())
  const [mes] = useState(now.getMonth() + 1)

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[var(--cx-text-secondary)]">
          {centros.length} centro{centros.length !== 1 ? 's' : ''} registrado{centros.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary flex items-center gap-2 text-xs py-1.5 px-3"
            onClick={() => exportCSV(centros, 'centros-costo')}
          >
            <Download size={12} /> CSV
          </button>
          <button
            className="btn-primary flex items-center gap-2 text-sm py-2 px-4"
            onClick={() => { setEditItem(undefined); setShowModal(true) }}
          >
            <Plus size={14} /> Nuevo Centro
          </button>
        </div>
      </div>

      <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--cx-border-light)]">
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest w-8"></th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest">Codigo</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest">Nombre</th>
              <th className="px-5 py-3 text-right text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest">Balance</th>
              <th className="px-5 py-3 text-right text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest w-24">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--cx-border-light)]">
            {centros.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-sm text-[var(--cx-text-muted)]">
                  No hay centros de costo registrados
                </td>
              </tr>
            ) : (
              centros.map((c: any) => (
                <>
                  <tr
                    key={c.id}
                    className="hover:bg-[var(--cx-hover-bg)] transition-colors cursor-pointer"
                    onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  >
                    <td className="px-5 py-3 text-[var(--cx-text-secondary)]">
                      {expandedId === c.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td className="px-5 py-3 text-sm font-mono text-[var(--cx-text-secondary)]">
                      {c.code || '-'}
                    </td>
                    <td className="px-5 py-3 text-sm text-[var(--cx-text-primary)] font-medium">
                      {c.name}
                    </td>
                    <td className="px-5 py-3 text-sm text-right tabular-nums">
                      <span className={c.balance >= 0 ? 'text-[var(--cx-status-ok-text)]' : 'text-[var(--cx-status-error-text)]'}>
                        {formatCLP(c.balance)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        className="text-[var(--cx-text-secondary)] hover:text-[var(--cx-active-icon)] transition-colors p-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditItem({ id: c.id, name: c.name, code: c.code })
                          setShowModal(true)
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                    </td>
                  </tr>
                  {expandedId === c.id && (
                    <MovimientosRow centroId={c.id} year={year} mes={mes} />
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>

      <CentroCostoModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditItem(undefined) }}
        initial={editItem}
      />
    </div>
  )
}

// ── Reporte Tab ─────────────────────────────────────────────

function ReporteView({ year, mes }: { year: number; mes: number }) {
  const { reporte, gran_total, isLoading, error } = useCostCenterReport(year, mes)

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState />

  // Prepare chart data (top 10 by absolute value)
  const chartData = [...reporte]
    .sort((a: any, b: any) => Math.abs(b.total) - Math.abs(a.total))
    .slice(0, 10)
    .map((r: any) => ({
      name: r.centro_name.length > 18 ? r.centro_name.slice(0, 18) + '...' : r.centro_name,
      monto: Math.round(r.total),
    }))

  return (
    <div className="space-y-5">
      {/* Bar chart */}
      {chartData.length > 0 && (
        <div className="card border border-[var(--cx-border-light)] rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-[var(--cx-text-primary)] mb-5">
            Monto por Centro de Costo - {MONTHS[mes - 1]} {year}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cx-border)" />
              <XAxis
                type="number"
                tick={{ fill: 'var(--cx-text-secondary)', fontSize: 11 }}
                axisLine={false}
                tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={150}
                tick={{ fill: 'var(--cx-text-secondary)', fontSize: 11 }}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--cx-bg-surface)',
                  border: '1px solid var(--cx-border-light)',
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(v: number) => [formatCLP(v), 'Monto']}
              />
              <Bar dataKey="monto" name="Monto" fill="#7c3aed" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary table */}
      <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-[var(--cx-border-light)] text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest">
          <div className="col-span-5">Centro de Costo</div>
          <div className="col-span-3 text-right">Movimientos</div>
          <div className="col-span-4 text-right">Total</div>
        </div>

        {reporte.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-[var(--cx-text-muted)]">
            Sin datos para este periodo
          </div>
        ) : (
          <div className="divide-y divide-[var(--cx-border-light)]">
            {reporte.map((r: any) => (
              <div key={r.centro_id} className="grid grid-cols-12 gap-2 px-5 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors">
                <div className="col-span-5 text-[var(--cx-text-primary)] font-medium">{r.centro_name}</div>
                <div className="col-span-3 text-right text-[var(--cx-text-secondary)] tabular-nums">{r.count}</div>
                <div className="col-span-4 text-right tabular-nums">
                  <span className={r.total >= 0 ? 'text-[var(--cx-status-ok-text)]' : 'text-[var(--cx-status-error-text)]'}>
                    {formatCLP(r.total)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-12 gap-2 px-5 py-3 border-t border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)] text-sm font-bold">
          <div className="col-span-8 text-[var(--cx-text-secondary)]">GRAN TOTAL</div>
          <div className="col-span-4 text-right text-[var(--cx-active-icon)]">{formatCLP(gran_total)}</div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          className="btn-secondary flex items-center gap-2 text-xs py-1.5 px-3"
          onClick={() => exportCSV(
            reporte.map((r: any) => ({ centro: r.centro_name, movimientos: r.count, total: r.total })),
            `reporte-centros-costo-${year}-${mes}`,
          )}
        >
          <Download size={12} /> Exportar CSV
        </button>
      </div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────

export default function CentrosCostoPage() {
  const now = new Date()
  const [tab, setTab] = useState<Tab>('lista')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)] flex items-center gap-2">
            <Folders size={20} className="text-[var(--cx-active-icon)]" />
            Centros de Costo
          </h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            Cuentas analiticas para seguimiento de costos por area
          </p>
        </div>

        {/* Period selector (for Reporte tab) */}
        {tab === 'reporte' && (
          <div className="flex items-center gap-2">
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="input-field py-2 text-sm w-auto"
            >
              {MESES.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="input-field py-2 text-sm w-auto"
            >
              {[2024, 2025, 2026].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <TabButton id="lista" current={tab} label="Lista" icon={<List size={14} />} onClick={() => setTab('lista')} />
        <TabButton id="reporte" current={tab} label="Reporte" icon={<BarChart3 size={14} />} onClick={() => setTab('reporte')} />
      </div>

      {/* Content */}
      {tab === 'lista' && <ListaView />}
      {tab === 'reporte' && <ReporteView year={year} mes={month} />}
    </div>
  )
}
