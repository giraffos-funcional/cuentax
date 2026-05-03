/**
 * CUENTAX — Asistente de Certificación SII
 * Wizard de 6 pasos para certificar empresa ante el SII.
 */

'use client'

import { useState, useRef, useEffect } from 'react'
import {
  ShieldCheck, CheckCircle2, Circle, ChevronRight, Upload,
  ExternalLink, Loader2, AlertTriangle, FileText, Send,
  RefreshCw, Download, RotateCcw, Wifi, Play, Info
} from 'lucide-react'
import {
  useCertificationWizard,
  useCertificationPrerequisites,
  useCompleteStep,
  useUploadTestSet,
  useProcessTestSet,
  useResetCertification,
  useSIIStatus,
  useCAFStatus,
  useEmitSimulacion,
} from '@/hooks'
import { useAuthStore } from '@/stores/auth.store'
import { CertificateStep } from '@/components/sii/CertificateUpload'
import { apiClient } from '@/lib/api-client'

// ── Step Indicator ────────────────────────────────────────────
function StepBadge({ done, active, step }: { done: boolean; active: boolean; step: number }) {
  return (
    <div className={`
      w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold
      ring-2 transition-all duration-300 shrink-0
      ${done   ? 'bg-emerald-500 text-white ring-emerald-300' : ''}
      ${active ? 'bg-violet-500 text-white ring-violet-300 shadow-lg shadow-violet-200' : ''}
      ${!done && !active ? 'bg-[var(--cx-bg-elevated)] text-[var(--cx-text-muted)] ring-[var(--cx-border-light)]' : ''}
    `}>
      {done ? <CheckCircle2 size={16} /> : step === 0 ? <ShieldCheck size={16} /> : step}
    </div>
  )
}

// ── Step 0: Prerequisitos ─────────────────────────────────────
function PrerequisiteItem({ ok, label, detail, action }: {
  ok: boolean; label: string; detail: string; action?: { href: string; text: string }
}) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${
      ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
    }`}>
      <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
        ok ? 'bg-emerald-500' : 'bg-red-400'
      }`}>
        {ok ? <CheckCircle2 size={12} className="text-white" /> : <AlertTriangle size={12} className="text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${ok ? 'text-emerald-700' : 'text-red-700'}`}>{label}</p>
        <p className={`text-xs mt-0.5 ${ok ? 'text-emerald-600' : 'text-red-600'}`}>{detail}</p>
      </div>
      {action && !ok && (
        <a href={action.href} className="shrink-0 text-xs font-semibold text-violet-600 hover:text-violet-700 underline">
          {action.text}
        </a>
      )}
    </div>
  )
}

