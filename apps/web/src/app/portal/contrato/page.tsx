/**
 * CUENTAX — Portal del Trabajador: Mi Contrato
 * Shows the employee's active contract and historical contracts.
 */

'use client'

import { useState } from 'react'
import { usePortalContract, downloadContractPDF } from '@/hooks/use-portal'
import {
  Briefcase, Loader2, AlertCircle, Calendar,
  Building2, Banknote, FileText, Download,
} from 'lucide-react'

// ── CLP formatter ─────────────────────────────────────────────
const clpFmt = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

// ── Contract state ────────────────────────────────────────────
function contractStateLabel(state: string): { label: string; color: string } {
  switch (state) {
    case 'open':
      return { label: 'Vigente', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    case 'close':
      return { label: 'Finalizado', color: 'bg-slate-50 text-slate-600 border-slate-200' }
    case 'draft':
      return { label: 'Borrador', color: 'bg-amber-50 text-amber-700 border-amber-200' }
    case 'cancel':
      return { label: 'Cancelado', color: 'bg-red-50 text-red-600 border-red-200' }
    default:
      return { label: state, color: 'bg-slate-50 text-slate-600 border-slate-200' }
  }
}

// ── Date formatter ────────────────────────────────────────────
function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Indefinido'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function PortalContratoPage() {
  const { contratoActivo, historicos, isLoading, error } = usePortalContract()
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    setDownloadError(false)
    try {
      await downloadContractPDF()
    } catch {
      setDownloadError(true)
    } finally {
      setDownloading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-violet-500" />
        <span className="ml-2 text-sm text-slate-500">Cargando contrato...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200">
        <AlertCircle size={16} className="text-red-500" />
        <span className="text-sm text-red-600">Error al cargar la informacion del contrato</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Mi Contrato</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Informacion de tu contrato de trabajo
          </p>
        </div>
        {contratoActivo && (
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            Descargar PDF
          </button>
        )}
      </div>
      {downloadError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
          <AlertCircle size={14} className="text-red-500" />
          <span className="text-xs text-red-600">Error al descargar el contrato</span>
        </div>
      )}

      {/* Active contract */}
      {contratoActivo ? (
        <div className="bg-white border border-[var(--cx-border)] rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-violet-50 border-b border-violet-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-violet-800 flex items-center gap-2">
              <Briefcase size={14} /> Contrato Actual
            </h2>
            {(() => {
              const { label, color } = contractStateLabel(contratoActivo.state)
              return (
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border ${color}`}>
                  {label}
                </span>
              )
            })()}
          </div>

          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Nombre del Contrato</label>
                <p className="text-sm text-slate-800 font-medium mt-0.5">{contratoActivo.name}</p>
              </div>
              <div>
                <label className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Cargo</label>
                <p className="text-sm text-slate-800 mt-0.5 flex items-center gap-1.5">
                  <Building2 size={13} className="text-slate-400" />
                  {contratoActivo.job || '-'}
                </p>
              </div>
              <div>
                <label className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Departamento</label>
                <p className="text-sm text-slate-800 mt-0.5">{contratoActivo.department || '-'}</p>
              </div>
              <div>
                <label className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Estructura Salarial</label>
                <p className="text-sm text-slate-800 mt-0.5">{contratoActivo.structure || '-'}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Sueldo Base</label>
                <p className="text-xl font-bold text-violet-700 mt-0.5 flex items-center gap-1.5 tabular-nums">
                  <Banknote size={18} className="text-violet-500" />
                  {clpFmt(contratoActivo.wage)}
                </p>
              </div>
              <div>
                <label className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Fecha de Inicio</label>
                <p className="text-sm text-slate-800 mt-0.5 flex items-center gap-1.5">
                  <Calendar size={13} className="text-slate-400" />
                  {formatDate(contratoActivo.date_start)}
                </p>
              </div>
              <div>
                <label className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Fecha de Termino</label>
                <p className="text-sm text-slate-800 mt-0.5 flex items-center gap-1.5">
                  <Calendar size={13} className="text-slate-400" />
                  {formatDate(contratoActivo.date_end)}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-white border border-[var(--cx-border)] rounded-xl">
          <FileText size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No se encontro un contrato activo</p>
        </div>
      )}

      {/* Historical contracts */}
      {historicos.length > 0 && (
        <div className="bg-white border border-[var(--cx-border)] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--cx-border)]">
            <h2 className="text-sm font-semibold text-slate-700">Contratos Anteriores</h2>
          </div>
          <div className="divide-y divide-[var(--cx-border)]">
            {historicos.map((c) => {
              const { label, color } = contractStateLabel(c.state)
              return (
                <div key={c.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-700 font-medium">{c.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formatDate(c.date_start)} - {formatDate(c.date_end)} &middot; {clpFmt(c.wage)}
                    </p>
                  </div>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border ${color}`}>
                    {label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
