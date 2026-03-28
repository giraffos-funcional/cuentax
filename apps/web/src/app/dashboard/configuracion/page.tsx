/**
 * CUENTAX — Configuración SII
 * Mia: "Esta página es mission-critical. Es donde el usuario configura
 * su certificado digital y verifica la conexión al SII.
 * La UX debe hacer que una tarea técnica se sienta simple y segura.
 * Stepper visual, feedback inmediato, estado siempre visible."
 */

'use client'

import { useState, useRef } from 'react'
import {
  Shield, Upload, CheckCircle2, AlertTriangle, Wifi,
  WifiOff, RefreshCw, Eye, EyeOff, FileKey2, ChevronRight,
  Lock, Globe, Zap, Info, Loader2, Link2
} from 'lucide-react'
import { useCertificateList, useSIIStatus } from '@/hooks'

// ── Step Indicator ────────────────────────────────────────────
function StepIndicator({ step, current }: { step: number, current: number }) {
  const done = current > step
  const active = current === step
  return (
    <div className={`
      w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
      ring-2 transition-all duration-300
      ${done   ? 'bg-emerald-500 text-white ring-[var(--cx-status-ok-border)]' : ''}
      ${active ? 'bg-violet-500 text-white ring-[var(--cx-active-border)]' : ''}
      ${!done && !active ? 'bg-[var(--cx-bg-elevated)] text-[var(--cx-text-muted)] ring-[var(--cx-border-light)]' : ''}
    `}>
      {done ? <CheckCircle2 size={14} /> : step}
    </div>
  )
}

// ── SII Status Card ───────────────────────────────────────────
interface SIIStatusState {
  cert: 'none' | 'loaded' | 'error'
  connection: 'unknown' | 'ok' | 'error' | 'checking'
  tokenActive: boolean
  ambiente: 'certificacion' | 'produccion'
}

