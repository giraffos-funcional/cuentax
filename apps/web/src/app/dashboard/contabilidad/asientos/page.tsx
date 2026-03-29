/**
 * CUENTAX — Asientos Contables
 * Journal entry creation and management with React Hook Form + Zod + useFieldArray.
 */

'use client'

import { useState, useMemo } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus, Trash2, Save, Send, ArrowLeft, Loader2, AlertCircle,
  CheckCircle2, Search,
} from 'lucide-react'
import Link from 'next/link'
import {
  useChartOfAccounts,
  useJournals,
  useCreateJournalEntry,
  usePostJournalEntry,
} from '@/hooks'

// ── Zod Schema ──────────────────────────────────────────────────
const lineSchema = z.object({
  account_id: z.coerce.number().min(1, 'Cuenta requerida'),
  account_label: z.string().optional(),
  description: z.string().optional(),
  partner: z.string().optional(),
  debit: z.coerce.number().min(0).default(0),
  credit: z.coerce.number().min(0).default(0),
})

const asientoSchema = z.object({
  date: z.string().min(1, 'Fecha requerida'),
  journal_id: z.coerce.number().min(1, 'Diario requerido'),
  ref: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(2, 'Minimo 2 lineas'),
})

type AsientoForm = z.infer<typeof asientoSchema>

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

