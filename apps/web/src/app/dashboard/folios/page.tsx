/**
 * CUENTAX — Administración de Folios (CAF)
 * Mia: "Los folios son el corazón del sistema.
 * Un semáforo visual: verde=ok, amarillo=renovar pronto, rojo=urgente."
 */
'use client'

import { useState } from 'react'
import { Upload, AlertTriangle, CheckCircle2, XCircle,
         RefreshCw, FileText, Info } from 'lucide-react'

interface CAFStatus {
  tipo_dte: number
  tipo_label: string
  folio_desde: number
  folio_hasta: number
  folio_actual: number
  folios_usados: number
  folios_disponibles: number
  porcentaje_usado: number
  necesita_renovacion: boolean
}

const MOCK_CAFS: CAFStatus[] = [
  { tipo_dte: 33, tipo_label: 'Factura Electrónica',       folio_desde: 1000, folio_hasta: 1099, folio_actual: 1044, folios_usados: 44, folios_disponibles: 56, porcentaje_usado: 44, necesita_renovacion: false },
  { tipo_dte: 39, tipo_label: 'Boleta Electrónica',         folio_desde: 2000, folio_hasta: 2099, folio_actual: 2091, folios_usados: 91, folios_disponibles: 9,  porcentaje_usado: 91, necesita_renovacion: true  },
  { tipo_dte: 61, tipo_label: 'Nota de Crédito',            folio_desde: 500,  folio_hasta: 549,  folio_actual: 500,  folios_usados: 0,  folios_disponibles: 50, porcentaje_usado: 0,  necesita_renovacion: false },
]

const TIPOS_SIN_CAF = [
  { tipo_dte: 41, label: 'Boleta No Afecta' },
  { tipo_dte: 56, label: 'Nota de Débito' },
  { tipo_dte: 110, label: 'Factura Exportación' },
]

function StatusDot({ caf }: { caf: CAFStatus }) {
  if (caf.folios_disponibles === 0) return <XCircle size={14} className="text-red-400" />
  if (caf.necesita_renovacion) return <AlertTriangle size={14} className="text-amber-400" />
  return <CheckCircle2 size={14} className="text-emerald-400" />
}

export default function FoliosPage() {
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file?.name.endsWith('.xml')) return
    setUploading(true)
    await new Promise(r => setTimeout(r, 1500))
    setUploading(false)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-white">Administración de Folios</h1>
        <p className="text-sm text-slate-500 mt-0.5">Códigos de Autorización de Folios (CAF) para cada tipo de DTE</p>
      </div>

      {/* Alertas urgentes */}
      {MOCK_CAFS.filter(c => c.necesita_renovacion).map(c => (
        <div key={c.tipo_dte} className="flex items-center gap-3 p-4 rounded-2xl bg-amber-500/[0.07] border border-amber-500/20">
          <AlertTriangle size={16} className="text-amber-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-300">¡Folios bajos — {c.tipo_label}!</p>
            <p className="text-xs text-amber-400/70 mt-0.5">
              Solo quedan <strong>{c.folios_disponibles}</strong> folios ({100 - Math.round(c.porcentaje_usado)}% restante).
              Descarga un nuevo CAF desde el{' '}
              <a href="https://misiir.sii.cl" target="_blank" className="underline">portal SII</a> y cárgalo aquí.
            </p>
          </div>
          <button className="btn-secondary text-xs py-1.5">Cargar CAF</button>
        </div>
      ))}

      {/* CAFs existentes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {MOCK_CAFS.map(caf => {
          const pct = caf.porcentaje_usado
          const barColor = pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-amber-500' : 'bg-emerald-500'

          return (
            <div key={caf.tipo_dte} className="card p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <StatusDot caf={caf} />
                    <span className="text-sm font-bold text-white">
                      Tipo {caf.tipo_dte}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{caf.tipo_label}</p>
                </div>
                <button className="p-1.5 text-slate-600 hover:text-slate-300 hover:bg-white/[0.04] rounded-lg transition-colors">
                  <RefreshCw size={12} />
                </button>
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                  <span>#{caf.folio_actual} / #{caf.folio_hasta}</span>
                  <span className={pct > 90 ? 'text-red-400' : pct > 75 ? 'text-amber-400' : 'text-emerald-400'}>
                    {caf.folios_disponibles} disponibles
                  </span>
                </div>
                <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${barColor}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-600 mt-1">{pct}% utilizado</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-white/[0.03]">
                  <p className="text-slate-600">Desde</p>
                  <p className="text-white font-mono">#{caf.folio_desde}</p>
                </div>
                <div className="p-2 rounded-lg bg-white/[0.03]">
                  <p className="text-slate-600">Hasta</p>
                  <p className="text-white font-mono">#{caf.folio_hasta}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Sin CAF */}
      <div>
        <p className="section-title mb-3">Tipos sin CAF cargado</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {TIPOS_SIN_CAF.map(t => (
            <div key={t.tipo_dte} className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] border-dashed">
              <FileText size={14} className="text-slate-700" />
              <div className="flex-1">
                <p className="text-xs font-medium text-slate-400">Tipo {t.tipo_dte}</p>
                <p className="text-[11px] text-slate-600">{t.label}</p>
              </div>
              <button className="text-[11px] text-violet-400 hover:text-violet-300">Cargar</button>
            </div>
          ))}
        </div>
      </div>

      {/* Upload CAF */}
      <div>
        <p className="section-title mb-3">Cargar nuevo CAF</p>
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          className={`
            relative flex flex-col items-center gap-3 p-8 rounded-2xl border-2 border-dashed transition-all
            ${dragOver
              ? 'border-violet-500/50 bg-violet-500/5'
              : 'border-white/[0.08] hover:border-white/15'
            }
          `}
        >
          {uploading ? (
            <><RefreshCw size={20} className="text-violet-400 animate-spin" />
            <p className="text-sm text-slate-400">Cargando CAF...</p></>
          ) : (
            <>
              <Upload size={20} className={dragOver ? 'text-violet-400' : 'text-slate-600'} />
              <div className="text-center">
                <p className="text-sm text-slate-300">Arrastra el archivo CAF aquí</p>
                <p className="text-xs text-slate-600 mt-0.5">o haz click para seleccionar · Solo archivos .xml del SII</p>
              </div>
              <label className="btn-secondary cursor-pointer">
                <input type="file" accept=".xml" className="hidden" onChange={() => {}} />
                Seleccionar CAF
              </label>
            </>
          )}
          <div className="flex items-center gap-2 text-[11px] text-slate-600 mt-2">
            <Info size={11} />
            <span>Descarga el CAF desde <a href="https://misiir.sii.cl" target="_blank" rel="noopener" className="text-violet-400 hover:text-violet-300">misiir.sii.cl</a> → Factura Electrónica → Solicitar CAF</span>
          </div>
        </div>
      </div>
    </div>
  )
}
