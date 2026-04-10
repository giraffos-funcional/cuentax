/**
 * CUENTAX — Detalle de Gasto
 * Muestra la foto completa, todos los datos del gasto,
 * y permite editar o eliminar.
 */
'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft, Trash2, Edit, Loader2, AlertCircle,
  CheckCircle2, Clock, Save, X, Image as ImageIcon,
  FileText, Calendar, Building2, DollarSign, Tag,
} from 'lucide-react'
import { useGasto, useUpdateGasto, useDeleteGasto } from '@/hooks'
import type { CreateGastoDTO } from '@/hooks'
import { formatCLP, formatDate } from '@/lib/formatters'

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

const CATEGORIA_MAP = Object.fromEntries(CATEGORIAS.map(c => [c.value, c.label]))

const TIPOS_DOCUMENTO = [
  { value: 'boleta', label: 'Boleta' },
  { value: 'factura', label: 'Factura' },
  { value: 'nota_credito', label: 'Nota de Credito' },
  { value: 'recibo', label: 'Recibo' },
  { value: 'otro', label: 'Otro' },
]

const TIPO_DOC_LABELS: Record<string, string> = Object.fromEntries(TIPOS_DOCUMENTO.map(t => [t.value, t.label]))

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

// ── Detail Row ─────────────────────────────────────────────────
function DetailRow({ icon: Icon, label, value }: {
  icon: typeof FileText
  label: string
  value: string | number | null | undefined
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon size={14} className="text-[var(--cx-text-muted)] mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-[var(--cx-text-muted)]">{label}</p>
        <p className="text-sm font-medium text-[var(--cx-text-primary)]">
          {value ?? '-'}
        </p>
      </div>
    </div>
  )
}

