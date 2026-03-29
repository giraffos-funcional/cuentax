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
  useCertificationStatus,
  useCertificationPrerequisites,
  useCompleteStep,
  useUploadTestSet,
  useProcessTestSet,
  useResetCertification,
  useSIIStatus,
  useCAFStatus,
} from '@/hooks'
import { useAuthStore } from '@/stores/auth.store'

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

      <div className="space-y-2">
        <PrerequisiteItem
          ok={certOk}
          label="Certificado Digital"
          detail={certOk
            ? 'Certificado cargado y listo para firmar'
            : 'Debes cargar tu certificado digital (.pfx) para firmar los DTEs'
          }
          action={{ href: '/dashboard/configuracion', text: 'Configurar' }}
        />

        <PrerequisiteItem
          ok={cafFactura || cafBoleta}
          label="Folios (CAF) — Certificación"
          detail={
            loadedTypes.length > 0
              ? `Cargados: ${loadedTypes.join(', ')}${missingTypes.length > 0 ? ` · Faltan: ${missingTypes.join(', ')}` : ''}`
              : 'Carga los CAFs del ambiente de certificación (maullin.sii.cl)'
          }
        />

        {cafFactura && (
          <div className="ml-8 flex items-center gap-2 text-xs">
            <CheckCircle2 size={12} className="text-emerald-500" />
            <span className="text-emerald-600 font-medium">Set Factura: listo (tipos 33 + 61)</span>
          </div>
        )}
        {cafBoleta && (
          <div className="ml-8 flex items-center gap-2 text-xs">
            <CheckCircle2 size={12} className="text-emerald-500" />
            <span className="text-emerald-600 font-medium">Set Boleta: listo (tipo 39)</span>
          </div>
        )}

        {missingTypes.length > 0 && (
          <div className="ml-8">
            <label className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              cafUploading
                ? 'bg-[var(--cx-bg-elevated)] text-[var(--cx-text-muted)]'
                : 'bg-violet-100 text-violet-700 hover:bg-violet-200'
            }`}>
              {cafUploading ? (
                <><Loader2 size={12} className="animate-spin" /> Subiendo...</>
              ) : (
                <><Upload size={12} /> Subir CAF de certificación (.xml)</>
              )}
              <input type="file" accept=".xml" className="hidden" onChange={handleCAFUpload} disabled={cafUploading} />
            </label>
          </div>
        )}

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
function StepPostulacion({ onComplete }: { onComplete: () => void }) {
  const [confirmed, setConfirmed] = useState(false)

  return (
    <div className="space-y-4 animate-fade-in">
      <h3 className="text-base font-bold text-[var(--cx-text-primary)]">Postulación al Ambiente de Certificación</h3>
      <p className="text-sm text-[var(--cx-text-secondary)]">
        El representante legal debe registrar la empresa en el portal del SII
        con su certificado digital personal.
      </p>

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

      <a
        href="https://maullin.sii.cl/cvc/dte/pe_condiciones.html"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-violet-700 hover:bg-violet-50 transition-colors"
      >
        <ExternalLink size={14} />
        Ir al Portal de Postulación SII
        <span className="ml-auto text-[10px] text-slate-400">maullin.sii.cl</span>
      </a>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
        />
        <span className="text-sm text-[var(--cx-text-secondary)]">
          Ya completé la postulación en el portal del SII
        </span>
      </label>

      <button
        onClick={onComplete}
        disabled={!confirmed}
        className="btn-primary w-full justify-center"
      >
        Marcar como completado <ChevronRight size={14} />
      </button>
    </div>
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
      if (result.success) refresh()
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
        <div className={`p-3 rounded-lg border space-y-1 ${
          processResult.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center gap-2">
            {processResult.success
              ? <CheckCircle2 size={14} className="text-emerald-600" />
              : <AlertTriangle size={14} className="text-red-600" />
            }
            <p className={`text-xs font-semibold ${processResult.success ? 'text-emerald-700' : 'text-red-700'}`}>
              {processResult.total != null
                ? <>{processResult.emitidos ?? 0}/{processResult.total} DTEs enviados</>
                : processResult.mensaje ?? 'Error al procesar'
              }
              {processResult.track_id && <span className="font-mono ml-1">Track: {processResult.track_id}</span>}
            </p>
          </div>
          {processResult.mensaje && !processResult.success && processResult.total != null && (
            <p className="text-[10px] text-red-600 font-medium">{processResult.mensaje}</p>
          )}
          {processResult.errores?.length > 0 && (
            <div className="text-[10px] text-red-600 space-y-0.5 max-h-40 overflow-y-auto">
              {processResult.errores.map((e: any, i: number) => (
                <p key={i} className="bg-red-100/50 px-2 py-0.5 rounded">
                  <span className="font-bold">Caso {e.caso} (Tipo {e.tipo_dte}):</span> {e.error}
                </p>
              ))}
            </div>
          )}
        </div>
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
function StepSimulacion() {
  return (
    <div className="space-y-4 animate-fade-in">
      <h3 className="text-base font-bold text-[var(--cx-text-primary)]">Simulación</h3>
      <p className="text-sm text-[var(--cx-text-secondary)]">
        Envía documentos representativos de tu operación real al SII.
        Puedes usar la sección <strong>Emitir DTE</strong> para esto.
      </p>
      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
        <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-700">
          <p className="font-semibold mb-1">Requisito:</p>
          <p>Emite al menos una Factura (33), una Nota de Crédito (61) y una Nota de Débito (56)
          con datos representativos de tu negocio.</p>
        </div>
      </div>
      <a
        href="https://maullin.sii.cl/cvc_cgi/dte/pe_avance1"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-violet-700 hover:bg-violet-50 transition-colors"
      >
        <ExternalLink size={14} />
        Verificar avance en el SII
      </a>
    </div>
  )
}

// ── Step 4: Intercambio ───────────────────────────────────────
function StepIntercambio() {
  return (
    <div className="space-y-4 animate-fade-in">
      <h3 className="text-base font-bold text-[var(--cx-text-primary)]">Intercambio de Información</h3>
      <p className="text-sm text-[var(--cx-text-secondary)]">
        El SII enviará DTEs de prueba a tu empresa. Debes recibirlos y responder
        con acuse de recibo y aceptación comercial.
      </p>
      <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-start gap-3">
        <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-700">
          <p className="font-semibold mb-1">Flujo:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Recibir EnvioDTE del SII</li>
            <li>Generar RecepcionDTE (acuse de recibo)</li>
            <li>Generar ResultadoDTE (aceptación comercial)</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

// ── Step 5: Muestras de Impresión ─────────────────────────────
function StepMuestras() {
  return (
    <div className="space-y-4 animate-fade-in">
      <h3 className="text-base font-bold text-[var(--cx-text-primary)]">Muestras de Impresión</h3>
      <p className="text-sm text-[var(--cx-text-secondary)]">
        Genera PDFs de hasta 20 documentos emitidos. Cada PDF incluye el timbre
        electrónico PDF417 según la norma del SII.
      </p>
      <div className="p-4 rounded-xl bg-violet-50 border border-violet-200 flex items-start gap-3">
        <Info size={16} className="text-violet-600 shrink-0 mt-0.5" />
        <div className="text-xs text-violet-700">
          <p>Los PDFs se generan automáticamente al emitir DTEs.
          Descárgalos desde la sección <strong>Documentos Emitidos</strong>.</p>
        </div>
      </div>
    </div>
  )
}

// ── Step 6: Declaración (manual) ──────────────────────────────
function StepDeclaracion({ onComplete }: { onComplete: () => void }) {
  const [confirmed, setConfirmed] = useState(false)

  return (
    <div className="space-y-4 animate-fade-in">
      <h3 className="text-base font-bold text-[var(--cx-text-primary)]">Declaración de Cumplimiento</h3>
      <p className="text-sm text-[var(--cx-text-secondary)]">
        Firma la declaración de cumplimiento en el portal del SII para obtener
        la resolución que autoriza a tu empresa a emitir DTEs en producción.
      </p>

      <a
        href="https://maullin.sii.cl/cvc_cgi/dte/pe_avance7"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-violet-700 hover:bg-violet-50 transition-colors"
      >
        <ExternalLink size={14} />
        Ir a Declaración de Cumplimiento
        <span className="ml-auto text-[10px] text-slate-400">maullin.sii.cl</span>
      </a>

      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
        <p className="text-sm font-semibold text-emerald-700 mb-2">Al completar este paso:</p>
        <ul className="text-xs text-emerald-600 space-y-1 list-disc list-inside">
          <li>El SII emitirá una Resolución de Autorización</li>
          <li>Tu empresa podrá emitir DTEs en ambiente de <strong>Producción</strong></li>
          <li>Deberás cambiar el ambiente de CUENTAX a Producción</li>
        </ul>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
        />
        <span className="text-sm text-[var(--cx-text-secondary)]">
          Ya completé la declaración y obtuve la resolución del SII
        </span>
      </label>

      <button
        onClick={onComplete}
        disabled={!confirmed}
        className="btn-primary w-full justify-center"
      >
        Finalizar Certificación <CheckCircle2 size={14} />
      </button>
    </div>
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
  const { status } = useCertificationStatus()
  const { prerequisites, refresh: refreshPrereqs } = useCertificationPrerequisites()
  const { cert, connectivity } = useSIIStatus()
  const { complete } = useCompleteStep()
  const { reset } = useResetCertification()
  const [resetting, setResetting] = useState(false)
  const [localStep, setLocalStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)

  // Sync initial state from API on first load
  useEffect(() => {
    if (wizard?.current_step && wizard.current_step > localStep) {
      setLocalStep(wizard.current_step)
    }
    if (wizard?.steps) {
      const apiCompleted = new Set(completedSteps)
      for (const s of wizard.steps) {
        if (s.completado) apiCompleted.add(s.step)
      }
      if (apiCompleted.size > completedSteps.size) {
        setCompletedSteps(apiCompleted)
      }
    }
  }, [wizard]) // eslint-disable-line react-hooks/exhaustive-deps

  // Local state drives the UI; API syncs in background
  const currentStep = localStep
  const mergedCompleted = new Set(completedSteps)
  // Merge API completed steps into local state
  if (wizard?.steps) {
    for (const s of wizard.steps) {
      if (s.completado) mergedCompleted.add(s.step)
    }
  }
  const steps = DEFAULT_STEPS.map(s => ({
    ...s,
    completado: mergedCompleted.has(s.step),
    actual: s.step === currentStep,
  }))

  const handleCompleteStep = async (step: number) => {
    setActionError(null)
    // Always advance locally
    const newCompleted = new Set(completedSteps)
    newCompleted.add(step)
    setCompletedSteps(newCompleted)
    // Advance to next incomplete step
    for (let i = 0; i <= 6; i++) {
      if (!newCompleted.has(i)) {
        setLocalStep(i)
        break
      }
    }

    // Try syncing with API (non-blocking)
    try {
      await complete(step)
      refresh()
    } catch (e: any) {
      // API sync failed but local state already advanced — show subtle warning
      console.warn('API sync failed, using local state:', e)
    }
  }

  const handleGoToStep = (step: number) => {
    setLocalStep(step)
    setActionError(null)
  }

  const handleReset = async () => {
    if (!confirm('Esto reiniciará todo el progreso de certificación. Continuar?')) return
    setResetting(true)
    setCompletedSteps(new Set())
    setLocalStep(1)
    try {
      await reset()
      refresh()
    } catch {
      // Local state already reset
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
            {currentStep === 4 && <StepIntercambio />}
            {currentStep === 5 && <StepMuestras />}
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
