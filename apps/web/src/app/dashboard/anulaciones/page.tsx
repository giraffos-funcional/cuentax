/**
 * CUENTAX — Anulaciones (NC / ND)
 * Mia: "Anular una factura es un momento crítico.
 * El usuario necesita entender exactamente qué está haciendo.
 * Confirmación clara, referencia al documento original, motivo obligatorio."
 */
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertTriangle, Search, FileText, ArrowRight,
         CheckCircle2, Loader2, XCircle } from 'lucide-react'

const anulacionSchema = z.object({
  folio_original: z.coerce.number().positive('Folio requerido'),
  tipo_original: z.coerce.number().int(),
  motivo: z.string().min(10, 'El motivo debe tener al menos 10 caracteres'),
  tipo_anulacion: z.enum(['nc', 'nd']),
})

type AnulacionForm = z.infer<typeof anulacionSchema>

// DTE de ejemplo buscado
const MOCK_DTE = {
  folio: 1041,
  tipo: 33,
  tipo_label: 'Factura',
  receptor: 'Tech Solutions SpA',
  rut: '76.543.210-K',
  fecha: '2026-03-25',
  monto: 890000,
  estado: 'aceptado',
}

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

export default function AnulacionesPage() {
  const [step, setStep] = useState<'buscar' | 'confirmar' | 'done'>('buscar')
  const [searchFolio, setSearchFolio] = useState('')
  const [foundDTE, setFoundDTE] = useState<typeof MOCK_DTE | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<AnulacionForm>({
    resolver: zodResolver(anulacionSchema),
    defaultValues: { tipo_original: 33, tipo_anulacion: 'nc' },
  })

  const tipo_anulacion = watch('tipo_anulacion')

  const handleSearch = () => {
    if (searchFolio === String(MOCK_DTE.folio)) {
      setFoundDTE(MOCK_DTE)
      setStep('confirmar')
    }
  }

  const onSubmit = async (data: AnulacionForm) => {
    setLoading(true)
    await new Promise(r => setTimeout(r, 2000))
    setLoading(false)
    setStep('done')
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Anulaciones</h1>
        <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
          Genera Notas de Crédito o Débito para anular o ajustar documentos emitidos
        </p>
      </div>

      {/* Alert */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/[0.06] border border-amber-500/20">
        <AlertTriangle size={16} className="text-[var(--cx-status-warn-text)] shrink-0 mt-0.5" />
        <div className="text-xs text-amber-400/80 space-y-1">
          <p className="font-semibold text-amber-300">Consideraciones importantes</p>
          <p>Solo puedes anular documentos en estado <strong>Aceptado</strong> por el SII.</p>
          <p>Una NC (Nota de Crédito) anula total o parcialmente la factura original.</p>
          <p>Una ND (Nota de Débito) incrementa el monto del documento original.</p>
        </div>
      </div>

      {step === 'buscar' && (
        <div className="card p-6 space-y-4">
          <h3 className="text-sm font-semibold text-[var(--cx-text-primary)]">Buscar documento a anular</h3>
          <div className="flex gap-3">
            <input
              type="number"
              value={searchFolio}
              onChange={e => setSearchFolio(e.target.value)}
              placeholder="Folio del documento..."
              className="input-field flex-1"
            />
            <button onClick={handleSearch} className="btn-primary">
              <Search size={14} /> Buscar
            </button>
          </div>
          <p className="text-xs text-[var(--cx-text-muted)]">Ingresa el número de folio de la factura/boleta a anular. Ejemplo: 1041</p>
        </div>
      )}

      {step === 'confirmar' && foundDTE && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 animate-fade-in">
          {/* Documento encontrado */}
          <div className="card p-5">
            <p className="section-title mb-3">Documento encontrado</p>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[var(--cx-status-ok-bg)] flex items-center justify-center">
                <FileText size={16} className="text-[var(--cx-status-ok-text)]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[var(--cx-text-primary)]">{foundDTE.tipo_label} #{foundDTE.folio}</span>
                  <span className="badge-dte-accepted">Aceptado</span>
                </div>
                <p className="text-xs text-[var(--cx-text-secondary)]">{foundDTE.receptor} · {foundDTE.rut}</p>
              </div>
              <div className="text-right">
                <p className="text-base font-bold text-[var(--cx-text-primary)]">{formatCLP(foundDTE.monto)}</p>
                <p className="text-xs text-[var(--cx-text-muted)]">{foundDTE.fecha}</p>
              </div>
            </div>
          </div>

          {/* Tipo de anulación */}
          <div className="card p-5 space-y-4">
            <p className="section-title">Configurar anulación</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'nc', label: 'Nota de Crédito', desc: 'Reduce o anula el monto', color: 'emerald' },
                { value: 'nd', label: 'Nota de Débito', desc: 'Incrementa el monto', color: 'amber' },
              ].map(t => (
                <label
                  key={t.value}
                  className={`flex flex-col gap-1 p-4 rounded-xl border cursor-pointer transition-all ${
                    tipo_anulacion === t.value
                      ? `bg-${t.color}-500/10 border-${t.color}-500/30 text-${t.color}-300`
                      : 'bg-[var(--cx-bg-elevated)] border-[var(--cx-border-light)] text-[var(--cx-text-secondary)] hover:border-[var(--cx-border-hover)]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input type="radio" value={t.value} {...register('tipo_anulacion')} className="sr-only" />
                    <span className="text-sm font-semibold">{t.label}</span>
                  </div>
                  <span className="text-xs opacity-70">{t.desc}</span>
                </label>
              ))}
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1.5">
                Motivo de la anulación <span className="text-[var(--cx-status-error-text)]">*</span>
              </label>
              <textarea
                {...register('motivo')}
                rows={3}
                placeholder="Ej: Error en el monto facturado, devolución de mercadería, precio incorrecto..."
                className="input-field resize-none"
              />
              {errors.motivo && (
                <p className="mt-1 text-xs text-[var(--cx-status-error-text)]">{errors.motivo.message}</p>
              )}
            </div>
          </div>

          {/* Confirm */}
          <div className="flex gap-3">
            <button type="button" onClick={() => setStep('buscar')} className="btn-secondary flex-1 justify-center">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="btn-danger flex-1 justify-center py-2.5">
              {loading ? (
                <><Loader2 size={14} className="animate-spin" /> Generando...</>
              ) : (
                <>Emitir {tipo_anulacion === 'nc' ? 'Nota de Crédito' : 'Nota de Débito'}</>
              )}
            </button>
          </div>
        </form>
      )}

      {step === 'done' && (
        <div className="card p-8 flex flex-col items-center gap-4 animate-fade-in text-center">
          <div className="w-16 h-16 rounded-2xl bg-[var(--cx-status-ok-bg)] border border-[var(--cx-status-ok-border)] flex items-center justify-center">
            <CheckCircle2 size={28} className="text-[var(--cx-status-ok-text)]" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[var(--cx-text-primary)]">¡Anulación completada!</h3>
            <p className="text-sm text-[var(--cx-text-secondary)] mt-1">
              Nota de Crédito #1044 emitida y enviada al SII
            </p>
          </div>
          <div className="flex gap-3 mt-2">
            <button className="btn-secondary" onClick={() => { setStep('buscar'); setFoundDTE(null); setSearchFolio('') }}>
              Nueva anulación
            </button>
            <button className="btn-primary">Ver NC #1044</button>
          </div>
        </div>
      )}
    </div>
  )
}
