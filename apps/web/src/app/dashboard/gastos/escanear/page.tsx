/**
 * CUENTAX — Escanear Documento (Camera + OCR)
 * Captura una foto de boleta/factura, procesa con OCR,
 * y permite confirmar/editar los datos antes de guardar.
 */
'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Camera, Upload, RotateCcw, Loader2, AlertCircle,
  CheckCircle2, ArrowLeft, Image as ImageIcon, X,
  FileText, Pencil, Save, AlertTriangle,
} from 'lucide-react'
import { useProcessOCR, useCreateGasto } from '@/hooks'
import type { CreateGastoDTO } from '@/hooks'
import { formatCLP } from '@/lib/formatters'

// ── Constants ──────────────────────────────────────────────────
const CATEGORIAS = [
  { value: 'materiales', label: 'Materiales e Insumos' },
  { value: 'servicios', label: 'Servicios Profesionales' },
  { value: 'arriendo', label: 'Arriendo' },
  { value: 'servicios_basicos', label: 'Servicios Basicos' },
  { value: 'combustible', label: 'Combustible y Transporte' },
  { value: 'alimentacion', label: 'Alimentacion' },
  { value: 'equipos', label: 'Herramientas y Equipos' },
  { value: 'software', label: 'Software y Suscripciones' },
  { value: 'otros', label: 'Otros' },
]

const TIPOS_DOCUMENTO = [
  { value: 'boleta', label: 'Boleta' },
  { value: 'factura', label: 'Factura' },
  { value: 'nota_credito', label: 'Nota de Credito' },
  { value: 'recibo', label: 'Recibo' },
  { value: 'otro', label: 'Otro' },
]

type Step = 'capture' | 'processing' | 'confirm'

interface OCRResult {
  tipo_documento?: string
  numero_documento?: string
  fecha_documento?: string
  emisor_rut?: string
  emisor_razon_social?: string
  monto_neto?: number
  monto_iva?: number
  monto_total?: number
  categoria?: string
  descripcion?: string
  confianza_ocr?: number
  confianza_campos?: Record<string, number>
  foto_url?: string
}

interface FormData {
  tipo_documento: string
  numero_documento: string
  fecha_documento: string
  emisor_rut: string
  emisor_razon_social: string
  monto_neto: string
  monto_iva: string
  monto_total: string
  categoria: string
  descripcion: string
}

const EMPTY_FORM: FormData = {
  tipo_documento: 'boleta',
  numero_documento: '',
  fecha_documento: new Date().toISOString().slice(0, 10),
  emisor_rut: '',
  emisor_razon_social: '',
  monto_neto: '',
  monto_iva: '',
  monto_total: '',
  categoria: 'otros',
  descripcion: '',
}

// ── RUT validation ─────────────────────────────────────────────
function validateRUT(rut: string): boolean {
  if (!rut.trim()) return true
  const cleaned = rut.replace(/\./g, '').replace(/-/g, '').toUpperCase()
  if (cleaned.length < 2) return false

  const body = cleaned.slice(0, -1)
  const dv = cleaned.slice(-1)

  let sum = 0
  let mul = 2
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * mul
    mul = mul === 7 ? 2 : mul + 1
  }

  const remainder = 11 - (sum % 11)
  const expected = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder)

  return dv === expected
}