// ── Edit Modal ─────────────────────────────────────────────────
function EditModal({
  initial,
  isSaving,
  onSave,
  onClose,
}: {
  initial: {
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
  isSaving: boolean
  onSave: (data: Partial<CreateGastoDTO>) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (field: string, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const rutInvalid = form.emisor_rut.trim() !== '' && !validateRUT(form.emisor_rut)

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {}
    if (!form.monto_total.trim() || parseFloat(form.monto_total) <= 0) {
      newErrors.monto_total = 'El monto total es requerido'
    }
    if (!form.fecha_documento.trim()) {
      newErrors.fecha_documento = 'La fecha es requerida'
    }
    if (rutInvalid) {
      newErrors.emisor_rut = 'RUT invalido'
    }
    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) return

    await onSave({
      tipo_documento: form.tipo_documento,
      numero_documento: form.numero_documento || undefined,
      fecha_documento: form.fecha_documento,
      emisor_rut: form.emisor_rut || undefined,
      emisor_razon_social: form.emisor_razon_social || undefined,
      monto_neto: parseFloat(form.monto_neto) || undefined,
      monto_iva: parseFloat(form.monto_iva) || undefined,
      monto_total: parseFloat(form.monto_total),
      categoria: form.categoria,
      descripcion: form.descripcion || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="card p-6 w-full max-w-lg mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-[var(--cx-text-primary)]">Editar Gasto</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-3">
          {/* Tipo + Numero */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Tipo</label>
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
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Numero</label>
              <input
                value={form.numero_documento}
                onChange={e => set('numero_documento', e.target.value)}
                placeholder="12345"
                className="input-field text-sm"
              />
            </div>
          </div>

          {/* Fecha */}
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Fecha *</label>
            <input
              type="date"
              value={form.fecha_documento}
              onChange={e => set('fecha_documento', e.target.value)}
              className={`input-field text-sm ${errors.fecha_documento ? 'border-red-400' : ''}`}
            />
            {errors.fecha_documento && <p className="text-xs text-red-500 mt-1">{errors.fecha_documento}</p>}
          </div>

          {/* RUT + Razon Social */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">RUT Emisor</label>
              <input
                value={form.emisor_rut}
                onChange={e => set('emisor_rut', e.target.value)}
                placeholder="12.345.678-9"
                className={`input-field text-sm ${rutInvalid || errors.emisor_rut ? 'border-red-400' : ''}`}
              />
              {(rutInvalid || errors.emisor_rut) && <p className="text-xs text-red-500 mt-1">RUT invalido</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Razon Social</label>
              <input
                value={form.emisor_razon_social}
                onChange={e => set('emisor_razon_social', e.target.value)}
                placeholder="Nombre emisor"
                className="input-field text-sm"
              />
            </div>
          </div>

          {/* Montos */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Neto</label>
              <input
                type="number"
                value={form.monto_neto}
                onChange={e => set('monto_neto', e.target.value)}
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">IVA</label>
              <input
                type="number"
                value={form.monto_iva}
                onChange={e => set('monto_iva', e.target.value)}
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Total *</label>
              <input
                type="number"
                value={form.monto_total}
                onChange={e => set('monto_total', e.target.value)}
                className={`input-field text-sm font-semibold ${errors.monto_total ? 'border-red-400' : ''}`}
              />
              {errors.monto_total && <p className="text-xs text-red-500 mt-1">{errors.monto_total}</p>}
            </div>
          </div>

          {/* Categoria */}
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Categoria</label>
            <select
              value={form.categoria}
              onChange={e => set('categoria', e.target.value)}
              className="input-field text-sm"
            >
              {CATEGORIAS.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Descripcion */}
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Descripcion</label>
            <textarea
              value={form.descripcion}
              onChange={e => set('descripcion', e.target.value)}
              rows={2}
              className="input-field text-sm resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="btn-primary flex-1 justify-center"
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar
          </button>
          <button onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Delete Confirm Modal ───────────────────────────────────────
function DeleteConfirmModal({
  isDeleting,
  onConfirm,
  onClose,
}: {
  isDeleting: boolean
  onConfirm: () => Promise<void>
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="card p-6 w-full max-w-sm mx-4 shadow-xl">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)] flex items-center justify-center flex-shrink-0">
            <Trash2 size={15} className="text-[var(--cx-status-error-text)]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[var(--cx-text-primary)]">Eliminar gasto</h2>
            <p className="text-xs text-[var(--cx-text-secondary)] mt-0.5">
              Esta accion eliminara el gasto de forma permanente.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="btn-danger flex-1 justify-center"
          >
            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : null}
            Eliminar
          </button>
          <button onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────
export default function GastoDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const { gasto, isLoading, error } = useGasto(id)
  const { update } = useUpdateGasto()
  const { remove } = useDeleteGasto()

  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleUpdate = async (data: Partial<CreateGastoDTO>) => {
    setIsSaving(true)
    try {
      await update(id, data)
      setShowEdit(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await remove(id)
      router.push('/dashboard/gastos')
    } finally {
      setIsDeleting(false)
    }
  }

  // Loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 animate-fade-in">
        <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
        <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando gasto...</span>
      </div>
    )
  }

  // Error
  if (error || !gasto) {
    return (
      <div className="space-y-4 animate-fade-in">
        <button
          onClick={() => router.push('/dashboard/gastos')}
          className="flex items-center gap-2 text-sm text-[var(--cx-text-secondary)] hover:text-[var(--cx-text-primary)] transition-colors"
        >
          <ArrowLeft size={14} /> Volver a Gastos
        </button>
        <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
          <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
          <span className="text-sm text-[var(--cx-status-error-text)]">
            {error ? 'Error cargando gasto' : 'Gasto no encontrado'}
          </span>
        </div>
      </div>
    )
  }

  const editInitial = {
    tipo_documento: gasto.tipo_documento || 'boleta',
    numero_documento: gasto.numero_documento || '',
    fecha_documento: gasto.fecha_documento?.slice(0, 10) || '',
    emisor_rut: gasto.emisor_rut || '',
    emisor_razon_social: gasto.emisor_razon_social || '',
    monto_neto: gasto.monto_neto ? String(gasto.monto_neto) : '',
    monto_iva: gasto.monto_iva ? String(gasto.monto_iva) : '',
    monto_total: gasto.monto_total ? String(gasto.monto_total) : '',
    categoria: gasto.categoria || 'otros',
    descripcion: gasto.descripcion || '',
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard/gastos')}
            className="p-2 rounded-xl text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">
              {gasto.emisor_razon_social || 'Gasto sin emisor'}
            </h1>
            <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
              {TIPO_DOC_LABELS[gasto.tipo_documento] ?? gasto.tipo_documento}
              {gasto.numero_documento ? ` #${gasto.numero_documento}` : ''}
              {' '} - {formatDate(gasto.fecha_documento)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowEdit(true)} className="btn-secondary">
            <Edit size={13} /> Editar
          </button>
          <button onClick={() => setShowDelete(true)} className="btn-danger">
            <Trash2 size={13} /> Eliminar
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Photo */}
        <div className="lg:w-2/5 flex-shrink-0">
          <div className="card overflow-hidden">
            {gasto.foto_url ? (
              <img
                src={gasto.foto_url}
                alt="Documento"
                className="w-full max-h-[60vh] object-contain bg-slate-50"
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-[var(--cx-text-muted)]">
                <ImageIcon size={40} className="mb-2" />
                <p className="text-sm">Sin foto del documento</p>
              </div>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 space-y-4">
          {/* Amount card */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-[var(--cx-text-muted)] uppercase tracking-wide">Monto Total</span>
              {gasto.verificado ? (
                <span className="inline-flex items-center gap-1 badge-dte bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 size={10} /> Verificado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 badge-dte bg-amber-50 text-amber-700 border border-amber-200">
                  <Clock size={10} /> Pendiente
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-[var(--cx-text-primary)]">
              {formatCLP(gasto.monto_total)}
            </p>
            {(gasto.monto_neto > 0 || gasto.monto_iva > 0) && (
              <div className="flex gap-4 mt-2">
                <span className="text-xs text-[var(--cx-text-secondary)]">
                  Neto: {formatCLP(gasto.monto_neto)}
                </span>
                <span className="text-xs text-[var(--cx-text-secondary)]">
                  IVA: {formatCLP(gasto.monto_iva)}
                </span>
              </div>
            )}
            {gasto.confianza_ocr !== null && (
              <div className="mt-3 pt-3 border-t border-[var(--cx-border-light)]">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--cx-text-muted)]">Confianza OCR:</span>
                  <div className="flex-1 h-1.5 bg-[var(--cx-bg-elevated)] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        gasto.confianza_ocr >= 0.8 ? 'bg-emerald-500' : gasto.confianza_ocr >= 0.5 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.round(gasto.confianza_ocr * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-[var(--cx-text-muted)]">
                    {Math.round(gasto.confianza_ocr * 100)}%
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Document info */}
          <div className="card p-5">
            <h3 className="text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wide mb-2">
              Documento
            </h3>
            <div className="divide-y divide-[var(--cx-border-light)]">
              <DetailRow
                icon={FileText}
                label="Tipo de Documento"
                value={TIPO_DOC_LABELS[gasto.tipo_documento] ?? gasto.tipo_documento}
              />
              <DetailRow
                icon={FileText}
                label="Numero"
                value={gasto.numero_documento}
              />
              <DetailRow
                icon={Calendar}
                label="Fecha"
                value={formatDate(gasto.fecha_documento)}
              />
            </div>
          </div>

          {/* Emisor info */}
          <div className="card p-5">
            <h3 className="text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wide mb-2">
              Emisor
            </h3>
            <div className="divide-y divide-[var(--cx-border-light)]">
              <DetailRow
                icon={Building2}
                label="Razon Social"
                value={gasto.emisor_razon_social}
              />
              <DetailRow
                icon={Building2}
                label="RUT"
                value={gasto.emisor_rut}
              />
            </div>
          </div>

          {/* Classification */}
          <div className="card p-5">
            <h3 className="text-xs font-semibold text-[var(--cx-text-muted)] uppercase tracking-wide mb-2">
              Clasificacion
            </h3>
            <div className="divide-y divide-[var(--cx-border-light)]">
              <DetailRow
                icon={Tag}
                label="Categoria"
                value={CATEGORIA_MAP[gasto.categoria] ?? gasto.categoria}
              />
              {gasto.descripcion && (
                <DetailRow
                  icon={FileText}
                  label="Descripcion"
                  value={gasto.descripcion}
                />
              )}
              <DetailRow
                icon={Calendar}
                label="Registrado"
                value={formatDate(gasto.created_at)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {showEdit && (
        <EditModal
          initial={editInitial}
          isSaving={isSaving}
          onSave={handleUpdate}
          onClose={() => setShowEdit(false)}
        />
      )}

      {/* Delete Modal */}
      {showDelete && (
        <DeleteConfirmModal
          isDeleting={isDeleting}
          onConfirm={handleDelete}
          onClose={() => setShowDelete(false)}
        />
      )}
    </div>
  )
}