function StepPrerequisitos({ onReady, prerequisites, refreshPrereqs }: {
  onReady: () => void
  prerequisites: any
  refreshPrereqs: () => void
}) {
  const p = prerequisites
  const { uploadCAF } = useCAFStatus('certificacion')
  const [cafUploading, setCafUploading] = useState(false)

  const certOk = p?.certificado?.ok ?? false
  const cafFactura = p?.cafs_ready_factura ?? false
  const cafBoleta = p?.cafs_ready_boleta ?? false
  const siiOk = p?.sii?.conectado ?? false
  const allReady = certOk && (cafFactura || cafBoleta)

  // CAF detail text
  const cafTypes = p?.cafs ?? {}
  const loadedTypes = Object.entries(cafTypes)
    .filter(([, v]: any) => v.loaded)
    .map(([, v]: any) => v.label)
  const missingTypes = Object.entries(cafTypes)
    .filter(([, v]: any) => !v.loaded)
    .map(([, v]: any) => v.label)

  const handleCAFUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.xml')) {
      alert('Solo se aceptan archivos .xml')
      return
    }
    setCafUploading(true)
    try {
      await uploadCAF(file, 'certificacion')
      refreshPrereqs()
    } catch (err: any) {
      alert(err.response?.data?.message ?? 'Error cargando CAF')
    } finally {
      setCafUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <h3 className="text-base font-bold text-[var(--cx-text-primary)]">Verificación de Prerequisitos</h3>
      <p className="text-sm text-[var(--cx-text-secondary)]">
        Antes de iniciar la certificación, verifica que todos los componentes necesarios estén configurados.
      </p>

      <div className="space-y-3">
        <div className={`p-4 rounded-xl border space-y-4 ${
          certOk ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
              certOk ? 'bg-emerald-500' : 'bg-red-400'
            }`}>
              {certOk
                ? <CheckCircle2 size={12} className="text-white" />
                : <AlertTriangle size={12} className="text-white" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${certOk ? 'text-emerald-700' : 'text-red-700'}`}>
                Certificado Digital
              </p>
              <p className={`text-xs mt-0.5 ${certOk ? 'text-emerald-600' : 'text-red-600'}`}>
                {certOk
                  ? 'Certificado cargado y listo para firmar. Puedes re-cargarlo si lo necesitas.'
                  : 'Debes cargar tu certificado digital (.pfx) para firmar los DTEs'}
              </p>
            </div>
          </div>
          <div className="bg-white rounded-lg p-4 sm:p-6 border border-slate-200 shadow-sm">
            <CertificateStep onSuccess={refreshPrereqs} />
          </div>
        </div>

        {/* CAF Section — Rich card UI */}
        <div className={`p-4 rounded-xl border space-y-3 ${
          (cafFactura || cafBoleta) ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
              (cafFactura || cafBoleta) ? 'bg-emerald-500' : 'bg-red-400'
            }`}>
              {(cafFactura || cafBoleta)
                ? <CheckCircle2 size={12} className="text-white" />
                : <AlertTriangle size={12} className="text-white" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${(cafFactura || cafBoleta) ? 'text-emerald-700' : 'text-red-700'}`}>
                Folios (CAF) — Ambiente Certificación
              </p>
              <p className={`text-xs mt-0.5 ${(cafFactura || cafBoleta) ? 'text-emerald-600' : 'text-red-600'}`}>
                {(cafFactura || cafBoleta)
                  ? 'Folios cargados para el ambiente de certificación'
                  : 'Carga los CAFs del ambiente de certificación (maullin.sii.cl)'}
              </p>
            </div>
          </div>

          {/* Individual CAF type cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(cafTypes).map(([tipo, info]: [string, any]) => (
              <div
                key={tipo}
                className={`p-3 rounded-lg border flex items-start gap-3 ${
                  info.loaded
                    ? 'bg-white border-emerald-200'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                  info.loaded ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                }`}>
                  {tipo}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold ${info.loaded ? 'text-slate-800' : 'text-slate-400'}`}>
                    {info.label}
                  </p>
                  {info.loaded ? (
                    <div className="mt-1 space-y-0.5">
                      <div className="flex items-center gap-3 text-[10px] text-slate-500">
                        <span>Folios: <span className="font-mono font-bold text-slate-700">{info.folio_desde}</span> — <span className="font-mono font-bold text-slate-700">{info.folio_hasta}</span></span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className={`font-semibold ${info.folios_disponibles > 5 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {info.folios_disponibles} folios disponibles
                        </span>
                      </div>
                      {info.rut_empresa && (
                        <p className="text-[10px] text-slate-400 font-mono">{info.rut_empresa}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-0.5">No cargado</p>
                  )}
                </div>
                {info.loaded && (
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-1" />
                )}
              </div>
            ))}
          </div>

          {/* Upload button — always visible */}
          <div className="flex items-center gap-3">
            <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
              cafUploading
                ? 'bg-slate-100 text-slate-400'
                : 'bg-violet-100 text-violet-700 hover:bg-violet-200 hover:shadow-sm'
            }`}>
              {cafUploading ? (
                <><Loader2 size={12} className="animate-spin" /> Subiendo CAF...</>
              ) : (
                <><Upload size={12} /> Subir CAF de certificación (.xml)</>
              )}
              <input type="file" accept=".xml" className="hidden" onChange={handleCAFUpload} disabled={cafUploading} />
            </label>
            {(cafFactura || cafBoleta) && missingTypes.length > 0 && (
              <span className="text-[10px] text-amber-600 font-medium">
                Faltan: {missingTypes.join(', ')}
              </span>
            )}
          </div>

          {/* Ready indicators */}
          {(cafFactura || cafBoleta) && (
            <div className="flex flex-wrap gap-3 pt-1">
              <div className={`flex items-center gap-1.5 text-xs font-medium ${cafFactura ? 'text-emerald-600' : 'text-slate-400'}`}>
                {cafFactura ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                Set Factura {cafFactura ? '✓' : '(tipos 33 + 61)'}
              </div>
              <div className={`flex items-center gap-1.5 text-xs font-medium ${cafBoleta ? 'text-emerald-600' : 'text-slate-400'}`}>
                {cafBoleta ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                Set Boleta {cafBoleta ? '✓' : '(tipo 39)'}
              </div>
            </div>
          )}
        </div>

        <PrerequisiteItem
          ok={siiOk}
          label="Conexión con SII"
          detail={siiOk
            ? `Conectado al ambiente de ${p?.sii?.ambiente ?? 'certificación'}`
            : 'No se pudo conectar con el SII. Esto puede resolverse al procesar.'
          }
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={refreshPrereqs}
          className="btn-secondary flex items-center gap-2 text-xs"
        >
          <RefreshCw size={12} /> Verificar de nuevo
        </button>

        <button
          onClick={onReady}
          disabled={!allReady}
          className="btn-primary flex-1 justify-center"
        >
          {allReady ? (
            <>Continuar con la Certificación <ChevronRight size={14} /></>
          ) : (
            <>Completa los prerequisitos para continuar</>
          )}
        </button>
      </div>

      {!allReady && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700">
          <Info size={14} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">¿Cómo obtener los CAFs de certificación?</p>
            <ol className="list-decimal list-inside mt-1 space-y-0.5">
              <li>Entra al portal de certificación: <a href="https://maullin.sii.cl" target="_blank" rel="noopener" className="underline font-semibold">maullin.sii.cl</a></li>
              <li>Ve a Factura Electrónica → Solicitar Folios</li>
              <li>Solicita folios para tipos 33, 39, 61 (y 56 si aplica)</li>
              <li>Descarga los archivos XML y súbelos arriba</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Step 1: Postulación (manual) ──────────────────────────────
// ── ManualPortalStep ──────────────────────────────────────────
// Reusable component for steps that require manual action in the SII portal
// (Postulación + Declaración). Renders: title, intro, optional children (callout),
// external link, confirmation checkbox, action button.
function ManualPortalStep({
  title,
  intro,
  children,
  linkHref,
  linkLabel,
  linkDomain,
  checkboxLabel,
  buttonLabel,
  buttonIcon,
  onComplete,
}: {
  title: string
  intro: string
  children?: React.ReactNode
  linkHref: string
  linkLabel: string
  linkDomain: string
  checkboxLabel: string
  buttonLabel: string
  buttonIcon?: React.ReactNode
  onComplete: () => void
}) {
  const [confirmed, setConfirmed] = useState(false)
  return (
    <div className="space-y-4 animate-fade-in">
      <h3 className="text-base font-bold text-[var(--cx-text-primary)]">{title}</h3>
      <p className="text-sm text-[var(--cx-text-secondary)]">{intro}</p>
      {children}
      <a
        href={linkHref}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-violet-700 hover:bg-violet-50 transition-colors"
      >
        <ExternalLink size={14} />
        {linkLabel}
        <span className="ml-auto text-[10px] text-slate-400">{linkDomain}</span>
      </a>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={e => setConfirmed(e.target.checked)}
          className="w-4 h-4 mt-0.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
        />
        <span className="text-sm text-[var(--cx-text-secondary)]">{checkboxLabel}</span>
      </label>
      <button
        onClick={onComplete}
        disabled={!confirmed}
        className="btn-primary w-full justify-center"
      >
        {buttonLabel} {buttonIcon ?? <ChevronRight size={14} />}
      </button>
    </div>
  )
}

function StepPostulacion({ onComplete }: { onComplete: () => void }) {
  return (
    <ManualPortalStep
      title="Postulación al Ambiente de Certificación"
      intro="El representante legal debe registrar la empresa en el portal del SII con su certificado digital personal."
      linkHref="https://maullin.sii.cl/cvc/dte/pe_condiciones.html"
      linkLabel="Ir al Portal de Postulación SII"
      linkDomain="maullin.sii.cl"
      checkboxLabel="Ya completé la postulación en el portal del SII"
      buttonLabel="Marcar como completado"
      onComplete={onComplete}
    >
      <div className="p-4 rounded-xl bg-violet-50 border border-violet-200 space-y-3">
        <p className="text-sm font-semibold text-violet-800">Datos necesarios:</p>
        <ul className="text-xs text-violet-700 space-y-1.5 list-disc list-inside">
          <li>RUT de la empresa</li>
          <li>RUT del usuario administrador</li>
          <li>Email de contacto SII</li>
          <li>Nombre del software: <span className="font-mono font-bold">CUENTAX - Giraffos SpA</span></li>
          <li>Documentos: Factura (33), NC (61), ND (56)</li>
        </ul>
      </div>
    </ManualPortalStep>
  )
}

// ── Set Upload Card (reusable for factura/boleta) ─────────────
function SetUploadCard({
  setType,
  label,
  description,
  refresh,
  rutEmisor,
}: {
  setType: 'factura' | 'boleta'
  label: string
  description: string
  refresh: () => void
  rutEmisor?: string | null
}) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [uploadResult, setUploadResult] = useState<any>(null)
  const [processResult, setProcessResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { upload } = useUploadTestSet()
  const { process } = useProcessTestSet()

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const overrides = rutEmisor ? { rut_emisor: rutEmisor } : undefined
      const result = await upload(file, overrides, setType)
      setUploadResult(result)
    } catch (e: any) {
      const msg = e.response?.data?.message ?? e.message ?? 'Error al cargar'
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setUploading(false)
    }
  }

  const handleProcess = async () => {
    setProcessing(true)
    setError(null)
    try {
      const result = await process(undefined, setType)
      // Always show the result so errores are visible
      setProcessResult(result)
      // Don't auto-advance — let user review results first
    } catch (e: any) {
      const msg = e.response?.data?.message ?? e.message ?? 'Error al procesar'
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-violet-600" />
        <h4 className="text-sm font-bold text-[var(--cx-text-primary)]">{label}</h4>
      </div>
      <p className="text-xs text-[var(--cx-text-secondary)]">{description}</p>

      {/* File Upload */}
      <div
        onClick={() => inputRef.current?.click()}
        className={`
          flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all
          ${file
            ? 'border-emerald-300 bg-emerald-50'
            : 'border-[var(--cx-border-hover)] hover:border-violet-300 hover:bg-violet-50 bg-[var(--cx-bg-elevated)]'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.text"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setUploadResult(null); setProcessResult(null); setError(null) } }}
        />
        {file ? (
          <>
            <FileText size={20} className="text-emerald-600 mb-1" />
            <p className="text-xs font-semibold text-emerald-700">{file.name}</p>
            <p className="text-[10px] text-emerald-600">{(file.size / 1024).toFixed(1)} KB</p>
          </>
        ) : (
          <>
            <Upload size={20} className="text-[var(--cx-text-muted)] mb-1" />
            <p className="text-xs font-medium text-[var(--cx-text-primary)]">Sube el archivo .txt</p>
          </>
        )}
      </div>

      {/* Upload Button */}
      {file && !uploadResult && (
        <button onClick={handleUpload} disabled={uploading} className="btn-primary w-full justify-center text-xs py-2">
          {uploading ? <><Loader2 size={12} className="animate-spin" /> Cargando...</> : <><Upload size={12} /> Cargar y Analizar</>}
        </button>
      )}

      {/* Upload Result */}
      {uploadResult && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-600" />
            <p className="text-xs font-semibold text-emerald-700">
              {uploadResult.total_cases} casos encontrados
            </p>
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {uploadResult.cases?.map((c: any) => (
              <div key={c.caso} className="flex items-center gap-2 text-[10px] text-emerald-700 bg-emerald-100/50 px-2 py-1 rounded">
                <span className="font-mono font-bold">#{c.caso}</span>
                <span>Tipo {c.tipo_dte}</span>
                <span className="text-emerald-500">{c.rut_receptor}</span>
                <span className="ml-auto">{c.items_count} items</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Process Button */}
      {uploadResult && !processResult && (
        <button onClick={handleProcess} disabled={processing} className="btn-primary w-full justify-center text-xs py-2">
          {processing ? (
            <><Loader2 size={12} className="animate-spin" /> Enviando al SII...</>
          ) : (
            <><Send size={12} /> Generar DTEs y Enviar</>
          )}
        </button>
      )}

      {/* Process Result */}
      {processResult && (
        <>
          {/* Case 1: Sent to SII with track_id */}
          {processResult.track_id ? (
            <div className="p-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <p className="text-sm font-bold text-emerald-700">
                  ¡Enviado al SII exitosamente!
                </p>
              </div>
              <p className="text-xs text-emerald-600">
                {processResult.emitidos ?? 0}/{processResult.total} DTEs generados, firmados y enviados.
              </p>

              {/* Prominent Track ID */}
              <div className="p-3 bg-white rounded-lg border border-emerald-200 flex items-center gap-3">
                <div className="shrink-0">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">N° Envío (Track ID)</p>
                  <p className="text-lg font-mono font-bold text-violet-700">{processResult.track_id}</p>
                </div>
                <button
                  onClick={() => { navigator.clipboard.writeText(processResult.track_id); }}
                  className="ml-auto shrink-0 px-2 py-1 text-[10px] font-semibold text-violet-600 bg-violet-100 rounded-lg hover:bg-violet-200 transition-colors"
                >
                  Copiar
                </button>
              </div>

              <div className="p-2.5 bg-violet-50 rounded-lg border border-violet-200 text-[11px] text-violet-700 flex items-start gap-2">
                <Info size={14} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Usa este N° en el portal del SII:</p>
                  <p className="mt-0.5">Ingresa <span className="font-mono font-bold">{processResult.track_id}</span> como "N° Envío" en el formulario de avance del SII junto con la fecha de hoy.</p>
                </div>
              </div>
            </div>

          ) : (
            /* Case 4: Error */
            <div className="p-3 rounded-lg border bg-red-50 border-red-200 space-y-1">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-600" />
                <p className="text-xs font-semibold text-red-700">
                  {processResult.total != null
                    ? <>{processResult.emitidos ?? 0}/{processResult.total} DTEs procesados</>
                    : processResult.mensaje ?? 'Error al procesar'
                  }
                </p>
              </div>
              {processResult.mensaje && processResult.total != null && (
                <p className="text-[10px] text-red-600 font-medium">{processResult.mensaje}</p>
              )}
            </div>
          )}

          {/* Errors list (shown in all cases) */}
          {processResult.errores?.length > 0 && (
            <div className="text-[10px] text-red-600 space-y-0.5 max-h-40 overflow-y-auto mt-2">
              {processResult.errores.map((e: any, i: number) => (
                <p key={i} className="bg-red-100/50 px-2 py-0.5 rounded">
                  <span className="font-bold">Caso {e.caso} (Tipo {e.tipo_dte}):</span> {e.error}
                </p>
              ))}
            </div>
          )}
        </>
      )}

      {error && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 border border-red-200 text-[10px] text-red-600">
          <AlertTriangle size={12} />
          {error}
        </div>
      )}
    </div>
  )
}

// ── Step 2: Set de Prueba ─────────────────────────────────────
function StepSetPrueba({ onComplete, refresh, prerequisites }: { onComplete: () => void; refresh: () => void; prerequisites: any }) {
  // Extract the RUT from loaded CAFs for pre-filling
  const cafRut = (() => {
    const cafs = prerequisites?.cafs ?? {}
    for (const [, v] of Object.entries(cafs) as any) {
      if (v.loaded && v.rut_empresa) return v.rut_empresa
    }
    return null
  })()
  return (
    <div className="space-y-4 animate-fade-in">
      <h3 className="text-base font-bold text-[var(--cx-text-primary)]">Set de Prueba</h3>
      <p className="text-sm text-[var(--cx-text-secondary)]">
        El SII ofrece dos sets de prueba independientes. Descarga cada uno desde el portal,
        sube los archivos y CUENTAX generará y enviará los DTEs automáticamente.
      </p>

      <a
        href="https://maullin.sii.cl/cvc_cgi/dte/pe_generar"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-violet-700 hover:bg-violet-50 transition-colors"
      >
        <Download size={14} />
        Descargar Sets de Prueba del SII
        <span className="ml-auto text-[10px] text-slate-400">maullin.sii.cl</span>
      </a>

      {/* Two upload cards side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SetUploadCard
          setType="factura"
          label="Set Factura"
          description="Facturas (33), Notas de Crédito (61) y Notas de Débito (56)"
          refresh={refresh}
          rutEmisor={cafRut}
        />
        <SetUploadCard
          setType="boleta"
          label="Set Boleta"
          description="Boletas Electrónicas (39) y Boletas Exentas (41)"
          refresh={refresh}
          rutEmisor={cafRut}
        />
      </div>

      {/* Verify on SII */}
      <a
        href="https://maullin.sii.cl/cvc_cgi/dte/pe_avance1"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-xs text-slate-500 hover:text-violet-600 transition-colors"
      >
        <ExternalLink size={12} />
        Verificar avance en el SII
      </a>
    </div>
  )
}

// ── Step 3: Simulación ────────────────────────────────────────
//
// Reglas SII Paso 3 SIMULACIÓN:
//  - Enviar Factura (33) + Nota de Crédito (61) + Nota de Débito (56)
//  - TODO en un único EnvioDTE → un solo track_id
//  - Folios DIFERENTES a los del Paso 1 (Set de Pruebas)
//  - Datos representativos de la operación real
//  - NC con CodRef=1 (anula totalmente) debe replicar detalle exacto
//  - ND con CodRef=3 corrige montos
//  - Referencias entre DTEs del mismo batch se resuelven con _ref_caso_sub
//
// Las claves del payload deben coincidir con `_build_dte_document` del bridge:
//  forma_pago (NO fma_pago), fecha_vencimiento (NO fch_vencimiento),
//  actividad_economica (NO acteco), ref_cod_ref (NO ref_cod),
//  ref_motivo (NO razon_ref).
//
type ItemDraft = {
  nombre: string
  descripcion?: string
  cantidad: number
  unidad: string
  precio_unitario: number
}
type DTEDraft = {
  _caso_sub: number
  _ref_caso_sub?: number
  tipo_dte: 33 | 56 | 61
  rut_receptor: string
  razon_social_receptor: string
  giro_receptor: string
  direccion_receptor: string
  comuna_receptor: string
  ref_tipo_doc?: number
  ref_cod_ref?: 1 | 2 | 3
  ref_motivo?: string
  items: ItemDraft[]
}

const RECEPTORES_SUGERIDOS = [
  {
    rut: '77012071-3',
    razon_social: 'BACK OFFICE SOUTH AMERICA SPA',
    giro: 'Actividades de consultoría de gestión',
    direccion: 'Almirante Pastene 244 of 401',
    comuna: 'Santiago',
  },
  {
    rut: '76293090-0',
    razon_social: 'EXPROCHILE SPA',
    giro: 'Administración de Recursos Humanos',
    direccion: 'Almirante Pastene 244',
    comuna: 'Providencia',
  },
]

const PLANTILLA_INICIAL: DTEDraft[] = [
  {
    _caso_sub: 1,
    tipo_dte: 33,
    rut_receptor: RECEPTORES_SUGERIDOS[0].rut,
    razon_social_receptor: RECEPTORES_SUGERIDOS[0].razon_social,
    giro_receptor: RECEPTORES_SUGERIDOS[0].giro,
    direccion_receptor: RECEPTORES_SUGERIDOS[0].direccion,
    comuna_receptor: RECEPTORES_SUGERIDOS[0].comuna,
    items: [{ nombre: 'Soporte Plataforma', descripcion: 'Soporte mensual — tickets y SLA', cantidad: 1, unidad: 'UN', precio_unitario: 450000 }],
  },
  {
    _caso_sub: 2,
    tipo_dte: 33,
    rut_receptor: RECEPTORES_SUGERIDOS[1].rut,
    razon_social_receptor: RECEPTORES_SUGERIDOS[1].razon_social,
    giro_receptor: RECEPTORES_SUGERIDOS[1].giro,
    direccion_receptor: RECEPTORES_SUGERIDOS[1].direccion,
    comuna_receptor: RECEPTORES_SUGERIDOS[1].comuna,
    items: [{ nombre: 'Desarrollo Automatización 50%', cantidad: 1, unidad: 'UN', precio_unitario: 1200000 }],
  },
  {
    _caso_sub: 3,
    tipo_dte: 33,
    rut_receptor: RECEPTORES_SUGERIDOS[0].rut,
    razon_social_receptor: RECEPTORES_SUGERIDOS[0].razon_social,
    giro_receptor: RECEPTORES_SUGERIDOS[0].giro,
    direccion_receptor: RECEPTORES_SUGERIDOS[0].direccion,
    comuna_receptor: RECEPTORES_SUGERIDOS[0].comuna,
    items: [{ nombre: 'Consultoría implementación módulo', cantidad: 1, unidad: 'UN', precio_unitario: 700000 }],
  },
  {
    _caso_sub: 4,
    _ref_caso_sub: 1,
    tipo_dte: 56,
    rut_receptor: RECEPTORES_SUGERIDOS[0].rut,
    razon_social_receptor: RECEPTORES_SUGERIDOS[0].razon_social,
    giro_receptor: RECEPTORES_SUGERIDOS[0].giro,
    direccion_receptor: RECEPTORES_SUGERIDOS[0].direccion,
    comuna_receptor: RECEPTORES_SUGERIDOS[0].comuna,
    ref_tipo_doc: 33,
    ref_cod_ref: 3, // Corrige montos (aumento)
    ref_motivo: 'Aumenta monto factura por ajuste de tarifa',
    items: [{ nombre: 'Diferencia tarifa proyecto', cantidad: 1, unidad: 'UN', precio_unitario: 80000 }],
  },
  {
    _caso_sub: 5,
    _ref_caso_sub: 2,
    tipo_dte: 61,
    rut_receptor: RECEPTORES_SUGERIDOS[1].rut,
    razon_social_receptor: RECEPTORES_SUGERIDOS[1].razon_social,
    giro_receptor: RECEPTORES_SUGERIDOS[1].giro,
    direccion_receptor: RECEPTORES_SUGERIDOS[1].direccion,
    comuna_receptor: RECEPTORES_SUGERIDOS[1].comuna,
    ref_tipo_doc: 33,
    ref_cod_ref: 1, // Anula totalmente — debe replicar detalle de la F33 referenciada
    ref_motivo: 'Anulación factura por error en monto',
    items: [{ nombre: 'Desarrollo Automatización 50%', cantidad: 1, unidad: 'UN', precio_unitario: 1200000 }],
  },
]

const tipoLabel = (t: number) => (t === 33 ? 'Factura 33' : t === 61 ? 'Nota Crédito 61' : t === 56 ? 'Nota Débito 56' : `Tipo ${t}`)
const codRefLabel = (c?: number) => c === 1 ? 'Anula totalmente' : c === 2 ? 'Corrige texto' : c === 3 ? 'Corrige montos' : '—'
const fmtCLP = (n: number) => n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const calcTotales = (d: DTEDraft) => {
  const neto = d.items.reduce((s, it) => s + Math.round(it.cantidad * it.precio_unitario), 0)
  const iva = Math.round(neto * 0.19)
  return { neto, iva, total: neto + iva }
}

function StepSimulacion() {
  const { user } = useAuthStore()
  const { emit } = useEmitSimulacion()
  const drafts = PLANTILLA_INICIAL // plantilla fija — validada en certificación de Zyncro
  const [emitiendo, setEmitiendo] = useState(false)
  const [resultado, setResultado] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [empresa, setEmpresa] = useState<any>(null)

  useEffect(() => {
    apiClient.get('/api/v1/companies/me')
      .then(r => setEmpresa(r.data))
      .catch(() => setEmpresa(null))
  }, [])

  const rutEmisor = empresa?.rut || (user as any)?.empresa?.rut || (user as any)?.rut_empresa || ''
  const totalesGlobales = drafts.reduce(
    (acc, d) => {
      const t = calcTotales(d)
      return { neto: acc.neto + t.neto, iva: acc.iva + t.iva, total: acc.total + t.total }
    },
    { neto: 0, iva: 0, total: 0 },
  )

  async function handleEmitir() {
    const faltan: string[] = []
    if (!rutEmisor) faltan.push('RUT')
    if (!empresa?.razon_social) faltan.push('Razón social')
    if (!empresa?.giro) faltan.push('Giro')
    if (!empresa?.direccion) faltan.push('Dirección')
    if (!empresa?.comuna) faltan.push('Comuna')
    if (faltan.length) {
      setError(`Completá la configuración de la empresa (Configuración → Empresa). Faltan: ${faltan.join(', ')}.`)
      return
    }
    setError(null)
    setEmitiendo(true)
    setResultado(null)
    try {
      const fechaEmision = new Date().toISOString().slice(0, 10)
      const payloads = drafts.map(d => {
        const total = calcTotales(d)
        const base: Record<string, any> = {
          tipo_dte: d.tipo_dte,
          rut_emisor: rutEmisor,
          razon_social_emisor: empresa?.razon_social ?? '',
          giro_emisor: empresa?.giro ?? '',
          actividad_economica: empresa?.actividad_economica ?? 620200,
          direccion_emisor: empresa?.direccion ?? '',
          comuna_emisor: empresa?.comuna ?? '',
          ciudad_emisor: empresa?.ciudad ?? 'Santiago',
          rut_receptor: d.rut_receptor,
          razon_social_receptor: d.razon_social_receptor,
          giro_receptor: d.giro_receptor,
          direccion_receptor: d.direccion_receptor,
          comuna_receptor: d.comuna_receptor,
          fecha_emision: fechaEmision,
          forma_pago: 2,
          fecha_vencimiento: fechaEmision,
          items: d.items.map(it => ({
            nombre: it.nombre,
            cantidad: it.cantidad,
            unidad: it.unidad || 'UN',
            precio_unitario: it.precio_unitario,
          })),
          _caso_sub: d._caso_sub,
          _monto_neto_esperado: total.neto, // hint para validación
        }
        if (d._ref_caso_sub != null) base._ref_caso_sub = d._ref_caso_sub
        if (d.ref_tipo_doc != null) base.ref_tipo_doc = d.ref_tipo_doc
        if (d.ref_cod_ref != null) base.ref_cod_ref = d.ref_cod_ref
        if (d.ref_motivo) base.ref_motivo = d.ref_motivo
        return base
      })
      const res = await emit(payloads)
      setResultado(res)
      if (!res?.success && !res?.track_id) {
        setError(res?.mensaje || 'El bridge respondió sin éxito')
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Error al emitir simulación')
    } finally {
      setEmitiendo(false)
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <h3 className="text-base font-bold text-[var(--cx-text-primary)]">Simulación</h3>
      <p className="text-sm text-[var(--cx-text-secondary)]">
        Envía documentos representativos de tu operación real al SII en un único <code className="text-xs px-1 rounded bg-slate-100">EnvioDTE</code>.
        El SII espera 3 tipos en este paso: Factura (33), Nota de Crédito (61) y Nota de Débito (56), con folios distintos a los del Paso 1.
      </p>

      <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-start gap-2">
        <Info size={14} className="text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-700 space-y-0.5">
          <p><strong>Plantilla validada por SII:</strong> 3 facturas + 1 ND (corrige montos de F#1) + 1 NC (anula F#2). Esta receta certificó a clientes anteriores y no se edita desde la UI.</p>
          <p>Si necesitás ajustar montos/receptores, modificá <code className="text-[10px] px-1 rounded bg-slate-100">PLANTILLA_INICIAL</code> en el código.</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide text-[10px]">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Tipo</th>
              <th className="px-3 py-2 text-left">Receptor</th>
              <th className="px-3 py-2 text-left">Referencia</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {drafts.map((d, idx) => {
              const t = calcTotales(d)
              const refDraft = d._ref_caso_sub != null ? drafts.find(x => x._caso_sub === d._ref_caso_sub) : null
              return (
                <tr key={d._caso_sub} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-violet-700">#{idx + 1}</td>
                  <td className="px-3 py-2 font-semibold">{tipoLabel(d.tipo_dte)}</td>
                  <td className="px-3 py-2 text-slate-600">
                    <div>{d.razon_social_receptor}</div>
                    <div className="text-[10px] text-slate-400">{d.rut_receptor} · {d.comuna_receptor}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {refDraft ? (
                      <span>#{refDraft._caso_sub} · {codRefLabel(d.ref_cod_ref)}</span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{fmtCLP(t.total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-between text-sm">
        <span className="text-slate-600">Total {drafts.length} DTEs</span>
        <span className="font-mono font-bold text-slate-900">{fmtCLP(totalesGlobales.total)}</span>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {resultado && (
        <div className={`p-3 rounded-xl border text-xs space-y-1 ${resultado.track_id ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
          <div className="flex items-center gap-2 font-semibold">
            {resultado.track_id ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            <span>{resultado.track_id ? 'Envío firmado y despachado al SII' : 'Envío con errores'}</span>
          </div>
          {resultado.track_id && (
            <p className="font-mono">Track ID: <strong>{resultado.track_id}</strong> · Estado: {resultado.estado}</p>
          )}
          {resultado.emitidos != null && (
            <p>Emitidos: {resultado.emitidos}/{resultado.total} · Errores: {resultado.errores?.length ?? 0}</p>
          )}
          {Array.isArray(resultado.errores) && resultado.errores.length > 0 && (
            <ul className="list-disc list-inside">
              {resultado.errores.map((e: any, i: number) => (
                <li key={i}>Caso {e.caso} ({tipoLabel(e.tipo_dte)}): {e.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button
        onClick={handleEmitir}
        disabled={emitiendo}
        className="btn-primary w-full justify-center"
      >
        {emitiendo ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        {emitiendo ? 'Firmando y enviando…' : 'Emitir simulación al SII'}
      </button>

      <a
        href="https://maullin.sii.cl/cvc_cgi/dte/pe_avance1"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-violet-700 hover:bg-violet-50 transition-colors"
      >
        <ExternalLink size={14} />
        Verificar avance en el SII (pe_avance4)
      </a>
    </div>
  )
}

// ── Steps 4 & 5 fusionados — Asistido por bridge ──────────────
// Intercambio + Muestras se ejecutan automáticamente desde sii-bridge
// (intercambio/respond, muestras/generate-bulk). La UI sólo informa.
function StepBridgeAsistido() {
  return (
    <div className="space-y-4 animate-fade-in">
      <h3 className="text-base font-bold text-[var(--cx-text-primary)]">Intercambio y Muestras (asistido)</h3>
      <p className="text-sm text-[var(--cx-text-secondary)]">
        Estos pasos los ejecuta automáticamente sii-bridge a partir del envío hecho en Simulación.
        Verifica el avance en el portal del SII.
      </p>

      <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-start gap-3">
        <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-700 space-y-1">
          <p className="font-semibold">Paso 4 — Intercambio de Información</p>
          <ol className="list-decimal list-inside space-y-0.5 ml-1">
            <li>Recibir EnvioDTE del SII</li>
            <li>Generar RecepcionDTE (acuse de recibo)</li>
            <li>Generar ResultadoDTE (aceptación comercial)</li>
          </ol>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-violet-50 border border-violet-200 flex items-start gap-3">
        <Info size={16} className="text-violet-600 shrink-0 mt-0.5" />
        <div className="text-xs text-violet-700">
          <p className="font-semibold mb-1">Paso 5 — Muestras de Impresión</p>
          <p>Los PDFs (timbre PDF417) se generan automáticamente. Descárgalos desde <strong>Documentos Emitidos</strong>.</p>
        </div>
      </div>
    </div>
  )
}

// ── Step 6: Declaración (manual) ──────────────────────────────
function StepDeclaracion({ onComplete }: { onComplete: () => void }) {
  return (
    <ManualPortalStep
      title="Declaración de Cumplimiento"
      intro="Firma la declaración de cumplimiento en el portal del SII para obtener la resolución que autoriza a tu empresa a emitir DTEs en producción."
      linkHref="https://maullin.sii.cl/cvc_cgi/dte/pe_avance7"
      linkLabel="Ir a Declaración de Cumplimiento"
      linkDomain="maullin.sii.cl"
      checkboxLabel="Ya respaldé los DTEs de certificación, completé la declaración y obtuve la resolución del SII"
      buttonLabel="Finalizar Certificación"
      buttonIcon={<CheckCircle2 size={14} />}
      onComplete={onComplete}
    >
      <div className="p-4 rounded-xl bg-amber-50 border border-amber-300">
        <div className="flex items-start gap-2">
          <AlertTriangle size={16} className="text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-bold text-amber-800">Antes de continuar: respalda tus DTEs de certificación</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              Al avanzar a producción, los XMLs firmados, tracks SII, libros (LV/LC) y
              PDFs con timbre PDF417 generados en el ambiente de certificación
              <strong> pueden dejar de ser accesibles</strong>. Descárgalos y guárdalos
              localmente — son tu evidencia del proceso de certificación.
            </p>
            <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside pt-1">
              <li>XMLs del SET Básico (6 DTEs) y SET Simulación</li>
              <li>XMLs del Libro de Ventas y Libro de Compras</li>
              <li>Track IDs y setmails SII con estados LOK/SOK</li>
              <li>PDFs de muestras con timbre PDF417 + cedible</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
        <p className="text-sm font-semibold text-emerald-700 mb-2">Al completar este paso:</p>
        <ul className="text-xs text-emerald-600 space-y-1 list-disc list-inside">
          <li>El SII emitirá una Resolución de Autorización</li>
          <li>Tu empresa podrá emitir DTEs en ambiente de <strong>Producción</strong></li>
          <li>Deberás cambiar el ambiente de CUENTAX a Producción</li>
        </ul>
      </div>
    </ManualPortalStep>
  )
}

// ── Default steps (used when API is unavailable) ──────────────
const DEFAULT_STEPS = [
  { step: 0, nombre: 'Prerequisitos', manual: false },
  { step: 1, nombre: 'Postulación', manual: true },
  { step: 2, nombre: 'Set de Prueba', manual: false },
  { step: 3, nombre: 'Simulación', manual: false },
  { step: 4, nombre: 'Intercambio', manual: false },
  { step: 5, nombre: 'Muestras', manual: false },
  { step: 6, nombre: 'Declaración', manual: true },
]

// ── Main Page ─────────────────────────────────────────────────
export default function CertificacionWizardPage() {
  const user = useAuthStore(s => s.user)
  const { wizard, isLoading, refresh } = useCertificationWizard()
  const { prerequisites, refresh: refreshPrereqs } = useCertificationPrerequisites()
  const { cert, connectivity } = useSIIStatus()
  const { complete } = useCompleteStep()
  const { reset } = useResetCertification()
  const [resetting, setResetting] = useState(false)
  const [viewStep, setViewStep] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Single source of truth: derive everything from wizard.steps (API)
  const completedSet = new Set<number>(
    (wizard?.steps as Array<{ step: number; completado: boolean }> | undefined)
      ?.filter(s => s.completado).map(s => s.step) ?? [],
  )
  // Current step = first incomplete (or 6 if all done)
  const apiCurrent = (() => {
    for (let i = 0; i <= 6; i++) if (!completedSet.has(i)) return i
    return 6
  })()
  // viewStep is an optional override when the user clicks on a sidebar step
  const currentStep = viewStep ?? apiCurrent
  const steps = DEFAULT_STEPS.map(s => ({
    ...s,
    completado: completedSet.has(s.step),
    actual: s.step === currentStep,
  }))

  const handleCompleteStep = async (step: number) => {
    setActionError(null)
    try {
      await complete(step)
      await refresh()
      setViewStep(null) // jump back to API-driven current
    } catch (e: any) {
      setActionError(e?.message ?? 'Error al marcar paso como completado')
    }
  }

  const handleGoToStep = (step: number) => {
    setViewStep(step)
    setActionError(null)
  }

  const handleReset = async () => {
    if (!confirm('Esto reiniciará todo el progreso de certificación. Continuar?')) return
    setResetting(true)
    try {
      await reset()
      await refresh()
      setViewStep(null)
    } finally {
      setResetting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-violet-500" />
        <span className="ml-3 text-sm text-[var(--cx-text-secondary)]">Cargando wizard...</span>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-violet-100 rounded-xl">
              <ShieldCheck size={20} className="text-violet-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Certificación SII</h1>
              <p className="text-xs text-[var(--cx-text-secondary)] mt-0.5">
                {user?.company_name}
                {user?.company_rut ? ` · ${user.company_rut}` : ''}
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={handleReset}
          disabled={resetting}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors"
        >
          <RotateCcw size={12} className={resetting ? 'animate-spin' : ''} />
          Reiniciar
        </button>
      </div>

      {/* RUT warning */}
      {!user?.company_rut && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <div className="text-xs text-amber-700">
            <p className="font-semibold">Empresa sin RUT configurado</p>
            <p className="mt-0.5">Configura el RUT en <a href="/dashboard/empresa" className="underline font-semibold">Mi Empresa</a> para sincronizar el progreso con el servidor.</p>
          </div>
        </div>
      )}

      {actionError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600">
          <AlertTriangle size={13} />
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Steps sidebar */}
        <div className="lg:col-span-1 space-y-1">
          {steps.map((step: any) => {
            const isDone = step.completado
            const isActive = step.step === currentStep
            return (
              <button
                key={step.step}
                onClick={() => handleGoToStep(step.step)}
                className={`
                  w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all
                  ${isActive ? 'bg-violet-50 border border-violet-200' : 'hover:bg-slate-50'}
                `}
              >
                <StepBadge done={isDone} active={isActive} step={step.step} />
                <div className="min-w-0">
                  <p className={`text-xs font-semibold truncate ${
                    isDone ? 'text-emerald-600' : isActive ? 'text-violet-700' : 'text-[var(--cx-text-muted)]'
                  }`}>
                    {step.nombre}
                  </p>
                  {step.manual && (
                    <span className="text-[9px] text-slate-400 uppercase tracking-wide">Manual</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Step content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Main card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            {currentStep === 0 && <StepPrerequisitos prerequisites={prerequisites} refreshPrereqs={refreshPrereqs} onReady={() => { handleCompleteStep(0) }} />}
            {currentStep === 1 && <StepPostulacion onComplete={() => handleCompleteStep(1)} />}
            {currentStep === 2 && <StepSetPrueba onComplete={() => { handleCompleteStep(2) }} refresh={refresh} prerequisites={prerequisites} />}
            {currentStep === 3 && <StepSimulacion />}
            {(currentStep === 4 || currentStep === 5) && <StepBridgeAsistido />}
            {currentStep === 6 && <StepDeclaracion onComplete={() => handleCompleteStep(6)} />}
          </div>

          {/* SII Status mini panel */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-4 text-xs flex-wrap">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${cert.cargado ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <span className="text-[var(--cx-text-secondary)]">Certificado</span>
                <span className={`font-semibold ${cert.cargado ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {cert.cargado ? 'OK' : 'No cargado'}
                </span>
              </div>
              <div className="w-px h-4 bg-slate-200" />
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${connectivity.conectado ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <span className="text-[var(--cx-text-secondary)]">SII</span>
                <span className={`font-semibold ${connectivity.conectado ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {connectivity.conectado ? 'Conectado' : 'Sin conexión'}
                </span>
              </div>
              <div className="w-px h-4 bg-slate-200" />
              <div className="flex items-center gap-2">
                <span className="text-[var(--cx-text-secondary)]">Ambiente</span>
                <span className="font-semibold text-amber-600">Certificación</span>
              </div>
              <a
                href="https://maullin.sii.cl/cvc_cgi/dte/pe_avance1"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1 text-violet-600 hover:text-violet-700"
              >
                <ExternalLink size={10} />
                Ver avance SII
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