function SIIStatusPanel({ status, onCheckConnection }: {
  status: SIIStatusState,
  onCheckConnection: () => void
}) {
  const statusItems = [
    {
      label: 'Certificado Digital',
      value: status.cert === 'loaded' ? 'Cargado ✓' : status.cert === 'error' ? 'Error al cargar' : 'No configurado',
      icon: FileKey2,
      color: status.cert === 'loaded' ? 'text-emerald-700' : status.cert === 'error' ? 'text-red-600' : 'text-slate-600',
      bg: status.cert === 'loaded' ? 'bg-emerald-100' : status.cert === 'error' ? 'bg-red-100' : 'bg-slate-200',
    },
    {
      label: 'Conexión SII',
      value: status.connection === 'ok' ? 'Conectado' : status.connection === 'error' ? 'Sin conexión' : status.connection === 'checking' ? 'Verificando...' : 'No verificado',
      icon: status.connection === 'ok' ? Wifi : WifiOff,
      color: status.connection === 'ok' ? 'text-emerald-700' : status.connection === 'error' ? 'text-red-600' : 'text-slate-600',
      bg: status.connection === 'ok' ? 'bg-emerald-100' : status.connection === 'error' ? 'bg-red-100' : 'bg-slate-200',
    },
    {
      label: 'Ambiente',
      value: status.ambiente === 'produccion' ? '🔴 Producción' : '🟡 Certificación',
      icon: Globe,
      color: status.ambiente === 'produccion' ? 'text-red-700' : 'text-amber-700',
      bg: status.ambiente === 'produccion' ? 'bg-red-100' : 'bg-amber-100',
    },
    {
      label: 'Token SII',
      value: status.tokenActive ? 'Activo (2h)' : 'No generado',
      icon: Zap,
      color: status.tokenActive ? 'text-emerald-700' : 'text-slate-600',
      bg: status.tokenActive ? 'bg-emerald-100' : 'bg-slate-200',
    },
  ]

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-violet-100 rounded-xl">
            <Shield size={16} className="text-violet-600" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800">Estado del Sistema SII</h3>
        </div>
        <button
          onClick={onCheckConnection}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-violet-600 transition-colors"
        >
          <RefreshCw size={12} className={status.connection === 'checking' ? 'animate-spin' : ''} />
          Verificar
        </button>
      </div>

      <div className="space-y-2.5">
        {statusItems.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-100"
          >
            <div className={`p-1.5 rounded-lg shrink-0 ${item.bg}`}>
              <item.icon size={14} className={item.color} />
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">{item.label}</p>
              <p className={`text-xs font-semibold ${item.color}`}>{item.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Certificate Upload ────────────────────────────────────────
function CertificateUploader({ onSuccess }: { onSuccess: () => void }) {
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    if (!f.name.match(/\.(pfx|p12)$/i)) {
      setError('Solo se aceptan archivos .pfx o .p12')
      return
    }
    setFile(f)
    setError(null)
  }

  const handleSubmit = async () => {
    if (!file || !password) return
    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('password', password)

      const res = await fetch(`${process.env['NEXT_PUBLIC_BFF_URL']}/api/v1/sii/certificate/load`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail ?? 'Error cargando certificado')
      }

      onSuccess()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        onClick={() => inputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center
          border-2 border-dashed rounded-2xl p-8 cursor-pointer
          transition-all duration-200
          ${dragging
            ? 'border-violet-400 bg-[var(--cx-active-bg)]'
            : file
              ? 'border-[var(--cx-status-ok-border)] bg-[var(--cx-status-ok-bg)]'
              : 'border-[var(--cx-border-hover)] hover:border-[var(--cx-active-border)] hover:bg-[var(--cx-active-bg)] bg-[var(--cx-bg-elevated)]'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pfx,.p12"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />

        {file ? (
          <>
            <FileKey2 size={28} className="text-[var(--cx-status-ok-text)] mb-3" />
            <p className="text-sm font-semibold text-[var(--cx-status-ok-text)]">{file.name}</p>
            <p className="text-xs text-[var(--cx-text-secondary)] mt-1">{(file.size / 1024).toFixed(1)} KB — Haz clic para cambiar</p>
          </>
        ) : (
          <>
            <Upload size={24} className="text-[var(--cx-text-secondary)] mb-3" />
            <p className="text-sm font-medium text-[var(--cx-text-primary)]">Arrastra tu certificado aquí</p>
            <p className="text-xs text-[var(--cx-text-muted)] mt-1">Archivos .pfx o .p12</p>
          </>
        )}
      </div>

      {/* Password */}
      <div>
        <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-2">
          Contraseña del certificado
        </label>
        <div className="relative">
          <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" />
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña PFX..."
            className="input-field pl-9 pr-9"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-secondary)] hover:text-[var(--cx-text-primary)] transition-colors"
          >
            {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
        <div className="flex items-center gap-1.5 mt-2 text-[11px] text-[var(--cx-text-muted)]">
          <Info size={10} />
          El certificado se carga en memoria del servidor. No se almacena en disco.
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          <AlertTriangle size={13} />
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!file || !password || loading}
        className="btn-primary w-full justify-center"
      >
        {loading ? (
          <><Loader2 size={14} className="animate-spin" /> Cargando certificado...</>
        ) : (
          <><Shield size={14} /> Cargar Certificado</>
        )}
      </button>
    </div>
  )
}

// ── Certificate Step (multi-company aware) ───────────────────
function CertificateStep({ onSuccess }: { onSuccess: () => void }) {
  const { certificates, isLoading: listLoading, associateCertificate } = useCertificateList()
  const { cert, mutateCert } = useSIIStatus()
  const [associating, setAssociating] = useState(false)
  const [associateError, setAssociateError] = useState<string | null>(null)
  const [showUploadForm, setShowUploadForm] = useState(false)

  // If cert is already associated with this company, skip to success
  const certAlreadyAssociated = cert.cargado

  // Find a loaded cert that is NOT yet associated with the current company
  const availableCert = certificates.length > 0 && !certAlreadyAssociated
    ? certificates[0]
    : null

  const handleAssociate = async () => {
    setAssociating(true)
    setAssociateError(null)
    try {
      await associateCertificate()
      if (mutateCert) mutateCert()
      onSuccess()
    } catch (e: unknown) {
      setAssociateError(e instanceof Error ? e.message : 'Error asociando certificado')
    } finally {
      setAssociating(false)
    }
  }

  if (listLoading) {
    return (
      <div className="animate-fade-in space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">Certificado Digital PFX</h3>
        <div className="flex items-center justify-center py-8 text-slate-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          <span className="text-sm">Verificando certificados...</span>
        </div>
      </div>
    )
  }

  // If cert is already loaded and associated with this company
  if (certAlreadyAssociated) {
    return (
      <div className="animate-fade-in space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">Certificado Digital PFX</h3>
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 flex items-center gap-3">
          <CheckCircle2 size={16} />
          <div>
            <p className="font-semibold">Certificado cargado</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              Vence: {cert.vence ?? 'N/A'}
              {cert.diasParaVencer != null && ` (${cert.diasParaVencer} dias restantes)`}
            </p>
          </div>
        </div>
        <button onClick={onSuccess} className="btn-primary w-full justify-center">
          Continuar <ChevronRight size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-4">
      <h3 className="text-sm font-semibold text-slate-800">Certificado Digital PFX</h3>

      {/* Existing cert available for association */}
      {availableCert && !showUploadForm && (
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-violet-50 border border-violet-200">
            <div className="flex items-center gap-2 mb-2">
              <FileKey2 size={14} className="text-violet-600" />
              <p className="text-sm font-semibold text-violet-800">Certificado disponible</p>
            </div>
            <p className="text-xs text-violet-700">
              Certificado de <span className="font-bold">{availableCert.nombre_titular}</span> ({availableCert.rut_titular}) ya esta cargado.
              Puedes usarlo para esta empresa.
            </p>
            <p className="text-[10px] text-violet-500 mt-1">
              Vence: {availableCert.vence} ({availableCert.dias_para_vencer} dias restantes)
            </p>
          </div>

          {associateError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              <AlertTriangle size={13} />
              {associateError}
            </div>
          )}

          <button
            onClick={handleAssociate}
            disabled={associating}
            className="btn-primary w-full justify-center"
          >
            {associating ? (
              <><Loader2 size={14} className="animate-spin" /> Asociando certificado...</>
            ) : (
              <><Link2 size={14} /> Usar este certificado</>
            )}
          </button>

          <div className="relative flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[10px] text-slate-400 uppercase tracking-wide">O cargar un nuevo certificado</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <button
            onClick={() => setShowUploadForm(true)}
            className="w-full text-xs text-slate-500 hover:text-violet-600 transition-colors py-2 flex items-center justify-center gap-1.5"
          >
            <Upload size={12} />
            Cargar nuevo certificado .pfx
          </button>
        </div>
      )}

      {/* Upload form: shown when no cert available OR user clicked "cargar nuevo" */}
      {(!availableCert || showUploadForm) && (
        <CertificateUploader onSuccess={() => {
          onSuccess()
        }} />
      )}
    </div>
  )
}

// ── Page Principal ────────────────────────────────────────────
export default function ConfiguracionSIIPage() {
  const [currentStep, setCurrentStep] = useState(1)
  const [siiStatus, setSiiStatus] = useState<SIIStatusState>({
    cert: 'none',
    connection: 'unknown',
    tokenActive: false,
    ambiente: 'certificacion',
  })

  const checkConnection = async () => {
    setSiiStatus(prev => ({ ...prev, connection: 'checking' }))
    await new Promise(r => setTimeout(r, 1500)) // Simulate API call
    setSiiStatus(prev => ({ ...prev, connection: 'ok' }))
  }

  const STEPS = [
    { n: 1, title: 'Datos de Empresa',    desc: 'RUT y razón social' },
    { n: 2, title: 'Certificado Digital', desc: 'Archivo .pfx / .p12' },
    { n: 3, title: 'Verificar Conexión',  desc: 'Test con el SII' },
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800">Configuración SII</h1>
        <p className="text-sm text-slate-500 mt-1">
          Configura tu conexión directa al Servicio de Impuestos Internos de Chile
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((step, i) => (
          <div key={step.n} className="flex items-center gap-2">
            <button
              onClick={() => step.n <= currentStep && setCurrentStep(step.n)}
              className="flex items-center gap-2.5 group"
            >
              <StepIndicator step={step.n} current={currentStep} />
              <div className="hidden sm:block text-left">
                <p className={`text-xs font-semibold ${currentStep === step.n ? 'text-slate-800' : currentStep > step.n ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {step.title}
                </p>
                <p className="text-[10px] text-slate-400">{step.desc}</p>
              </div>
            </button>
            {i < STEPS.length - 1 && (
              <ChevronRight size={14} className="text-slate-300 mx-1 shrink-0" />
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form Column */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          {currentStep === 1 && (
            <div className="space-y-5 animate-fade-in">
              <h3 className="text-sm font-semibold text-slate-800">Datos de la Empresa</h3>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">RUT Empresa</label>
                <input type="text" placeholder="12.345.678-9" className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Razón Social</label>
                <input type="text" placeholder="Mi Empresa SpA" className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Giro Comercial</label>
                <input type="text" placeholder="Servicios de Software" className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Ambiente SII</label>
                <div className="grid grid-cols-2 gap-3">
                  {['certificacion', 'produccion'].map((amb) => (
                    <button
                      key={amb}
                      onClick={() => setSiiStatus(prev => ({ ...prev, ambiente: amb as any }))}
                      className={`
                        p-3 rounded-xl border text-xs font-medium text-left transition-all
                        ${siiStatus.ambiente === amb
                          ? 'border-violet-400 bg-violet-50 text-violet-700'
                          : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-600'
                        }
                      `}
                    >
                      <div className="font-bold mb-0.5 capitalize">{amb}</div>
                      <div className="text-slate-400 text-[10px]">
                        {amb === 'certificacion' ? 'maullin.sii.cl' : 'palena.sii.cl'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => setCurrentStep(2)} className="btn-primary w-full justify-center">
                Continuar <ChevronRight size={14} />
              </button>
            </div>
          )}

          {currentStep === 2 && (
            <CertificateStep
              onSuccess={() => {
                setSiiStatus(prev => ({ ...prev, cert: 'loaded' }))
                setCurrentStep(3)
              }}
            />
          )}

          {currentStep === 3 && (
            <div className="animate-fade-in space-y-5">
              <h3 className="text-sm font-semibold text-slate-800">Verificar Conexión</h3>
              <p className="text-xs text-slate-500">
                Verifica que CUENTAX puede comunicarse con el SII y obtener un token de sesión
                usando tu certificado digital.
              </p>
              <button onClick={checkConnection} className="btn-primary w-full justify-center">
                {siiStatus.connection === 'checking' ? (
                  <><Loader2 size={14} className="animate-spin" /> Conectando con el SII...</>
                ) : (
                  <><Wifi size={14} /> Verificar Conexión SII</>
                )}
              </button>
              {siiStatus.connection === 'ok' && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 flex items-center gap-3 animate-fade-in">
                  <CheckCircle2 size={16} />
                  <div>
                    <p className="font-semibold">¡Conexión exitosa!</p>
                    <p className="text-xs text-emerald-600 mt-0.5">Token SII generado. Ya puedes emitir DTEs.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status Panel */}
        <div className="lg:col-span-2">
          <SIIStatusPanel status={siiStatus} onCheckConnection={checkConnection} />
        </div>
      </div>
    </div>
  )
}