// ── Account Search Select ───────────────────────────────────────
function AccountSelect({
  value,
  onChange,
  cuentas,
}: {
  value: number
  onChange: (id: number, label: string) => void
  cuentas: any[]
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return cuentas.slice(0, 50)
    const q = search.toLowerCase()
    return cuentas.filter((c: any) =>
      (c.codigo ?? '').toLowerCase().includes(q) ||
      (c.nombre ?? '').toLowerCase().includes(q)
    ).slice(0, 50)
  }, [cuentas, search])

  const selected = cuentas.find((c: any) => c.id === value)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="input-field text-sm w-full text-left truncate py-2"
      >
        {selected ? `${selected.codigo} - ${selected.nombre}` : 'Seleccionar cuenta...'}
      </button>

      {open && (
        <div className="absolute z-40 top-full left-0 right-0 mt-1 bg-white border border-[var(--cx-border-light)] rounded-xl shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b border-[var(--cx-border-light)]">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar cuenta..."
                className="input-field text-xs py-1.5 pl-7 w-full"
                autoFocus
              />
            </div>
          </div>
          <div className="overflow-y-auto max-h-48">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-[var(--cx-text-muted)] text-center">Sin resultados</div>
            ) : (
              filtered.map((c: any) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onChange(c.id, `${c.codigo} - ${c.nombre}`)
                    setOpen(false)
                    setSearch('')
                  }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-[var(--cx-hover-bg)] transition-colors ${
                    c.id === value ? 'bg-[var(--cx-active-bg)] text-[var(--cx-active-text)]' : 'text-[var(--cx-text-primary)]'
                  }`}
                >
                  <span className="font-mono text-[var(--cx-text-secondary)]">{c.codigo}</span>
                  <span className="ml-2">{c.nombre}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────
export default function AsientosPage() {
  const today = new Date().toISOString().slice(0, 10)

  const { register, control, watch, handleSubmit, reset, setValue, formState: { errors } } = useForm<AsientoForm>({
    resolver: zodResolver(asientoSchema),
    defaultValues: {
      date: today,
      journal_id: 0,
      ref: '',
      notes: '',
      lines: [
        { account_id: 0, account_label: '', description: '', partner: '', debit: 0, credit: 0 },
        { account_id: 0, account_label: '', description: '', partner: '', debit: 0, credit: 0 },
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
  const lines = watch('lines') || []

  const { journals } = useJournals()
  const generalJournals = journals.filter((j: any) => j.tipo === 'general')
  const { cuentas } = useChartOfAccounts()
  const { crear } = useCreateJournalEntry()
  const { post } = usePostJournalEntry()

  const [saving, setSaving] = useState(false)
  const [posting, setPosting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Totals
  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
  const diff = Math.abs(totalDebit - totalCredit)
  const balanced = diff < 0.01

  const onSaveDraft = async (data: AsientoForm) => {
    setSubmitError(null)
    setSuccess(null)
    if (!balanced) {
      setSubmitError('El asiento no esta cuadrado. Debe = Haber.')
      return
    }
    setSaving(true)
    try {
      await crear({ ...data, state: 'draft' })
      setSuccess('Asiento guardado como borrador')
      reset()
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const onPost = async (data: AsientoForm) => {
    setSubmitError(null)
    setSuccess(null)
    if (!balanced) {
      setSubmitError('El asiento no esta cuadrado. Debe = Haber.')
      return
    }
    setPosting(true)
    try {
      const result = await crear({ ...data, state: 'draft' })
      if (result?.id) {
        await post(result.id)
      }
      setSuccess('Asiento publicado exitosamente')
      reset()
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Error al publicar')
    } finally {
      setPosting(false)
    }
  }

  const isBusy = saving || posting

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/contabilidad/libro-diario"
            className="p-2 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Nuevo Asiento Contable</h1>
            <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">Ingresa las lineas del asiento contable</p>
          </div>
        </div>
      </div>

      {/* Success / Error */}
      {success && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-ok-bg)] border border-[var(--cx-status-ok-border)] animate-fade-in">
          <CheckCircle2 size={16} className="text-[var(--cx-status-ok-text)]" />
          <span className="text-sm text-[var(--cx-status-ok-text)]">{success}</span>
        </div>
      )}
      {submitError && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)] animate-fade-in">
          <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
          <span className="text-sm text-[var(--cx-status-error-text)]">{submitError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSaveDraft)} className="space-y-5">
        {/* Header Fields */}
        <div className="card p-5">
          <h3 className="text-xs font-bold text-[var(--cx-text-muted)] uppercase tracking-widest mb-3">Encabezado</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Fecha *</label>
              <input type="date" {...register('date')} className="input-field text-sm w-full" />
              {errors.date && <span className="text-xs text-[var(--cx-status-error-text)]">{errors.date.message}</span>}
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Diario *</label>
              <select {...register('journal_id')} className="input-field text-sm w-full">
                <option value={0}>Seleccionar diario...</option>
                {generalJournals.map((j: any) => (
                  <option key={j.id} value={j.id}>{j.nombre}</option>
                ))}
              </select>
              {errors.journal_id && <span className="text-xs text-[var(--cx-status-error-text)]">{errors.journal_id.message}</span>}
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Referencia</label>
              <input {...register('ref')} placeholder="Ej: FAC-001" className="input-field text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Notas</label>
              <input {...register('notes')} placeholder="Notas internas..." className="input-field text-sm w-full" />
            </div>
          </div>
        </div>

        {/* Lines */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)] flex items-center justify-between">
            <h3 className="text-xs font-bold text-[var(--cx-text-muted)] uppercase tracking-widest">Lineas del Asiento</h3>
            <button
              type="button"
              onClick={() => append({ account_id: 0, account_label: '', description: '', partner: '', debit: 0, credit: 0 })}
              className="flex items-center gap-1 text-xs text-[var(--cx-active-icon)] hover:text-[var(--cx-active-text)] transition-colors"
            >
              <Plus size={12} /> Agregar linea
            </button>
          </div>

          {/* Lines header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[9px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest border-b border-[var(--cx-border-light)]">
            <div className="col-span-3">Cuenta</div>
            <div className="col-span-3">Descripcion</div>
            <div className="col-span-2">Partner</div>
            <div className="col-span-2 text-right">Debe</div>
            <div className="col-span-1 text-right">Haber</div>
            <div className="col-span-1" />
          </div>

          <div className="divide-y divide-[var(--cx-border-light)]">
            {fields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center hover:bg-[var(--cx-hover-bg)] transition-colors">
                <div className="col-span-3">
                  <Controller
                    control={control}
                    name={`lines.${idx}.account_id`}
                    render={({ field: f }) => (
                      <AccountSelect
                        value={f.value}
                        onChange={(id, label) => {
                          f.onChange(id)
                          setValue(`lines.${idx}.account_label`, label)
                        }}
                        cuentas={cuentas}
                      />
                    )}
                  />
                </div>
                <div className="col-span-3">
                  <input
                    {...register(`lines.${idx}.description`)}
                    placeholder="Descripcion"
                    className="input-field text-xs py-2 w-full"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    {...register(`lines.${idx}.partner`)}
                    placeholder="Partner"
                    className="input-field text-xs py-2 w-full"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    {...register(`lines.${idx}.debit`)}
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    className="input-field text-xs py-2 w-full text-right font-mono"
                  />
                </div>
                <div className="col-span-1">
                  <input
                    {...register(`lines.${idx}.credit`)}
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    className="input-field text-xs py-2 w-full text-right font-mono"
                  />
                </div>
                <div className="col-span-1 flex justify-center">
                  <button
                    type="button"
                    onClick={() => fields.length > 2 && remove(idx)}
                    disabled={fields.length <= 2}
                    className="p-1 text-[var(--cx-text-muted)] hover:text-[var(--cx-status-error-text)] transition-colors disabled:opacity-30"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Totals footer */}
          <div className="grid grid-cols-12 gap-2 px-4 py-3 border-t border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)]">
            <div className="col-span-8 text-xs font-bold text-[var(--cx-text-secondary)] uppercase tracking-widest self-center">
              Totales
            </div>
            <div className="col-span-2 text-right font-mono text-sm font-bold text-[var(--cx-text-primary)]">
              {formatCLP(totalDebit)}
            </div>
            <div className="col-span-1 text-right font-mono text-sm font-bold text-[var(--cx-text-primary)]">
              {formatCLP(totalCredit)}
            </div>
            <div className="col-span-1" />
          </div>

          {/* Difference indicator */}
          <div className={`px-4 py-2 text-xs font-semibold text-center ${
            balanced
              ? 'bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border-t border-[var(--cx-status-ok-border)]'
              : 'bg-[var(--cx-status-error-bg)] text-[var(--cx-status-error-text)] border-t border-[var(--cx-status-error-border)]'
          }`}>
            {balanced
              ? 'Asiento cuadrado'
              : `Diferencia: ${formatCLP(diff)} — El asiento no esta cuadrado`
            }
          </div>
        </div>

        {errors.lines && typeof errors.lines.message === 'string' && (
          <div className="text-xs text-[var(--cx-status-error-text)]">{errors.lines.message}</div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isBusy}
            className="btn-secondary flex-1 justify-center"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar Borrador
          </button>
          <button
            type="button"
            onClick={handleSubmit(onPost)}
            disabled={isBusy}
            className="btn-primary flex-1 justify-center"
          >
            {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Publicar
          </button>
          <Link
            href="/dashboard/contabilidad/libro-diario"
            className="btn-secondary"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
