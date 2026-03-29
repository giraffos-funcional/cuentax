/**
 * CUENTAX — Configuración SII
 * Mia: "Esta página es mission-critical. Es donde el usuario configura
 * su certificado digital y verifica la conexión al SII.
 * La UX debe hacer que una tarea técnica se sienta simple y segura.
 * Stepper visual, feedback inmediato, estado siempre visible."
 */

'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Shield, Upload, CheckCircle2, AlertTriangle, Wifi,
  WifiOff, RefreshCw, Eye, EyeOff, FileKey2, ChevronRight,
  Lock, Globe, Zap, Info, Loader2, Link2, Building2
} from 'lucide-react'
import { useSIIStatus } from '@/hooks'
import { CertificateStep } from '@/components/sii/CertificateUpload'
import { useAuthStore } from '@/stores/auth.store'
import { apiClient } from '@/lib/api-client'

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

// ── Page Principal ────────────────────────────────────────────
export default function ConfiguracionSIIPage() {
  const user = useAuthStore(s => s.user)
  const hasCompanyData = !!(user?.company_name && user?.company_rut)

  // If company data exists, start at step 2 (certificate); otherwise step 1
  const [currentStep, setCurrentStep] = useState(hasCompanyData ? 2 : 1)
  const [siiStatus, setSiiStatus] = useState<SIIStatusState>({
    cert: 'none',
    connection: 'unknown',
    tokenActive: false,
    ambiente: 'certificacion',
  })

  // Auto-advance past step 1 when company data becomes available
  useEffect(() => {
    if (hasCompanyData && currentStep === 1) {
      setCurrentStep(2)
    }
  }, [hasCompanyData])

  // Fix 2: Connect checkConnection to real API
  const checkConnection = async () => {
    setSiiStatus(prev => ({ ...prev, connection: 'checking' }))
    try {
      const { data } = await apiClient.get('/api/v1/sii/connectivity')
      setSiiStatus(prev => ({
        ...prev,
        connection: data.conectado ? 'ok' : 'error',
        tokenActive: data.token_vigente ?? false,
        ambiente: data.ambiente ?? prev.ambiente,
      }))
    } catch {
      setSiiStatus(prev => ({ ...prev, connection: 'error' }))
    }
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
        <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Configuración SII</h1>
        <p className="text-sm text-[var(--cx-text-secondary)] mt-1">
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
                <p className={`text-xs font-semibold ${currentStep === step.n ? 'text-[var(--cx-text-primary)]' : currentStep > step.n ? 'text-[var(--cx-status-ok-text)]' : 'text-[var(--cx-text-muted)]'}`}>
                  {step.title}
                </p>
                <p className="text-[10px] text-[var(--cx-text-muted)]">{step.desc}</p>
              </div>
            </button>
            {i < STEPS.length - 1 && (
              <ChevronRight size={14} className="text-[var(--cx-text-muted)] mx-1 shrink-0" />
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form Column */}
        <div className="lg:col-span-3 bg-[var(--cx-bg-surface)] border border-[var(--cx-border-light)] rounded-2xl p-6 shadow-sm">
          {/* Step 1: Read-only company info header */}
          {currentStep === 1 && (
            <div className="space-y-5 animate-fade-in">
              <h3 className="text-sm font-semibold text-[var(--cx-text-primary)]">Datos de la Empresa</h3>

              {hasCompanyData ? (
                <>
                  <div className="p-4 rounded-xl bg-[var(--cx-status-ok-bg)] border border-[var(--cx-status-ok-border)] flex items-center gap-3">
                    <Building2 size={16} className="text-[var(--cx-status-ok-text)] shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-[var(--cx-status-ok-text)]">{user?.company_name}</p>
                      <p className="text-xs text-[var(--cx-status-ok-text)] opacity-80 font-mono mt-0.5">RUT: {user?.company_rut}</p>
                    </div>
                  </div>
                  <button onClick={() => setCurrentStep(2)} className="btn-primary w-full justify-center">
                    Continuar <ChevronRight size={14} />
                  </button>
                </>
              ) : (
                <div className="p-4 rounded-xl bg-[var(--cx-status-warn-bg)] border border-[var(--cx-status-warn-border)]">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={14} className="text-[var(--cx-status-warn-text)]" />
                    <p className="text-sm font-semibold text-[var(--cx-status-warn-text)]">Datos de empresa incompletos</p>
                  </div>
                  <p className="text-xs text-[var(--cx-status-warn-text)] opacity-80">
                    Completa los datos de tu empresa en Mi Empresa antes de configurar el SII.
                  </p>
                  <a
                    href="/dashboard/empresa"
                    className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-xl bg-[var(--cx-status-warn-text)] text-white text-xs font-bold hover:opacity-90 transition-opacity"
                  >
                    Ir a Mi Empresa <ChevronRight size={12} />
                  </a>
                </div>
              )}
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
              <h3 className="text-sm font-semibold text-[var(--cx-text-primary)]">Verificar Conexión</h3>
              <p className="text-xs text-[var(--cx-text-secondary)]">
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
                <div className="p-4 rounded-xl bg-[var(--cx-status-ok-bg)] border border-[var(--cx-status-ok-border)] text-sm text-[var(--cx-status-ok-text)] flex items-center gap-3 animate-fade-in">
                  <CheckCircle2 size={16} />
                  <div>
                    <p className="font-semibold">Conexión exitosa</p>
                    <p className="text-xs opacity-80 mt-0.5">Token SII generado. Ya puedes emitir DTEs.</p>
                  </div>
                </div>
              )}
              {siiStatus.connection === 'error' && (
                <div className="p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)] text-sm text-[var(--cx-status-error-text)] flex items-center gap-3 animate-fade-in">
                  <AlertTriangle size={16} />
                  <div>
                    <p className="font-semibold">Error de conexión</p>
                    <p className="text-xs opacity-80 mt-0.5">No se pudo conectar con el SII. Verifica tu certificado e intenta nuevamente.</p>
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