// ── Confidence Dot ─────────────────────────────────────────────
function ConfidenceDot({ value }: { value: number | undefined }) {
  if (value === undefined) return null
  const color = value >= 0.8 ? 'bg-emerald-500' : value >= 0.5 ? 'bg-amber-500' : 'bg-red-500'
  const label = value >= 0.8 ? 'Alta confianza' : value >= 0.5 ? 'Confianza media' : 'Baja confianza'
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${color} flex-shrink-0`}
      title={`${label} (${Math.round(value * 100)}%)`}
    />
  )
}

// ── Step 1: Capture ────────────────────────────────────────────
function CaptureStep({
  onCapture,
  onManual,
}: {
  onCapture: (file: File) => void
  onManual: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [capturedFile, setCapturedFile] = useState<File | null>(null)

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
      setStream(mediaStream)
      setCameraError(false)
    } catch {
      setCameraError(true)
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop())
      setStream(null)
    }
  }, [stream])

  useEffect(() => {
    startCamera()
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      stream?.getTracks().forEach(t => t.stop())
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Clean up preview URL on unmount
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      const file = new File([blob], `gasto-${Date.now()}.jpg`, { type: 'image/jpeg' })
      const url = URL.createObjectURL(blob)
      setCapturedFile(file)
      setPreview(url)
      stopCamera()
    }, 'image/jpeg', 0.9)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setCapturedFile(file)
    setPreview(url)
    stopCamera()
  }

  const retake = () => {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setCapturedFile(null)
    startCamera()
  }

  const confirmPhoto = () => {
    if (capturedFile) {
      onCapture(capturedFile)
    }
  }

  // Photo preview mode
  if (preview && capturedFile) {
    return (
      <div className="space-y-4">
        <div className="relative rounded-2xl overflow-hidden border border-[var(--cx-border-light)] bg-black">
          <img src={preview} alt="Vista previa" className="w-full max-h-[60vh] object-contain" />
        </div>
        <div className="flex gap-3">
          <button onClick={confirmPhoto} className="btn-primary flex-1 justify-center">
            <CheckCircle2 size={14} /> Usar esta foto
          </button>
          <button onClick={retake} className="btn-secondary flex-1 justify-center">
            <RotateCcw size={14} /> Volver a tomar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Camera or fallback */}
      {!cameraError ? (
        <div className="relative rounded-2xl overflow-hidden border border-[var(--cx-border-light)] bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full max-h-[60vh] object-cover"
          />
          {/* Capture overlay */}
          <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/60 to-transparent flex items-center justify-center">
            <button
              onClick={capturePhoto}
              className="w-16 h-16 rounded-full bg-white border-4 border-white/30 shadow-lg flex items-center justify-center hover:scale-105 transition-transform active:scale-95"
              aria-label="Capturar foto"
            >
              <Camera size={24} className="text-slate-800" />
            </button>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      ) : (
        <div className="card p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--cx-bg-elevated)] flex items-center justify-center">
            <Camera size={28} className="text-[var(--cx-text-muted)]" />
          </div>
          <p className="text-sm font-semibold text-[var(--cx-text-primary)] mb-1">
            No se pudo acceder a la camara
          </p>
          <p className="text-xs text-[var(--cx-text-muted)] mb-4">
            Puedes subir una foto desde tu galeria
          </p>
        </div>
      )}

      {/* File input fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="flex gap-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="btn-secondary flex-1 justify-center"
        >
          <Upload size={14} /> Subir desde galeria
        </button>
      </div>

      <button
        onClick={onManual}
        className="w-full text-center text-sm text-[var(--cx-active-text)] hover:underline py-2"
      >
        <Pencil size={12} className="inline mr-1" />
        Ingresar manualmente sin foto
      </button>
    </div>
  )
}

// ── Step 2: Processing ─────────────────────────────────────────
function ProcessingStep() {
  return (
    <div className="card p-8 text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-[var(--cx-active-icon)]" />
      </div>
      <p className="text-base font-semibold text-[var(--cx-text-primary)] mb-1">
        Procesando documento...
      </p>
      <p className="text-sm text-[var(--cx-text-muted)]">
        Extrayendo datos con reconocimiento optico. Esto puede tomar unos segundos.
      </p>
      <div className="mt-4 mx-auto max-w-xs">
        <div className="h-1.5 bg-[var(--cx-bg-elevated)] rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full animate-pulse w-2/3" />
        </div>
      </div>
    </div>
  )
}

// ── Step 3: Confirm Form ───────────────────────────────────────
function ConfirmStep({
  initialForm,
  previewUrl,
  confianzaCampos,
  confianzaOCR,
  fotoUrl,
  isSaving,
  onSave,
  onBack,
}: {
  initialForm: FormData
  previewUrl: string | null
  confianzaCampos: Record<string, number>
  confianzaOCR: number | null
  fotoUrl: string | null
  isSaving: boolean
  onSave: (data: CreateGastoDTO) => Promise<void>
  onBack: () => void
}) {
  const [form, setForm] = useState<FormData>(initialForm)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (field: keyof FormData, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  // Monto validation
  const montoNeto = parseFloat(form.monto_neto) || 0
  const montoIva = parseFloat(form.monto_iva) || 0
  const montoTotal = parseFloat(form.monto_total) || 0
  const montoMismatch = montoNeto > 0 && montoIva > 0 && montoTotal > 0 && Math.abs((montoNeto + montoIva) - montoTotal) > 1

  // RUT validation
  const rutInvalid = form.emisor_rut.trim() !== '' && !validateRUT(form.emisor_rut)

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!form.monto_total.trim() || parseFloat(form.monto_total) <= 0) {
      newErrors.monto_total = 'El monto total es requerido'
    }
    if (!form.fecha_documento.trim()) {
      newErrors.fecha_documento = 'La fecha es requerida'
    }
    if (!form.categoria) {
      newErrors.categoria = 'Selecciona una categoria'
    }
    if (rutInvalid) {
      newErrors.emisor_rut = 'RUT invalido (digito verificador no coincide)'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return

    const payload: CreateGastoDTO = {
      tipo_documento: form.tipo_documento,
      numero_documento: form.numero_documento || undefined,
      fecha_documento: form.fecha_documento,
      emisor_rut: form.emisor_rut || undefined,
      emisor_razon_social: form.emisor_razon_social || undefined,
      monto_neto: montoNeto || undefined,
      monto_iva: montoIva || undefined,
      monto_total: montoTotal,
      categoria: form.categoria,
      descripcion: form.descripcion || undefined,
      foto_url: fotoUrl || undefined,
      confianza_ocr: confianzaOCR ?? undefined,
    }

    await onSave(payload)
  }

  // Auto-calculate monto_total when neto + iva change
  const handleMontoNetoChange = (val: string) => {
    set('monto_neto', val)
    const neto = parseFloat(val) || 0
    if (neto > 0 && !form.monto_iva.trim()) {
      const iva = Math.round(neto * 0.19)
      set('monto_iva', String(iva))
      set('monto_total', String(neto + iva))
    }
  }

  return (
    <div className="space-y-4">
      {/* OCR confidence banner */}
      {confianzaOCR !== null && (
        <div className={`flex items-center gap-2 p-3 rounded-xl border ${
          confianzaOCR >= 0.8
            ? 'bg-[var(--cx-status-ok-bg)] border-[var(--cx-status-ok-border)]'
            : confianzaOCR >= 0.5
            ? 'bg-[var(--cx-status-warn-bg)] border-[var(--cx-status-warn-border)]'
            : 'bg-[var(--cx-status-error-bg)] border-[var(--cx-status-error-border)]'
        }`}>
          {confianzaOCR >= 0.8 ? (
            <CheckCircle2 size={14} className="text-[var(--cx-status-ok-text)]" />
          ) : (
            <AlertTriangle size={14} className={confianzaOCR >= 0.5 ? 'text-[var(--cx-status-warn-text)]' : 'text-[var(--cx-status-error-text)]'} />
          )}
          <span className={`text-xs font-medium ${
            confianzaOCR >= 0.8
              ? 'text-[var(--cx-status-ok-text)]'
              : confianzaOCR >= 0.5
              ? 'text-[var(--cx-status-warn-text)]'
              : 'text-[var(--cx-status-error-text)]'
          }`}>
            OCR: {Math.round(confianzaOCR * 100)}% de confianza. Revisa los datos antes de guardar.
          </span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Photo preview */}
        {previewUrl && (
          <div className="lg:w-1/3 flex-shrink-0">
            <div className="card overflow-hidden sticky top-4">
              <img
                src={previewUrl}
                alt="Documento escaneado"
                className="w-full max-h-[40vh] lg:max-h-[60vh] object-contain bg-slate-50"
              />
            </div>
          </div>
        )}

        {/* Form */}
        <div className="flex-1 space-y-3">
          <div className="card p-5 space-y-3">
            <h3 className="text-sm font-bold text-[var(--cx-text-primary)]">Datos del Documento</h3>

            {/* Tipo + Numero */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--cx-text-secondary)] mb-1">
                  Tipo de Documento
                  <ConfidenceDot value={confianzaCampos.tipo_documento} />
                </label>
                <select
                  value={form.tipo_documento}
                  onChange={e => set('tipo_documento', e.target.value)}
                  className="input-field text-sm"
                >
                  {TIPOS_DOCUMENTO.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--cx-text-secondary)] mb-1">
                  Numero Documento
                  <ConfidenceDot value={confianzaCampos.numero_documento} />
                </label>
                <input
                  value={form.numero_documento}
                  onChange={e => set('numero_documento', e.target.value)}
                  placeholder="Ej: 12345"
                  className="input-field text-sm"
                />
              </div>
            </div>

            {/* Fecha */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--cx-text-secondary)] mb-1">
                Fecha Documento *
                <ConfidenceDot value={confianzaCampos.fecha_documento} />
              </label>
              <input
                type="date"
                value={form.fecha_documento}
                onChange={e => set('fecha_documento', e.target.value)}
                className={`input-field text-sm ${errors.fecha_documento ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : ''}`}
              />
              {errors.fecha_documento && (
                <p className="text-xs text-[var(--cx-status-error-text)] mt-1">{errors.fecha_documento}</p>
              )}
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <h3 className="text-sm font-bold text-[var(--cx-text-primary)]">Emisor</h3>

            {/* RUT + Razon Social */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--cx-text-secondary)] mb-1">
                  RUT Emisor
                  <ConfidenceDot value={confianzaCampos.emisor_rut} />
                </label>
                <input
                  value={form.emisor_rut}
                  onChange={e => set('emisor_rut', e.target.value)}
                  placeholder="12.345.678-9"
                  className={`input-field text-sm ${rutInvalid ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                />
                {rutInvalid && (
                  <p className="text-xs text-[var(--cx-status-error-text)] mt-1">RUT invalido</p>
                )}
                {errors.emisor_rut && (
                  <p className="text-xs text-[var(--cx-status-error-text)] mt-1">{errors.emisor_rut}</p>
                )}
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--cx-text-secondary)] mb-1">
                  Razon Social
                  <ConfidenceDot value={confianzaCampos.emisor_razon_social} />
                </label>
                <input
                  value={form.emisor_razon_social}
                  onChange={e => set('emisor_razon_social', e.target.value)}
                  placeholder="Nombre del emisor"
                  className="input-field text-sm"
                />
              </div>
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <h3 className="text-sm font-bold text-[var(--cx-text-primary)]">Montos</h3>

            {/* Montos */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--cx-text-secondary)] mb-1">
                  Monto Neto
                  <ConfidenceDot value={confianzaCampos.monto_neto} />
                </label>
                <input
                  type="number"
                  value={form.monto_neto}
                  onChange={e => handleMontoNetoChange(e.target.value)}
                  placeholder="0"
                  className="input-field text-sm"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--cx-text-secondary)] mb-1">
                  IVA
                  <ConfidenceDot value={confianzaCampos.monto_iva} />
                </label>
                <input
                  type="number"
                  value={form.monto_iva}
                  onChange={e => set('monto_iva', e.target.value)}
                  placeholder="0"
                  className="input-field text-sm"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--cx-text-secondary)] mb-1">
                  Monto Total *
                  <ConfidenceDot value={confianzaCampos.monto_total} />
                </label>
                <input
                  type="number"
                  value={form.monto_total}
                  onChange={e => set('monto_total', e.target.value)}
                  placeholder="0"
                  className={`input-field text-sm font-semibold ${errors.monto_total ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                />
                {errors.monto_total && (
                  <p className="text-xs text-[var(--cx-status-error-text)] mt-1">{errors.monto_total}</p>
                )}
              </div>
            </div>

            {/* Monto mismatch warning */}
            {montoMismatch && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--cx-status-warn-bg)] border border-[var(--cx-status-warn-border)]">
                <AlertTriangle size={13} className="text-[var(--cx-status-warn-text)] flex-shrink-0" />
                <span className="text-xs text-[var(--cx-status-warn-text)]">
                  Neto ({formatCLP(montoNeto)}) + IVA ({formatCLP(montoIva)}) = {formatCLP(montoNeto + montoIva)}, pero el total es {formatCLP(montoTotal)}
                </span>
              </div>
            )}
          </div>

          <div className="card p-5 space-y-3">
            <h3 className="text-sm font-bold text-[var(--cx-text-primary)]">Clasificacion</h3>

            {/* Categoria */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--cx-text-secondary)] mb-1">
                Categoria *
                <ConfidenceDot value={confianzaCampos.categoria} />
              </label>
              <select
                value={form.categoria}
                onChange={e => set('categoria', e.target.value)}
                className={`input-field text-sm ${errors.categoria ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : ''}`}
              >
                <option value="">Seleccionar categoria</option>
                {CATEGORIAS.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              {errors.categoria && (
                <p className="text-xs text-[var(--cx-status-error-text)] mt-1">{errors.categoria}</p>
              )}
            </div>

            {/* Descripcion */}
            <div>
              <label className="text-xs font-medium text-[var(--cx-text-secondary)] mb-1 block">
                Descripcion (opcional)
              </label>
              <textarea
                value={form.descripcion}
                onChange={e => set('descripcion', e.target.value)}
                placeholder="Detalle adicional del gasto..."
                rows={2}
                className="input-field text-sm resize-none"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={isSaving}
              className="btn-primary flex-1 justify-center"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Guardar Gasto
            </button>
            <button onClick={onBack} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────
export default function EscanearPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('capture')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [ocrResult, setOCRResult] = useState<OCRResult | null>(null)
  const [ocrError, setOCRError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const { process } = useProcessOCR()
  const { crear } = useCreateGasto()

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const handleCapture = async (file: File) => {
    setImageFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setStep('processing')
    setOCRError(null)

    try {
      const result = await process(file)
      setOCRResult(result)
      setStep('confirm')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error procesando imagen'
      setOCRError(message)
      // Still go to confirm step with empty form so user can fill manually
      setOCRResult(null)
      setStep('confirm')
    }
  }

  const handleManualEntry = () => {
    setOCRResult(null)
    setStep('confirm')
  }

  const handleSave = async (data: CreateGastoDTO) => {
    setIsSaving(true)
    try {
      await crear(data)
      router.push('/dashboard/gastos')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error guardando gasto'
      setOCRError(message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleBack = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setImageFile(null)
    setOCRResult(null)
    setOCRError(null)
    setStep('capture')
  }

  // Build initial form from OCR result
  const initialForm: FormData = ocrResult
    ? {
        tipo_documento: ocrResult.tipo_documento || 'boleta',
        numero_documento: ocrResult.numero_documento || '',
        fecha_documento: ocrResult.fecha_documento || new Date().toISOString().slice(0, 10),
        emisor_rut: ocrResult.emisor_rut || '',
        emisor_razon_social: ocrResult.emisor_razon_social || '',
        monto_neto: ocrResult.monto_neto ? String(ocrResult.monto_neto) : '',
        monto_iva: ocrResult.monto_iva ? String(ocrResult.monto_iva) : '',
        monto_total: ocrResult.monto_total ? String(ocrResult.monto_total) : '',
        categoria: ocrResult.categoria || 'otros',
        descripcion: ocrResult.descripcion || '',
      }
    : EMPTY_FORM

  return (
    <div className="space-y-5 animate-fade-in max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/dashboard/gastos')}
          className="p-2 rounded-xl text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">
            {step === 'capture' ? 'Escanear Documento' : step === 'processing' ? 'Procesando...' : 'Confirmar Datos'}
          </h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            {step === 'capture'
              ? 'Toma una foto de tu boleta o factura'
              : step === 'processing'
              ? 'Extrayendo datos automaticamente'
              : 'Revisa y confirma los datos del gasto'}
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {(['capture', 'processing', 'confirm'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              step === s
                ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white'
                : i < ['capture', 'processing', 'confirm'].indexOf(step)
                ? 'bg-emerald-100 text-emerald-600 border border-emerald-200'
                : 'bg-[var(--cx-bg-elevated)] text-[var(--cx-text-muted)] border border-[var(--cx-border-light)]'
            }`}>
              {i < ['capture', 'processing', 'confirm'].indexOf(step)
                ? <CheckCircle2 size={14} />
                : i + 1
              }
            </div>
            {i < 2 && (
              <div className={`w-12 h-0.5 rounded ${
                i < ['capture', 'processing', 'confirm'].indexOf(step)
                  ? 'bg-emerald-300'
                  : 'bg-[var(--cx-border-light)]'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* OCR Error banner */}
      {ocrError && step === 'confirm' && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--cx-status-warn-bg)] border border-[var(--cx-status-warn-border)]">
          <AlertCircle size={14} className="text-[var(--cx-status-warn-text)] flex-shrink-0" />
          <span className="text-xs text-[var(--cx-status-warn-text)]">
            {ocrError}. Puedes ingresar los datos manualmente.
          </span>
        </div>
      )}

      {/* Steps */}
      {step === 'capture' && (
        <CaptureStep onCapture={handleCapture} onManual={handleManualEntry} />
      )}

      {step === 'processing' && <ProcessingStep />}

      {step === 'confirm' && (
        <ConfirmStep
          initialForm={initialForm}
          previewUrl={previewUrl}
          confianzaCampos={ocrResult?.confianza_campos ?? {}}
          confianzaOCR={ocrResult?.confianza_ocr ?? null}
          fotoUrl={ocrResult?.foto_url ?? null}
          isSaving={isSaving}
          onSave={handleSave}
          onBack={handleBack}
        />
      )}
    </div>
  )
}
