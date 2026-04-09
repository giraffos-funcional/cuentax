/**
 * CUENTAX — Nueva Cotizacion
 * Formulario para crear un nuevo presupuesto.
 * Items dinamicos con calculo automatico de neto/IVA/total.
 */

'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Trash2, Save, Send, Loader2,
} from 'lucide-react'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { formatCLP } from '@/lib/formatters'

// ── Types ────────────────────────────────────────────────────

interface ItemRow {
  key: number
  nombre: string
  cantidad: number
  precio_unitario: number
  descuento: number
  exento: boolean
}

function emptyItem(key: number): ItemRow {
  return { key, nombre: '', cantidad: 1, precio_unitario: 0, descuento: 0, exento: false }
}

function calcItem(item: ItemRow) {
  const neto = Math.round(item.cantidad * item.precio_unitario * (1 - item.descuento / 100))
  const iva = item.exento ? 0 : Math.round(neto * 0.19)
  const total = neto + iva
  return { neto, iva, total }
}

// ── Page ─────────────────────────────────────────────────────

export default function NuevaCotizacionPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  // Client fields
  const [rutReceptor, setRutReceptor] = useState('')
  const [razonSocial, setRazonSocial] = useState('')
  const [giroReceptor, setGiroReceptor] = useState('')
  const [emailReceptor, setEmailReceptor] = useState('')

  // Dates
  const today = new Date().toISOString().split('T')[0]
  const defaultExpiry = new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0]
  const [validaHasta, setValidaHasta] = useState(defaultExpiry)

  // Items
  const [keyCounter, setKeyCounter] = useState(2)
  const [items, setItems] = useState<ItemRow[]>([emptyItem(1)])

  // Observaciones
  const [observaciones, setObservaciones] = useState('')

  const addItem = useCallback(() => {
    setItems(prev => [...prev, emptyItem(keyCounter)])
    setKeyCounter(k => k + 1)
  }, [keyCounter])

  const removeItem = useCallback((key: number) => {
    setItems(prev => prev.length > 1 ? prev.filter(i => i.key !== key) : prev)
  }, [])

  const updateItem = useCallback((key: number, field: keyof ItemRow, value: string | number | boolean) => {
    setItems(prev => prev.map(i => i.key === key ? { ...i, [field]: value } : i))
  }, [])

  // Totals
  const totals = useMemo(() => {
    let neto = 0, exento = 0, iva = 0
    for (const item of items) {
      const c = calcItem(item)
      if (item.exento) {
        exento += c.neto
      } else {
        neto += c.neto
        iva += c.iva
      }
    }
    return { neto, exento, iva, total: neto + exento + iva }
  }, [items])

  // Validation
  const isValid = rutReceptor.length >= 9 && razonSocial.length >= 2 && items.every(i => i.nombre.length > 0 && i.cantidad > 0)

  async function handleSave(enviar: boolean) {
    if (!isValid || saving) return
    setSaving(true)

    try {
      const payload = {
        rut_receptor: rutReceptor,
        razon_social_receptor: razonSocial,
        giro_receptor: giroReceptor || undefined,
        email_receptor: emailReceptor || undefined,
        items: items.map(i => ({
          nombre: i.nombre,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
          descuento: i.descuento,
          exento: i.exento,
        })),
        valida_hasta: validaHasta,
        observaciones: observaciones || undefined,
      }

      const { data: created } = await apiClient.post('/api/v1/cotizaciones', payload)

      // If enviar, also send
      if (enviar && created?.id) {
        await apiClient.post(`/api/v1/cotizaciones/${created.id}/enviar`)
      }

      router.push('/dashboard/cotizaciones')
    } catch (err: any) {
      alert(err?.response?.data?.message ?? err?.response?.data?.details ? JSON.stringify(err.response.data.details) : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/cotizaciones"
          className="p-2 rounded-lg text-[var(--cx-text-secondary)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)]"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Nuevo Presupuesto</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">Crea una cotizacion para tu cliente</p>
        </div>
      </div>

      {/* Client Info */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[var(--cx-text-primary)] uppercase tracking-wide">Datos del Cliente</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--cx-text-muted)] mb-1">RUT *</label>
            <input
              type="text"
              value={rutReceptor}
              onChange={e => setRutReceptor(e.target.value)}
              placeholder="12.345.678-9"
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--cx-text-muted)] mb-1">Razon Social *</label>
            <input
              type="text"
              value={razonSocial}
              onChange={e => setRazonSocial(e.target.value)}
              placeholder="Empresa ABC Ltda."
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--cx-text-muted)] mb-1">Giro</label>
            <input
              type="text"
              value={giroReceptor}
              onChange={e => setGiroReceptor(e.target.value)}
              placeholder="Servicios de tecnologia"
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--cx-text-muted)] mb-1">Email</label>
            <input
              type="email"
              value={emailReceptor}
              onChange={e => setEmailReceptor(e.target.value)}
              placeholder="contacto@empresa.cl"
              className="input-field w-full"
            />
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--cx-text-primary)] uppercase tracking-wide">Items</h2>
          <button onClick={addItem} className="flex items-center gap-1 text-xs font-medium text-[var(--cx-active-icon)] hover:underline">
            <Plus size={14} /> Agregar item
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--cx-border-light)]">
                <th className="text-left p-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">Producto/Servicio</th>
                <th className="text-center p-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)] w-20">Cant.</th>
                <th className="text-right p-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)] w-28">Precio Unit.</th>
                <th className="text-center p-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)] w-20">Dcto %</th>
                <th className="text-center p-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)] w-16">Exento</th>
                <th className="text-right p-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)] w-24">Neto</th>
                <th className="text-right p-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)] w-24">IVA</th>
                <th className="text-right p-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)] w-28">Total</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const c = calcItem(item)
                return (
                  <tr key={item.key} className="border-b border-[var(--cx-border-light)] last:border-0">
                    <td className="p-2">
                      <input
                        type="text"
                        value={item.nombre}
                        onChange={e => updateItem(item.key, 'nombre', e.target.value)}
                        placeholder="Descripcion del item"
                        className="input-field w-full text-sm"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min={1}
                        value={item.cantidad}
                        onChange={e => updateItem(item.key, 'cantidad', Number(e.target.value))}
                        className="input-field w-full text-center text-sm"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min={0}
                        value={item.precio_unitario}
                        onChange={e => updateItem(item.key, 'precio_unitario', Number(e.target.value))}
                        className="input-field w-full text-right text-sm"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={item.descuento}
                        onChange={e => updateItem(item.key, 'descuento', Number(e.target.value))}
                        className="input-field w-full text-center text-sm"
                      />
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={item.exento}
                        onChange={e => updateItem(item.key, 'exento', e.target.checked)}
                        className="w-4 h-4 rounded border-[var(--cx-border-light)] accent-[var(--cx-active-icon)]"
                      />
                    </td>
                    <td className="p-2 text-right text-[var(--cx-text-secondary)] font-mono text-xs">{formatCLP(c.neto)}</td>
                    <td className="p-2 text-right text-[var(--cx-text-secondary)] font-mono text-xs">{formatCLP(c.iva)}</td>
                    <td className="p-2 text-right text-[var(--cx-text-primary)] font-semibold font-mono text-xs">{formatCLP(c.total)}</td>
                    <td className="p-2">
                      <button
                        onClick={() => removeItem(item.key)}
                        className="p-1 rounded text-[var(--cx-text-muted)] hover:text-red-500"
                        disabled={items.length <= 1}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-64 space-y-2 pt-3 border-t border-[var(--cx-border-light)]">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--cx-text-secondary)]">Subtotal Neto</span>
              <span className="text-[var(--cx-text-primary)] font-mono">{formatCLP(totals.neto)}</span>
            </div>
            {totals.exento > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[var(--cx-text-secondary)]">Exento</span>
                <span className="text-[var(--cx-text-primary)] font-mono">{formatCLP(totals.exento)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-[var(--cx-text-secondary)]">IVA 19%</span>
              <span className="text-[var(--cx-text-primary)] font-mono">{formatCLP(totals.iva)}</span>
            </div>
            <div className="flex justify-between text-base font-bold pt-2 border-t border-[var(--cx-border-light)]">
              <span className="text-[var(--cx-text-primary)]">Total</span>
              <span className="text-[var(--cx-text-primary)] font-mono">{formatCLP(totals.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Extra Fields */}
      <div className="card p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--cx-text-muted)] mb-1">Valida hasta *</label>
            <input
              type="date"
              value={validaHasta}
              onChange={e => setValidaHasta(e.target.value)}
              min={today}
              className="input-field w-full"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-[var(--cx-text-muted)] mb-1">Observaciones</label>
          <textarea
            value={observaciones}
            onChange={e => setObservaciones(e.target.value)}
            rows={3}
            placeholder="Notas adicionales para el cliente..."
            className="input-field w-full resize-none"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Link
          href="/dashboard/cotizaciones"
          className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--cx-text-secondary)] hover:text-[var(--cx-text-primary)] border border-[var(--cx-border-light)]"
        >
          Cancelar
        </Link>
        <button
          disabled={!isValid || saving}
          onClick={() => handleSave(false)}
          className="btn-primary flex items-center gap-2 disabled:opacity-40"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar Borrador
        </button>
        <button
          disabled={!isValid || saving}
          onClick={() => handleSave(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-40"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Guardar y Enviar
        </button>
      </div>
    </div>
  )
}
