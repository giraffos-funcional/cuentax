/**
 * CUENTAX — Administración de Folios (CAF)
 * Mia: "Los folios son el corazón del sistema.
 * Un semáforo visual: verde=ok, amarillo=renovar pronto, rojo=urgente."
 */
'use client'

import { useState } from 'react'
import { Upload, AlertTriangle, CheckCircle2, XCircle,
         RefreshCw, FileText, Info, History, BarChart3 } from 'lucide-react'
import { useCAFStatus } from '@/hooks'

const TIPO_LABELS: Record<number, string> = {
  33: 'Factura Electrónica',
  34: 'Factura No Afecta',
  39: 'Boleta Electrónica',
  41: 'Boleta No Afecta',
  43: 'Liquidación Factura',
  46: 'Factura Compra',
  52: 'Guía de Despacho',
  56: 'Nota de Débito',
  61: 'Nota de Crédito',
  110: 'Factura Exportación',
  111: 'N/D Exportación',
  112: 'N/C Exportación',
}

type Tab = 'estado' | 'historial'

interface CAFData {
  tipo_dte: number
  rut_empresa: string
  folio_desde: number
  folio_hasta: number
  folio_actual: number
  folios_usados: number
  folios_disponibles: number
  porcentaje_usado: number
  necesita_renovacion: boolean
}

function StatusDot({ caf }: { caf: CAFData }) {
  if (caf.folios_disponibles === 0) return <XCircle size={14} className="text-[var(--cx-status-error-text)]" />
  if (caf.necesita_renovacion) return <AlertTriangle size={14} className="text-[var(--cx-status-warn-text)]" />
  return <CheckCircle2 size={14} className="text-[var(--cx-status-ok-text)]" />
}

