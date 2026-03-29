/**
 * CUENTAX — Asistente de Certificación SII
 * Wizard de 6 pasos para certificar empresa ante el SII.
 */

'use client'

import { useState, useRef } from 'react'
import {
  ShieldCheck, CheckCircle2, Circle, ChevronRight, Upload,
  ExternalLink, Loader2, AlertTriangle, FileText, Send,
  RefreshCw, Download, RotateCcw, Wifi, Play, Info
} from 'lucide-react'
import {
  useCertificationWizard,
  useCertificationStatus,
  useCompleteStep,
  useUploadTestSet,
  useProcessTestSet,
  useResetCertification,
  useSIIStatus,
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
      {done ? <CheckCircle2 size={16} /> : step}
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

// ── Step 2: Set de Prueba ─────────────────────────────────────
function StepSetPrueba({ onComplete, refresh }: { onComplete: () => void; refresh: () => void }) {
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
      const result = await upload(file)
      setUploadResult(result)
    } catch (e: any) {
      setError(e.response?.data?.message ?? e.message ?? 'Error al cargar')
    } finally {
      setUploading(false)
    }
  }

  const handleProcess = async () => {
    setProcessing(true)
    setError(null)
    try {
      const result = await process()
      setProcessResult(result)
      if (result.success) {
        refresh()
      }
    } catch (e: any) {
      setError(e.response?.data?.message ?? e.message ?? 'Error al procesar')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <h3 className="text-base font-bold text-[var(--cx-text-primary)]">Set de Prueba</h3>
      <p className="text-sm text-[var(--cx-text-secondary)]">
        Descarga el set de pruebas desde el SII, sube el archivo aquí, y CUENTAX
        generará y enviará todos los DTEs automáticamente.
      </p>

      <a
        href="https://maullin.sii.cl/cvc_cgi/dte/pe_generar"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-violet-700 hover:bg-violet-50 transition-colors"
      >
        <Download size={14} />
        Descargar Set de Prueba del SII
        <span className="ml-auto text-[10px] text-slate-400">maullin.sii.cl</span>
      </a>

      {/* File Upload */}
      <div
        onClick={() => inputRef.current?.click()}
        className={`
          flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-6 cursor-pointer transition-all
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
          onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setUploadResult(null); setProcessResult(null) } }}
        />
        {file ? (
          <>
            <FileText size={24} className="text-emerald-600 mb-2" />
            <p className="text-sm font-semibold text-emerald-700">{file.name}</p>
            <p className="text-xs text-emerald-600 mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
          </>
        ) : (
          <>
            <Upload size={24} className="text-[var(--cx-text-muted)] mb-2" />
            <p className="text-sm font-medium text-[var(--cx-text-primary)]">Sube el archivo del set de pruebas</p>
            <p className="text-xs text-[var(--cx-text-muted)] mt-0.5">Archivo .txt del SII</p>
          </>
        )}
      </div>

      {/* Upload Button */}
      {file && !uploadResult && (
        <button onClick={handleUpload} disabled={uploading} className="btn-primary w-full justify-center">
          {uploading ? <><Loader2 size={14} className="animate-spin" /> Cargando...</> : <><Upload size={14} /> Cargar y Analizar</>}
        </button>
      )}

      {/* Upload Result */}
      {uploadResult && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600" />
            <p className="text-sm font-semibold text-emerald-700">
              {uploadResult.total_cases} casos encontrados
            </p>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {uploadResult.cases?.map((c: any) => (
              <div key={c.caso} className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-100/50 px-3 py-1.5 rounded-lg">
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
        <button onClick={handleProcess} disabled={processing} className="btn-primary w-full justify-center">
          {processing ? (
            <><Loader2 size={14} className="animate-spin" /> Generando y Enviando al SII...</>
          ) : (
            <><Send size={14} /> Generar DTEs y Enviar al SII</>
          )}
        </button>
      )}

      {/* Process Result */}
      {processResult && (
        <div className={`p-4 rounded-xl border space-y-2 ${
          processResult.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center gap-2">
            {processResult.success
              ? <CheckCircle2 size={16} className="text-emerald-600" />
              : <AlertTriangle size={16} className="text-red-600" />
            }
            <p className={`text-sm font-semibold ${processResult.success ? 'text-emerald-700' : 'text-red-700'}`}>
              {processResult.emitidos}/{processResult.total} DTEs enviados
              {processResult.track_id && <span className="font-mono ml-2">Track: {processResult.track_id}</span>}
            </p>
          </div>
          {processResult.errores?.length > 0 && (
            <div className="text-xs text-red-600 space-y-1">
              {processResult.errores.map((e: any, i: number) => (
                <p key={i}>Caso {e.caso}: {e.error}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600">
          <AlertTriangle size={13} />
          {error}
        </div>
      )}

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
  const { cert, connectivity } = useSIIStatus()
  const { complete } = useCompleteStep()
  const { reset } = useResetCertification()
  const [resetting, setResetting] = useState(false)
  const [localStep, setLocalStep] = useState(1)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)

  // Use API data when available, otherwise local state
  const apiSteps = wizard?.steps
  const steps = apiSteps ?? DEFAULT_STEPS.map(s => ({
    ...s,
    completado: completedSteps.has(s.step),
    actual: s.step === localStep,
  }))
  const currentStep = wizard?.current_step ?? localStep

  const handleCompleteStep = async (step: number) => {
    setActionError(null)
    // Always advance locally
    const newCompleted = new Set(completedSteps)
    newCompleted.add(step)
    setCompletedSteps(newCompleted)
    // Advance to next incomplete step
    for (let i = 1; i <= 6; i++) {
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
            {currentStep === 1 && <StepPostulacion onComplete={() => handleCompleteStep(1)} />}
            {currentStep === 2 && <StepSetPrueba onComplete={() => { handleCompleteStep(2) }} refresh={refresh} />}
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
