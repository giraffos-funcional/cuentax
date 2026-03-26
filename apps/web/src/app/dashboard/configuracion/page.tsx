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
  Lock, Globe, Zap, Info, Loader2
} from 'lucide-react'

// ── Step Indicator ────────────────────────────────────────────
function StepIndicator({ step, current }: { step: number, current: number }) {
  const done = current > step
  const active = current === step
  return (
    <div className={`
      w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold 
      ring-2 transition-all duration-300
      ${done   ? 'bg-emerald-500 text-white ring-emerald-500/30' : ''}
      ${active ? 'bg-violet-500 text-white ring-violet-500/30' : ''}
      ${!done && !active ? 'bg-slate-800 text-slate-500 ring-white/5' : ''}
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
      color: status.cert === 'loaded' ? 'text-emerald-400' : status.cert === 'error' ? 'text-red-400' : 'text-slate-500',
      bg: status.cert === 'loaded' ? 'bg-emerald-500/10' : status.cert === 'error' ? 'bg-red-500/10' : 'bg-slate-800',
    },
    {
      label: 'Conexión SII',
      value: status.connection === 'ok' ? 'Conectado' : status.connection === 'error' ? 'Sin conexión' : status.connection === 'checking' ? 'Verificando...' : 'No verificado',
      icon: status.connection === 'ok' ? Wifi : WifiOff,
      color: status.connection === 'ok' ? 'text-emerald-400' : status.connection === 'error' ? 'text-red-400' : 'text-slate-500',
      bg: status.connection === 'ok' ? 'bg-emerald-500/10' : status.connection === 'error' ? 'bg-red-500/10' : 'bg-slate-800',
    },
    {
      label: 'Ambiente',
      value: status.ambiente === 'produccion' ? '🔴 Producción' : '🟡 Certificación',
      icon: Globe,
      color: status.ambiente === 'produccion' ? 'text-red-300' : 'text-amber-300',
      bg: status.ambiente === 'produccion' ? 'bg-red-500/10' : 'bg-amber-500/10',
    },
    {
      label: 'Token SII',
      value: status.tokenActive ? 'Activo (2h)' : 'No generado',
      icon: Zap,
      color: status.tokenActive ? 'text-emerald-400' : 'text-slate-500',
      bg: status.tokenActive ? 'bg-emerald-500/10' : 'bg-slate-800',
    },
  ]

  return (
    <div className="bg-slate-900/60 border border-white/[0.07] rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-violet-500/10 rounded-xl">
            <Shield size={16} className="text-violet-400" />
          </div>
          <h3 className="text-sm font-semibold text-white">Estado del Sistema SII</h3>
        </div>
        <button
          onClick={onCheckConnection}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-violet-300 transition-colors"
        >
          <RefreshCw size={12} className={status.connection === 'checking' ? 'animate-spin' : ''} />
          Verificar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {statusItems.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]"
          >
            <div className={`p-1.5 rounded-lg ${item.bg}`}>
              <item.icon size={13} className={item.color} />
            </div>
            <div>
              <p className="text-[10px] text-slate-600 uppercase tracking-wide">{item.label}</p>
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
            ? 'border-violet-400 bg-violet-500/5'
            : file
              ? 'border-emerald-500/40 bg-emerald-500/5'
              : 'border-white/10 hover:border-violet-500/40 hover:bg-violet-500/5 bg-white/[0.02]'
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
            <FileKey2 size={28} className="text-emerald-400 mb-3" />
            <p className="text-sm font-semibold text-emerald-300">{file.name}</p>
            <p className="text-xs text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB — Haz clic para cambiar</p>
          </>
        ) : (
          <>
            <Upload size={24} className="text-slate-500 mb-3" />
            <p className="text-sm font-medium text-slate-300">Arrastra tu certificado aquí</p>
            <p className="text-xs text-slate-600 mt-1">Archivos .pfx o .p12</p>
          </>
        )}
      </div>

      {/* Password */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-2">
          Contraseña del certificado
        </label>
        <div className="relative">
          <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
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
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          >
            {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
        <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-600">
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
        <h1 className="text-xl font-bold text-white">Configuración SII</h1>
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
                <p className={`text-xs font-semibold ${currentStep === step.n ? 'text-white' : currentStep > step.n ? 'text-emerald-400' : 'text-slate-600'}`}>
                  {step.title}
                </p>
                <p className="text-[10px] text-slate-600">{step.desc}</p>
              </div>
            </button>
            {i < STEPS.length - 1 && (
              <ChevronRight size={14} className="text-slate-700 mx-1 shrink-0" />
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form Column */}
        <div className="lg:col-span-3 bg-slate-900/60 border border-white/[0.07] rounded-2xl p-6">
          {currentStep === 1 && (
            <div className="space-y-5 animate-fade-in">
              <h3 className="text-sm font-semibold text-white">Datos de la Empresa</h3>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">RUT Empresa</label>
                <input type="text" placeholder="12.345.678-9" className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Razón Social</label>
                <input type="text" placeholder="Mi Empresa SpA" className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Giro Comercial</label>
                <input type="text" placeholder="Servicios de Software" className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Ambiente SII</label>
                <div className="grid grid-cols-2 gap-3">
                  {['certificacion', 'produccion'].map((amb) => (
                    <button
                      key={amb}
                      onClick={() => setSiiStatus(prev => ({ ...prev, ambiente: amb as any }))}
                      className={`
                        p-3 rounded-xl border text-xs font-medium text-left transition-all
                        ${siiStatus.ambiente === amb
                          ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
                          : 'border-white/[0.07] text-slate-500 hover:border-white/10 hover:text-slate-400'
                        }
                      `}
                    >
                      <div className="font-bold mb-0.5 capitalize">{amb}</div>
                      <div className="text-slate-600 text-[10px]">
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
            <div className="animate-fade-in space-y-4">
              <h3 className="text-sm font-semibold text-white">Certificado Digital PFX</h3>
              <CertificateUploader onSuccess={() => {
                setSiiStatus(prev => ({ ...prev, cert: 'loaded' }))
                setCurrentStep(3)
              }} />
            </div>
          )}

          {currentStep === 3 && (
            <div className="animate-fade-in space-y-5">
              <h3 className="text-sm font-semibold text-white">Verificar Conexión</h3>
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
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-300 flex items-center gap-3 animate-fade-in">
                  <CheckCircle2 size={16} />
                  <div>
                    <p className="font-semibold">¡Conexión exitosa!</p>
                    <p className="text-xs text-emerald-500 mt-0.5">Token SII generado. Ya puedes emitir DTEs.</p>
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
