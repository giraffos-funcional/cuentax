/**
 * CUENTAX — Emitir DTE (Modo Simple + Expert)
 * Modo Simple: 3 campos y emitir. Para la PYME que no sabe de contabilidad.
 * Modo Expert: tabla de ítems, descuentos, referencias, batch — para el contador.
 */

'use client'

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Zap, BookOpen, Plus, Trash2, Send, FileText,
         ChevronDown, AlertCircle, CheckCircle2, Loader2,
         ToggleLeft, ToggleRight } from 'lucide-react'

// ── Schemas ────────────────────────────────────────────────────
const tiposDTE = [
  { value: 33,  label: 'Factura Electrónica',          icon: '🧾' },
  { value: 39,  label: 'Boleta Electrónica',           icon: '⚡' },
  { value: 41,  label: 'Boleta No Afecta',             icon: '📋' },
  { value: 56,  label: 'Nota de Débito',               icon: '📈' },
  { value: 61,  label: 'Nota de Crédito',              icon: '📉' },
  { value: 110, label: 'Factura de Exportación',       icon: '🌎' },
] as const

const itemSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido'),
  cantidad: z.coerce.number().min(1),
  precio_unitario: z.coerce.number().min(1, 'Precio requerido'),
  descuento_pct: z.coerce.number().min(0).max(100).default(0),
  exento: z.boolean().default(false),
  codigo: z.string().optional(),
})

const dteSchema = z.object({
  tipo_dte: z.coerce.number(),
  rut_receptor: z.string().min(1, 'RUT requerido'),
  razon_social_receptor: z.string().min(1, 'Razón social requerida'),
  giro_receptor: z.string().min(1, 'Giro requerido'),
  direccion_receptor: z.string().min(1, 'Dirección requerida'),
  comuna_receptor: z.string().min(1, 'Comuna requerida'),
  ciudad_receptor: z.string().optional(),
  contacto_receptor: z.string().optional(),
  email_receptor: z.string().email().optional().or(z.literal('')),
  forma_pago: z.coerce.number().default(1),
  observaciones: z.string().optional(),
  items: z.array(itemSchema).min(1, 'Al menos un ítem'),
})
type DTEForm = z.infer<typeof dteSchema>

// ── Utilidades ─────────────────────────────────────────────────
const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(n)