export default function FoliosPage() {
  const [tab, setTab] = useState<Tab>('estado')
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const { cafs, isLoading, uploadCAF } = useCAFStatus()

  const cafList: CAFData[] = cafs ?? []
  const cafsConFolios = cafList.filter((c: CAFData) => c.folios_disponibles > 0 || c.folios_usados > 0)
  const tiposCargados = new Set(cafList.map((c: CAFData) => c.tipo_dte))
  const tiposSinCAF = [33, 39, 41, 56, 61, 110].filter(t => !tiposCargados.has(t))

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.xml')) {
      alert('Solo se aceptan archivos .xml')
      return
    }
    setUploading(true)
    try {
      await uploadCAF(file)
    } catch (err: any) {
      const msg = err.response?.data?.message ?? err.response?.data?.detail ?? 'Error cargando CAF'
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setUploading(false)
    }
  }

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await handleFileUpload(file)
    e.target.value = ''
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) await handleFileUpload(file)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Administración de Folios</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">Códigos de Autorización de Folios (CAF) para cada tipo de DTE</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--cx-bg-elevated)] w-fit">
        <button
          onClick={() => setTab('estado')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'estado'
              ? 'bg-[var(--cx-bg-card)] text-[var(--cx-text-primary)] shadow-sm'
              : 'text-[var(--cx-text-muted)] hover:text-[var(--cx-text-secondary)]'
          }`}
        >
          <BarChart3 size={14} />
          Estado Actual
        </button>
        <button
          onClick={() => setTab('historial')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'historial'
              ? 'bg-[var(--cx-bg-card)] text-[var(--cx-text-primary)] shadow-sm'
              : 'text-[var(--cx-text-muted)] hover:text-[var(--cx-text-secondary)]'
          }`}
        >
          <History size={14} />
          Historial
        </button>
      </div>

      {tab === 'estado' && (
        <>
          {/* Alertas urgentes */}
          {cafList.filter((c: CAFData) => c.necesita_renovacion).map((c: CAFData) => (
            <div key={c.tipo_dte} className="flex items-center gap-3 p-4 rounded-2xl bg-amber-500/[0.07] border border-amber-500/20">
              <AlertTriangle size={16} className="text-[var(--cx-status-warn-text)] shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-300">
                  Folios bajos — {TIPO_LABELS[c.tipo_dte] ?? `Tipo ${c.tipo_dte}`}
                </p>
                <p className="text-xs text-amber-400/70 mt-0.5">
                  Solo quedan <strong>{c.folios_disponibles}</strong> folios ({100 - Math.round(c.porcentaje_usado)}% restante).
                  Descarga un nuevo CAF desde el{' '}
                  <a href="https://misiir.sii.cl" target="_blank" className="underline">portal SII</a> y cárgalo aquí.
                </p>
              </div>
              <button
                className="btn-secondary text-xs py-1.5"
                onClick={() => document.getElementById('caf-upload')?.click()}
              >Cargar CAF</button>
            </div>
          ))}

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-[var(--cx-text-muted)]">
              <RefreshCw size={16} className="animate-spin mr-2" />
              Cargando folios...
            </div>
          )}

          {/* CAFs existentes */}
          {!isLoading && cafList.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {cafList.map((caf: CAFData) => {
                const pct = caf.porcentaje_usado
                const barColor = pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-amber-500' : 'bg-emerald-500'

                return (
                  <div key={caf.tipo_dte} className="card p-5 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <StatusDot caf={caf} />
                          <span className="text-sm font-bold text-[var(--cx-text-primary)]">
                            Tipo {caf.tipo_dte}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--cx-text-secondary)] mt-0.5">
                          {TIPO_LABELS[caf.tipo_dte] ?? 'Documento Tributario'}
                        </p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div>
                      <div className="flex justify-between text-xs text-[var(--cx-text-secondary)] mb-1.5">
                        <span>#{caf.folio_actual} / #{caf.folio_hasta}</span>
                        <span className={pct > 90 ? 'text-[var(--cx-status-error-text)]' : pct > 75 ? 'text-[var(--cx-status-warn-text)]' : 'text-[var(--cx-status-ok-text)]'}>
                          {caf.folios_disponibles} disponibles
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-[var(--cx-bg-elevated)] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-[var(--cx-text-muted)] mt-1">{pct}% utilizado</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded-lg bg-[var(--cx-bg-elevated)]">
                        <p className="text-[var(--cx-text-muted)]">Desde</p>
                        <p className="text-[var(--cx-text-primary)] font-mono">#{caf.folio_desde}</p>
                      </div>
                      <div className="p-2 rounded-lg bg-[var(--cx-bg-elevated)]">
                        <p className="text-[var(--cx-text-muted)]">Hasta</p>
                        <p className="text-[var(--cx-text-primary)] font-mono">#{caf.folio_hasta}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Sin CAF */}
          {!isLoading && cafList.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center">
              <FileText size={32} className="text-[var(--cx-text-muted)] mb-3" />
              <p className="text-sm text-[var(--cx-text-secondary)]">No hay CAFs cargados</p>
              <p className="text-xs text-[var(--cx-text-muted)] mt-1">Carga un archivo XML desde el portal SII para comenzar</p>
            </div>
          )}

          {/* Tipos sin CAF */}
          {!isLoading && tiposSinCAF.length > 0 && (
            <div>
              <p className="section-title mb-3">Tipos sin CAF cargado</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {tiposSinCAF.map(tipo => (
                  <div key={tipo} className="flex items-center gap-3 p-4 rounded-xl bg-[var(--cx-bg-elevated)] border border-[var(--cx-border-light)] border-dashed">
                    <FileText size={14} className="text-[var(--cx-text-muted)]" />
                    <div className="flex-1">
                      <p className="text-xs font-medium text-[var(--cx-text-secondary)]">Tipo {tipo}</p>
                      <p className="text-[11px] text-[var(--cx-text-muted)]">{TIPO_LABELS[tipo] ?? 'DTE'}</p>
                    </div>
                    <button
                      onClick={() => document.getElementById('caf-upload')?.click()}
                      className="text-[11px] text-[var(--cx-active-icon)] hover:text-[var(--cx-text-primary)]"
                    >Cargar</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Historial Tab ─────────────────────────────────────── */}
      {tab === 'historial' && (
        <div>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-[var(--cx-text-muted)]">
              <RefreshCw size={16} className="animate-spin mr-2" />
              Cargando historial...
            </div>
          ) : cafList.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <History size={32} className="text-[var(--cx-text-muted)] mb-3" />
              <p className="text-sm text-[var(--cx-text-secondary)]">Sin registros</p>
              <p className="text-xs text-[var(--cx-text-muted)] mt-1">Los CAFs cargados aparecerán aquí</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--cx-border-light)]">
                      <th className="text-left p-4 text-xs font-medium text-[var(--cx-text-muted)] uppercase tracking-wider">Tipo DTE</th>
                      <th className="text-left p-4 text-xs font-medium text-[var(--cx-text-muted)] uppercase tracking-wider">RUT Empresa</th>
                      <th className="text-left p-4 text-xs font-medium text-[var(--cx-text-muted)] uppercase tracking-wider">Rango Folios</th>
                      <th className="text-right p-4 text-xs font-medium text-[var(--cx-text-muted)] uppercase tracking-wider">Total</th>
                      <th className="text-right p-4 text-xs font-medium text-[var(--cx-text-muted)] uppercase tracking-wider">Usados</th>
                      <th className="text-right p-4 text-xs font-medium text-[var(--cx-text-muted)] uppercase tracking-wider">Disponibles</th>
                      <th className="text-right p-4 text-xs font-medium text-[var(--cx-text-muted)] uppercase tracking-wider">Uso</th>
                      <th className="text-center p-4 text-xs font-medium text-[var(--cx-text-muted)] uppercase tracking-wider">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--cx-border-light)]">
                    {cafList.map((caf: CAFData) => {
                      const total = caf.folio_hasta - caf.folio_desde + 1
                      const estado = caf.folios_disponibles === 0
                        ? 'agotado'
                        : caf.necesita_renovacion
                        ? 'bajo'
                        : 'activo'

                      return (
                        <tr key={caf.tipo_dte} className="hover:bg-[var(--cx-hover-bg)] transition-colors">
                          <td className="p-4">
                            <div>
                              <p className="font-medium text-[var(--cx-text-primary)]">Tipo {caf.tipo_dte}</p>
                              <p className="text-xs text-[var(--cx-text-muted)]">
                                {TIPO_LABELS[caf.tipo_dte] ?? 'DTE'}
                              </p>
                            </div>
                          </td>
                          <td className="p-4 font-mono text-xs text-[var(--cx-text-secondary)]">
                            {caf.rut_empresa}
                          </td>
                          <td className="p-4 font-mono text-xs text-[var(--cx-text-secondary)]">
                            #{caf.folio_desde} — #{caf.folio_hasta}
                          </td>
                          <td className="p-4 text-right font-mono text-xs text-[var(--cx-text-secondary)]">
                            {total}
                          </td>
                          <td className="p-4 text-right font-mono text-xs text-[var(--cx-text-secondary)]">
                            {caf.folios_usados}
                          </td>
                          <td className="p-4 text-right font-mono text-xs text-[var(--cx-text-primary)] font-medium">
                            {caf.folios_disponibles}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-[var(--cx-bg-elevated)] rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    caf.porcentaje_usado > 90 ? 'bg-red-500' : caf.porcentaje_usado > 75 ? 'bg-amber-500' : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${Math.min(caf.porcentaje_usado, 100)}%` }}
                                />
                              </div>
                              <span className="text-xs text-[var(--cx-text-muted)] w-10 text-right">
                                {caf.porcentaje_usado}%
                              </span>
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${
                              estado === 'agotado'
                                ? 'bg-red-500/10 text-red-400'
                                : estado === 'bajo'
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-emerald-500/10 text-emerald-400'
                            }`}>
                              {estado === 'agotado' && <XCircle size={10} />}
                              {estado === 'bajo' && <AlertTriangle size={10} />}
                              {estado === 'activo' && <CheckCircle2 size={10} />}
                              {estado === 'agotado' ? 'Agotado' : estado === 'bajo' ? 'Bajo' : 'Activo'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload CAF — visible in both tabs */}
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
              : 'border-[var(--cx-border-light)] hover:border-[var(--cx-border-hover)]'
            }
          `}
        >
          {uploading ? (
            <><RefreshCw size={20} className="text-[var(--cx-active-icon)] animate-spin" />
            <p className="text-sm text-[var(--cx-text-secondary)]">Cargando CAF...</p></>
          ) : (
            <>
              <Upload size={20} className={dragOver ? 'text-[var(--cx-active-icon)]' : 'text-[var(--cx-text-muted)]'} />
              <div className="text-center">
                <p className="text-sm text-[var(--cx-text-primary)]">Arrastra el archivo CAF aquí</p>
                <p className="text-xs text-[var(--cx-text-muted)] mt-0.5">o haz click para seleccionar · Solo archivos .xml del SII</p>
              </div>
              <label className="btn-secondary cursor-pointer">
                <input id="caf-upload" type="file" accept=".xml" className="hidden" onChange={handleInputChange} />
                Seleccionar CAF
              </label>
            </>
          )}
          <div className="flex items-center gap-2 text-[11px] text-[var(--cx-text-muted)] mt-2">
            <Info size={11} />
            <span>Descarga el CAF desde <a href="https://misiir.sii.cl" target="_blank" rel="noopener" className="text-[var(--cx-active-icon)] hover:text-[var(--cx-text-primary)]">misiir.sii.cl</a> → Factura Electrónica → Solicitar CAF</span>
          </div>
        </div>
      </div>
    </div>
  )
}
