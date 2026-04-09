/**
 * CUENTAX — Detalle de Solicitud de Compra
 * Vista detallada con acciones segun estado.
 */

'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Send, CheckCircle2, XCircle, Trash2,
  Edit, Loader2, AlertCircle, ShoppingCart, Package,
  LinkIcon,
} from 'lucide-react'
import { usePedidoCompra, usePedidoCompraAction, useDeletePedidoCompra } from '@/hooks'
import { formatCLP } from '@/lib/formatters'

// ── Status Config ────────────────────────────────────────────

type PedidoStatus = 'solicitud' | 'enviada' | 'confirmada' | 'recibida' | 'cancelada'

const STATUS_CONFIG: Record<PedidoStatus, { label: string; cls: string; icon: typeof Edit }> = {
  solicitud:   { label: 'Solicitud',   cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',             icon: Edit },
  enviada:     { label: 'Enviada',     cls: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',               icon: Send },
  confirmada:  { label: 'Confirmada',  cls: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',           icon: CheckCircle2 },
  recibida:    { label: 'Recibida',    cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',   icon: Package },
  cancelada:   { label: 'Cancelada',   cls: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',                   icon: XCircle },
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status as PedidoStatus] ?? STATUS_CONFIG.solicitud
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold ${config.cls}`}>
      <Icon size={12} />
      {config.label}
    </span>
  )
}

// ── Page ─────────────────────────────────────────────────────

export default function PedidoCompraDetallePage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const { pedido, isLoading, error, mutate } = usePedidoCompra(id)
  const { execute } = usePedidoCompraAction()
  const { remove } = useDeletePedidoCompra()

  async function handleAction(action: string, body?: Record<string, unknown>) {
    if (!pedido) return
    try {
      await execute(pedido.id, action, body)
      mutate()
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Error al ejecutar accion')
    }
  }

  async function handleDelete() {
    if (!pedido || !confirm(`Eliminar solicitud #${pedido.numero}?`)) return
    try {
      await remove(pedido.id)
      router.push('/dashboard/compras/solicitudes')
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Error al eliminar')
    }
  }

  async function handleVincularFactura() {
    const dteIdStr = prompt('Ingrese el ID del DTE (factura recibida del RCV):')
    if (!dteIdStr) return
    const dteId = Number(dteIdStr)
    if (isNaN(dteId) || dteId <= 0) { alert('ID invalido'); return }
    await handleAction('vincular-factura', { dte_id: dteId })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-[var(--cx-active-icon)]" />
        <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando pedido...</span>
      </div>
    )
  }

  if (error || !pedido) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Link href="/dashboard/compras/solicitudes" className="flex items-center gap-2 text-sm text-[var(--cx-text-secondary)] hover:text-[var(--cx-text-primary)]">
          <ArrowLeft size={16} /> Volver
        </Link>
        <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
          <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
          <span className="text-sm text-[var(--cx-status-error-text)]">Pedido no encontrado</span>
        </div>
      </div>
    )
  }

  const items = (pedido.items_json as any[]) ?? []
  const estado = pedido.estado as PedidoStatus

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
            href="/dashboard/compras/solicitudes"
            className="p-2 rounded-lg text-[var(--cx-text-secondary)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)]"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Pedido de Compra #{pedido.numero}</h1>
              <StatusBadge status={estado} />
            </div>
            <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
              Creado el {pedido.fecha}{pedido.fecha_entrega ? ` | Entrega: ${pedido.fecha_entrega}` : ''}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {estado === 'solicitud' && (
            <>
              <button
                onClick={() => handleAction('enviar')}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors"
              >
                <Send size={14} /> Enviar al Proveedor
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
                onClick={() => handleAction('confirmar')}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors"
              >
                <CheckCircle2 size={14} /> Confirmar Pedido
              </button>
              <button
                onClick={() => handleAction('cancelar')}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-500 border border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20 transition-colors"
              >
                <XCircle size={14} /> Cancelar
              </button>
            </>
          )}
          {estado === 'confirmada' && (
            <>
              <button
                onClick={() => handleAction('recibir')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/25"
              >
                <Package size={16} /> Marcar Recibida
              </button>
              <button
                onClick={() => handleAction('cancelar')}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-500 border border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20 transition-colors"
              >
                <XCircle size={14} /> Cancelar
              </button>
            </>
          )}
          {estado === 'recibida' && (
            <button
              onClick={handleVincularFactura}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-[var(--cx-active-icon)] border border-[var(--cx-active-border)] hover:bg-[var(--cx-active-bg)] transition-colors"
            >
              <LinkIcon size={14} /> Vincular Factura
            </button>
          )}
        </div>
      </div>

      {/* Supplier Info Card */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-[var(--cx-text-primary)] uppercase tracking-wide mb-3">Datos del Proveedor</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-wide">RUT</p>
            <p className="text-sm text-[var(--cx-text-primary)] font-mono">{pedido.rut_proveedor}</p>
          </div>
          <div>
            <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-wide">Razon Social</p>
            <p className="text-sm text-[var(--cx-text-primary)]">{pedido.razon_social_proveedor}</p>
          </div>
          {pedido.email_proveedor && (
            <div>
              <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-wide">Email</p>
              <p className="text-sm text-[var(--cx-text-primary)]">{pedido.email_proveedor}</p>
            </div>
          )}
          {pedido.fecha_entrega && (
            <div>
              <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-wide">Fecha de Entrega</p>
              <p className="text-sm text-[var(--cx-text-primary)]">{pedido.fecha_entrega}</p>
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
              <span className="text-[var(--cx-text-primary)] font-mono">{formatCLP(pedido.monto_total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Observaciones */}
      {pedido.observaciones && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--cx-text-primary)] uppercase tracking-wide mb-2">Observaciones</h2>
          <p className="text-sm text-[var(--cx-text-secondary)] whitespace-pre-wrap">{pedido.observaciones}</p>
        </div>
      )}

      {/* Linked DTE (if exists) */}
      {pedido.dte_document_id && (
        <div className="card p-5 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10">
          <h2 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide mb-3 flex items-center gap-2">
            <LinkIcon size={14} /> Factura Vinculada
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-[var(--cx-text-muted)] uppercase tracking-wide">ID Documento</p>
              <p className="text-sm text-[var(--cx-text-primary)] font-mono">{pedido.dte_document_id}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