// ── Modo Simple — Para PYMEs ───────────────────────────────────
function ModoSimple({ onSwitch }: { onSwitch: () => void }) {
  const [tipo, setTipo] = useState(39)
  const [receptor, setReceptor] = useState('')
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleEmitir = async () => {
    setLoading(true)
    await new Promise(r => setTimeout(r, 1500))
    setDone(true)
    setLoading(false)
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-[var(--cx-status-ok-bg)] border border-[var(--cx-status-ok-border)] flex items-center justify-center">
          <CheckCircle2 size={28} className="text-[var(--cx-status-ok-text)]" />
        </div>
        <h3 className="text-lg font-bold text-[var(--cx-text-primary)]">¡DTE Emitido!</h3>
        <p className="text-sm text-[var(--cx-text-secondary)]">Folio #1043 · Enviado al SII</p>
        <div className="flex gap-3 mt-2">
          <button className="btn-secondary" onClick={() => setDone(false)}>Nueva emisión</button>
          <button className="btn-primary">Ver PDF</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Tipo DTE — Selector visual */}
      <div>
        <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-3">¿Qué quieres emitir?</label>
        <div className="grid grid-cols-2 gap-2">
          {tiposDTE.slice(0, 4).map((t) => (
            <button
              key={t.value}
              onClick={() => setTipo(t.value)}
              className={`
                flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all
                ${tipo === t.value
                  ? 'bg-[var(--cx-active-bg)] border-[var(--cx-active-border)] text-[var(--cx-active-text)]'
                  : 'bg-[var(--cx-bg-elevated)] border-[var(--cx-border-light)] text-[var(--cx-text-secondary)] hover:border-[var(--cx-border-hover)] hover:text-[var(--cx-text-primary)]'
                }
              `}
            >
              <span className="text-xl">{t.icon}</span>
              <span className="text-sm font-medium">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Receptor */}
      <div>
        <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1.5">
          RUT del receptor
        </label>
        <input
          type="text"
          placeholder="12.345.678-9"
          value={receptor}
          onChange={(e) => setReceptor(e.target.value)}
          className="input-field"
        />
      </div>

      {/* Descripción + Monto */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1.5">Descripción</label>
          <input
            type="text"
            placeholder="Servicios de diseño web"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1.5">Monto ($)</label>
          <input
            type="number"
            placeholder="50000"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      {/* Preview monto */}
      {monto && (
        <div className="p-3 rounded-xl bg-[var(--cx-bg-elevated)] border border-[var(--cx-border-light)] animate-fade-in">
          <div className="flex justify-between text-xs text-[var(--cx-text-secondary)]">
            <span>Neto</span>
            <span>{formatCLP(Math.round(Number(monto) / 1.19))}</span>
          </div>
          <div className="flex justify-between text-xs text-[var(--cx-text-secondary)] mt-1">
            <span>IVA (19%)</span>
            <span>{formatCLP(Number(monto) - Math.round(Number(monto) / 1.19))}</span>
          </div>
          <div className="flex justify-between text-sm font-semibold text-[var(--cx-text-primary)] mt-2 pt-2 border-t border-[var(--cx-border-light)]">
            <span>Total</span>
            <span>{formatCLP(Number(monto))}</span>
          </div>
        </div>
      )}

      <button
        onClick={handleEmitir}
        disabled={!receptor || !monto || !descripcion || loading}
        className="btn-primary w-full justify-center text-base py-3"
      >
        {loading
          ? <><Loader2 size={16} className="animate-spin" /> Emitiendo...</>
          : <><Send size={16} /> Emitir DTE</>
        }
      </button>

      <button
        onClick={onSwitch}
        className="flex items-center gap-2 text-xs text-[var(--cx-text-secondary)] hover:text-[var(--cx-text-primary)] transition-colors mx-auto"
      >
        <BookOpen size={12} />
        Modo Experto — más opciones
      </button>
    </div>
  )
}

// ── Modo Expert — Para contadores ─────────────────────────────
function ModoExpert({ onSwitch }: { onSwitch: () => void }) {
  const { register, control, watch, handleSubmit, formState: { errors } } = useForm<DTEForm>({
    resolver: zodResolver(dteSchema),
    defaultValues: {
      tipo_dte: 33,
      forma_pago: 1,
      items: [{ nombre: '', cantidad: 1, precio_unitario: 0, descuento_pct: 0, exento: false }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const items       = watch('items') || []
  const tipo_dte    = watch('tipo_dte')
  const [loading, setLoading] = useState(false)

  const calcTotals = () => {
    let neto = 0, exento = 0
    items.forEach((it) => {
      const bruto = (it.cantidad || 0) * (it.precio_unitario || 0)
      const desc  = bruto * ((it.descuento_pct || 0) / 100)
      const monto = Math.round(bruto - desc)
      if (it.exento) exento += monto
      else neto += monto
    })
    const iva   = Math.round(neto * 0.19)
    const total = neto + iva + exento
    return { neto, exento, iva, total }
  }

  const totals = calcTotals()

  const onSubmit = async (data: DTEForm) => {
    setLoading(true)
    console.log('Expert submit:', data)
    await new Promise(r => setTimeout(r, 1000))
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 animate-fade-in">
      {/* Tipo DTE */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1.5">Tipo DTE</label>
          <select {...register('tipo_dte')} className="input-field">
            {tiposDTE.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1.5">Forma de Pago</label>
          <select {...register('forma_pago')} className="input-field">
            <option value={1}>Contado</option>
            <option value={2}>Crédito</option>
          </select>
        </div>
      </div>

      {/* Receptor */}
      <div className="p-4 rounded-xl bg-[var(--cx-bg-elevated)] border border-[var(--cx-border-light)] space-y-3">
        <p className="text-xs font-semibold text-[var(--cx-text-secondary)] uppercase tracking-wide">Receptor</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--cx-text-secondary)] mb-1">RUT</label>
            <input {...register('rut_receptor')} placeholder="12.345.678-9" className="input-field" />
          </div>
          <div>
            <label className="block text-xs text-[var(--cx-text-secondary)] mb-1">Email (opcional)</label>
            <input {...register('email_receptor')} type="email" placeholder="contacto@empresa.cl" className="input-field" />
          </div>
          <div>
            <label className="block text-xs text-[var(--cx-text-secondary)] mb-1">Razón Social</label>
            <input {...register('razon_social_receptor')} placeholder="Empresa SA" className="input-field" />
          </div>
          <div>
            <label className="block text-xs text-[var(--cx-text-secondary)] mb-1">Giro</label>
            <input {...register('giro_receptor')} placeholder="Servicios" className="input-field" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-[var(--cx-text-secondary)] mb-1">Dirección *</label>
            <input {...register('direccion_receptor')} placeholder="Av. Providencia 123" className="input-field" />
          </div>
          <div>
            <label className="block text-xs text-[var(--cx-text-secondary)] mb-1">Comuna *</label>
            <input {...register('comuna_receptor')} placeholder="Providencia" className="input-field" />
          </div>
          <div>
            <label className="block text-xs text-[var(--cx-text-secondary)] mb-1">Ciudad</label>
            <input {...register('ciudad_receptor')} placeholder="Santiago" className="input-field" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-[var(--cx-text-secondary)] mb-1">Contacto (opcional)</label>
            <input {...register('contacto_receptor')} placeholder="Nombre del contacto" className="input-field" />
          </div>
        </div>
      </div>

      {/* Ítems */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-[var(--cx-text-secondary)] uppercase tracking-wide">Ítems</p>
          <button
            type="button"
            onClick={() => append({ nombre: '', cantidad: 1, precio_unitario: 0, descuento_pct: 0, exento: false })}
            className="flex items-center gap-1 text-xs text-[var(--cx-active-icon)] hover:text-[var(--cx-active-text)] transition-colors"
          >
            <Plus size={12} /> Agregar ítem
          </button>
        </div>

        {/* Header */}
        <div className="grid grid-cols-12 gap-2 px-2 pb-1">
          {['Descripción', 'Cant.', 'Precio', 'Desc%', ''].map((h, i) => (
            <span key={i} className={`text-[10px] text-[var(--cx-text-muted)] uppercase tracking-wide ${
              i === 0 ? 'col-span-4' : i === 4 ? 'col-span-1' : 'col-span-2'
            }`}>{h}</span>
          ))}
        </div>

        <div className="space-y-2">
          {fields.map((field, idx) => {
            const item = items[idx]
            const monto = Math.round(((item?.cantidad || 0) * (item?.precio_unitario || 0)) * (1 - (item?.descuento_pct || 0) / 100))
            return (
              <div key={field.id} className="grid grid-cols-12 gap-2 items-center p-3 rounded-xl bg-[var(--cx-bg-elevated)] border border-[var(--cx-border-light)]">
                <input {...register(`items.${idx}.nombre`)} placeholder="Descripción" className="input-field col-span-4 py-2 text-sm" />
                <input {...register(`items.${idx}.cantidad`)} type="number" min="1" placeholder="1" className="input-field col-span-2 py-2 text-sm" />
                <input {...register(`items.${idx}.precio_unitario`)} type="number" placeholder="0" className="input-field col-span-2 py-2 text-sm" />
                <input {...register(`items.${idx}.descuento_pct`)} type="number" min="0" max="100" step="0.1" placeholder="0" className="input-field col-span-2 py-2 text-sm" />
                <div className="col-span-1 text-right">
                  <span className="text-xs text-[var(--cx-text-secondary)]">{formatCLP(monto)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => fields.length > 1 && remove(idx)}
                  className="col-span-1 flex justify-center text-[var(--cx-text-muted)] hover:text-[var(--cx-status-error-text)] transition-colors disabled:opacity-30"
                  disabled={fields.length === 1}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Totales */}
      <div className="p-4 rounded-xl bg-[var(--cx-bg-elevated)] border border-[var(--cx-border-light)] space-y-2">
        <div className="flex justify-between text-xs text-[var(--cx-text-secondary)]">
          <span>Neto</span><span>{formatCLP(totals.neto)}</span>
        </div>
        {totals.exento > 0 && (
          <div className="flex justify-between text-xs text-[var(--cx-text-secondary)]">
            <span>Exento</span><span>{formatCLP(totals.exento)}</span>
          </div>
        )}
        <div className="flex justify-between text-xs text-[var(--cx-text-secondary)]">
          <span>IVA (19%)</span><span>{formatCLP(totals.iva)}</span>
        </div>
        <div className="flex justify-between font-bold text-[var(--cx-text-primary)] pt-2 border-t border-[var(--cx-border-light)]">
          <span>Total</span><span className="text-lg">{formatCLP(totals.total)}</span>
        </div>
      </div>

      {/* Observaciones */}
      <div>
        <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1.5">Observaciones (opcional)</label>
        <textarea {...register('observaciones')} rows={2} placeholder="Notas adicionales para el DTE..." className="input-field resize-none" />
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
          {loading
            ? <><Loader2 size={14} className="animate-spin" /> Emitiendo...</>
            : <><Send size={14} /> Emitir DTE</>
          }
        </button>
        <button
          type="button"
          onClick={onSwitch}
          className="btn-secondary flex items-center gap-2"
        >
          <Zap size={14} /> Modo Simple
        </button>
      </div>
    </form>
  )
}

// ── Page ──────────────────────────────────────────────────────
export default function EmitirDTEPage() {
  const [mode, setMode] = useState<'simple' | 'expert'>('simple')

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header con toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Emitir DTE</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            {mode === 'simple' ? 'Modo Simple — ideal para operaciones rápidas' : 'Modo Experto — control total del documento'}
          </p>
        </div>
        <button
          onClick={() => setMode(m => m === 'simple' ? 'expert' : 'simple')}
          className={`
            flex items-center gap-2.5 px-4 py-2 rounded-xl border text-sm font-medium transition-all
            ${mode === 'expert'
              ? 'bg-[var(--cx-active-bg)] border-[var(--cx-active-border)] text-[var(--cx-active-text)]'
              : 'bg-[var(--cx-bg-elevated)] border-[var(--cx-border-light)] text-[var(--cx-text-secondary)] hover:text-[var(--cx-text-primary)]'
            }
          `}
        >
          {mode === 'expert' ? <BookOpen size={14} /> : <Zap size={14} />}
          {mode === 'simple' ? 'Modo Experto' : 'Modo Simple'}
        </button>
      </div>

      {/* Form Card */}
      <div className="card p-6">
        {mode === 'simple'
          ? <ModoSimple onSwitch={() => setMode('expert')} />
          : <ModoExpert onSwitch={() => setMode('simple')} />
        }
      </div>
    </div>
  )
}
