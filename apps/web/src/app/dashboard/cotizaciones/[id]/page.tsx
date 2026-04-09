/**
 * CUENTAX — Detalle de Cotizacion
 * Vista detallada con acciones segun estado.
 */

'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Send, CheckCircle2, XCircle, Receipt, Trash2,
  Edit, Loader2, AlertCircle, FileText, ExternalLink, Clock,
  ArrowRight,
} from 'lucide-react'
import { useCotizacion, useCotizacionAction, useDeleteCotizacion } from '@/hooks'
import { formatCLP } from '@/lib/formatters'

// ── Status Config ────────────────────────────────────────────

type CotizacionStatus = 'borrador' | 'enviada' | 'aceptada' | 'rechazada' | 'expirada' | 'convertida'

const STATUS_CONFIG: Record<CotizacionStatus, { label: string; cls: string; icon: typeof Edit }> = {
  borrador:   { label: 'Borrador',    cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',       icon: Edit },
  enviada:    { label: 'Enviada',     cls: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',         icon: Send },
  aceptada:   { label: 'Aceptada',    cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400', icon: CheckCircle2 },
  rechazada:  { label: 'Rechazada',   cls: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',             icon: XCircle },
  expirada:   { label: 'Expirada',    cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',           icon: Clock },
  convertida: { label: 'Convertida',  cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400', icon: ArrowRight },
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status as CotizacionStatus] ?? STATUS_CONFIG.borrador
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold ${config.cls}`}>
      <Icon size={12} />
      {config.label}
    </span>
  )
}

// ── Page ─────────────────────────────────────────────────────

export default function CotizacionDetallePage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const { cotizacion, isLoading, error, mutate } = useCotizacion(id)
  const { ejecutar } = useCotizacionAction()
  const { remove } = useDeleteCotizacion()

  async function handleAction(action: 'enviar' | 'aceptar' | 'rechazar' | 'facturar') {
    if (!cotizacion) return
    try {
      const result = await ejecutar(cotizacion.id, action)
      mutate()
      if (action === 'facturar' && result?.dte?.id) {
        router.push('/dashboard/ventas')
      }
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Error al ejecutar accion')
    }
  }

  async function handleDelete() {
    if (!cotizacion || !confirm(`Eliminar presupuesto #${cotizacion.numero}?`)) return
    try {
      await remove(cotizacion.id)
      router.push('/dashboard/cotizaciones')
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Error al eliminar')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-[var(--cx-active-icon)]" />
        <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando cotizacion...</span>
      </div>
    )
  }

  if (error || !cotizacion) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Link href="/dashboard/cotizaciones" className="flex items-center gap-2 text-sm text-[var(--cx-text-secondary)] hover:text-[var(--cx-text-primary)]">
          <ArrowLeft size={16} /> Volver
        </Link>
        <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
          <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
          <span className="text-sm text-[var(--cx-status-error-text)]">Cotizacion no encontrada</span>
        </div>
      </div>
    )
  }

  const items = (cotizacion.items_json as any[]) ?? []
  const estado = cotizacion.estado as CotizacionStatus

  // Calculate totals from items
  let montoNeto = 0, montoExento = 0, montoIva = 0
  for (const item of items) {
    const neto = item.neto ?? 0
    const iva = item.iva ?? 0
    if (item.exento) {
      montoExento += neto
    } else {
      montoNeto += neto
      montoIva += iva
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/cotizaciones"
            className="p-2 rounded-lg text-[var(--cx-text-secondary)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)]"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Presupuesto #{cotizacion.numero}</h1>
              <StatusBadge status={estado} />
            </div>
            <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
              Creado el {cotizacion.fecha} | Valido hasta {cotizacion.valida_hasta}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {estado === 'borrador' && (
            <>
              <button
                onClick={() => handleAction('enviar')}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors"
              >
                <Send size={14} /> Enviar
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-500 border border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 size={14} /> Eliminar
              </button>
            </>
          )}
          {estado === 'enviada' && (
            <>
              <button
                onClick={() => handleAction('aceptar')}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
              >
                <CheckCircle2 size={14} /> Marcar Aceptada
              </button>
              <button
                onClick={() => handleAction('rechazar')}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-500 border border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20 transition-colors"
              >
                <XCircle size={14} /> Marcar Rechazada
              </button>
            </>
          )}
          {estado === 'aceptada' && (
            <button
              onClick={() => handleAction('facturar')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/25"
            >
              <Receipt size={16} /> Convertir a Factura
            </button>
          )}
          {estado === 'convertida' && cotizacion.dte_id && (
            <Link
              href={`/dashboard/ventas`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-[var(--cx-active-icon)] border border-[var(--cx-active-border)] hover:bg-[var(--cx-active-bg)] transition-colors"
            >
              <ExternalLink size={14} /> Ver Factura Generada
            </Link>
          )}
        </div>
      </div>

      {/* Client Info Card */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-[var(--cx-text-primary)] uppercase tracking-wide mb-3">Datos del Cliente</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-wide">RUT</p>
            <p className="text-sm text-[var(--cx-text-primary)] font-mono">{cotizacion.rut_receptor}</p>
          </div>
          <div>
            <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-wide">Razon Social</p>
            <p className="text-sm text-[var(--cx-text-primary)]">{cotizacion.razon_social_receptor}</p>
          </div>
          {cotizacion.giro_receptor && (
            <div>
              <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-wide">Giro</p>
              <p className="text-sm text-[var(--cx-text-primary)]">{cotizacion.giro_receptor}</p>
            </div>
          )}
          {cotizacion.email_receptor && (
            <div>
              <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-wide">Email</p>
              <p className="text-sm text-[var(--cx-text-primary)]">{cotizacion.email_receptor}</p>
            </div>
          )}
        </div>
      </div>

      {/* Items Table */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-[var(--cx-text-primary)] uppercase tracking-wide mb-3">Items ({items.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--cx-border-light)]">
                <th className="text-left p-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">Producto/Servicio</th>
                <th className="text-center p-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">Cant.</th>
                <th className="text-right p-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">Precio Unit.</th>
                <th className="text-center p-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">Dcto %</th>
                <th className="text-center p-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">Exento</th>
                <th className="text-right p-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">Neto</th>
                <th className="text-right p-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">IVA</th>
                <th className="text-right p-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any, i: number) => (
                <tr key={i} className="border-b border-[var(--cx-border-light)] last:border-0">
                  <td className="p-2 text-[var(--cx-text-primary)]">{item.nombre}</td>
                  <td className="p-2 text-center text-[var(--cx-text-secondary)]">{item.cantidad}</td>
                  <td className="p-2 text-right text-[var(--cx-text-secondary)] font-mono">{formatCLP(item.precio_unitario)}</td>
                  <td className="p-2 text-center text-[var(--cx-text-secondary)]">{item.descuento ?? 0}%</td>
                  <td className="p-2 text-center text-[var(--cx-text-secondary)]">{item.exento ? 'Si' : 'No'}</td>
                  <td className="p-2 text-right text-[var(--cx-text-secondary)] font-mono">{formatCLP(item.neto ?? 0)}</td>
                  <td className="p-2 text-right text-[var(--cx-text-secondary)] font-mono">{formatCLP(item.iva ?? 0)}</td>
                  <td className="p-2 text-right text-[var(--cx-text-primary)] font-semibold font-mono">{formatCLP(item.total ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end mt-4">
          <div className="w-64 space-y-2 pt-3 border-t border-[var(--cx-border-light)]">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--cx-text-secondary)]">Subtotal Neto</span>
              <span className="text-[var(--cx-text-primary)] font-mono">{formatCLP(montoNeto)}</span>
            </div>
            {montoExento > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[var(--cx-text-secondary)]">Exento</span>
                <span className="text-[var(--cx-text-primary)] font-mono">{formatCLP(montoExento)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-[var(--cx-text-secondary)]">IVA 19%</span>
              <span className="text-[var(--cx-text-primary)] font-mono">{formatCLP(montoIva)}</span>
            </div>
            <div className="flex justify-between text-base font-bold pt-2 border-t border-[var(--cx-border-light)]">
              <span className="text-[var(--cx-text-primary)]">Total</span>
              <span className="text-[var(--cx-text-primary)] font-mono">{formatCLP(cotizacion.monto_total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Observaciones */}
      {cotizacion.observaciones && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--cx-text-primary)] uppercase tracking-wide mb-2">Observaciones</h2>
          <p className="text-sm text-[var(--cx-text-secondary)] whitespace-pre-wrap">{cotizacion.observaciones}</p>
        </div>
      )}

      {/* DTE Info (if converted) */}
      {cotizacion.dte && (
        <div className="card p-5 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10">
          <h2 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Receipt size={14} /> Factura Generada
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-wide">Tipo DTE</p>
              <p className="text-sm text-[var(--cx-text-primary)]">Factura (33)</p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-wide">Estado</p>
              <p className="text-sm text-[var(--cx-text-primary)] capitalize">{cotizacion.dte.estado}</p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-wide">Monto Total</p>
              <p className="text-sm text-[var(--cx-text-primary)] font-mono font-semibold">{formatCLP(cotizacion.dte.monto_total)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
