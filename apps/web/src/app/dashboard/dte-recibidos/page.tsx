/**
 * CUENTAX — DTEs Recibidos
 * Listado de DTEs que llegan de proveedores. Permite subir manualmente un EnvioDTE
 * y responder con acuse + aceptación/rechazo comercial (Ley 19.983 — 8 días).
 */

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Upload, CheckCircle2, XCircle, AlertTriangle, Loader2, FileText, RefreshCw,
} from 'lucide-react'
import { apiClient } from '@/lib/api-client'

type DTERecibido = {
  id: number
  tipo_dte: number
  folio: number
  rut_emisor: string
  razon_social_emisor: string | null
  fecha_emision: string
  monto_total: number
  estado_respuesta: string
  fecha_recibido: string
  fecha_respuesta: string | null
  glosa_respuesta: string | null
}

const tipoLabel = (t: number) =>
  t === 33 ? 'Factura' : t === 34 ? 'Factura Exenta' : t === 39 ? 'Boleta'
  : t === 41 ? 'Boleta Exenta' : t === 56 ? 'Nota Débito' : t === 61 ? 'Nota Crédito'
  : `Tipo ${t}`

const estadoBadge: Record<string, string> = {
  pendiente: 'bg-amber-100 text-amber-700 border-amber-200',
  acuse_enviado: 'bg-blue-100 text-blue-700 border-blue-200',
  aceptado: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rechazado: 'bg-rose-100 text-rose-700 border-rose-200',
  reclamado: 'bg-rose-100 text-rose-700 border-rose-200',
}

const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

export default function DTERecibidosPage() {
  const [items, setItems] = useState<DTERecibido[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [respondingId, setRespondingId] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await apiClient.get('/api/v1/dte-recibidos')
      setItems(data?.items ?? [])
    } catch (err: any) {
      setMsg({ type: 'error', text: err?.message ?? 'Error cargando DTEs' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await apiClient.post('/api/v1/dte-recibidos/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setMsg({ type: 'ok', text: `Cargado: ${data.created_count} DTE(s) nuevos de ${data.total_in_envelope} en el envelope` })
      await fetchItems()
    } catch (err: any) {
      setMsg({ type: 'error', text: err?.response?.data?.message ?? err?.message ?? 'Error al subir' })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
      setTimeout(() => setMsg(null), 5000)
    }
  }

  const handleResponder = async (id: number, aceptar: boolean) => {
    const glosa = prompt(aceptar
      ? 'Glosa de aceptación (opcional):'
      : 'Motivo del rechazo (opcional):'
    ) || ''
    if (!aceptar && !confirm('¿Confirmás rechazar este DTE? El emisor recibirá un ResultadoDTE con rechazo comercial.')) return

    setRespondingId(id)
    setMsg(null)
    try {
      await apiClient.post(`/api/v1/dte-recibidos/${id}/responder`, { aceptar, glosa })
      setMsg({ type: 'ok', text: aceptar ? 'DTE aceptado y respuesta enviada' : 'DTE rechazado y respuesta enviada' })
      await fetchItems()
    } catch (err: any) {
      setMsg({ type: 'error', text: err?.response?.data?.message ?? 'Error al responder' })
    } finally {
      setRespondingId(null)
      setTimeout(() => setMsg(null), 5000)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">DTEs Recibidos</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            Facturas y notas que recibís de proveedores. Tenés <b>8 días</b> para responder (Ley 19.983).
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchItems}
            disabled={loading}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refrescar
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="btn-primary flex items-center gap-2"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Subir EnvioDTE
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xml,application/xml,text/xml"
            onChange={handleUpload}
            className="hidden"
          />
        </div>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border ${
          msg.type === 'ok'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-rose-50 text-rose-700 border-rose-200'
        }`}>
          {msg.type === 'ok' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {msg.text}
        </div>
      )}

      <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center text-sm text-[var(--cx-text-muted)]">
            <Loader2 size={16} className="animate-spin mr-2" /> Cargando...
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <FileText size={32} className="mx-auto text-[var(--cx-text-muted)] mb-3" />
            <p className="text-sm font-semibold text-[var(--cx-text-primary)]">Sin DTEs recibidos</p>
            <p className="text-xs text-[var(--cx-text-muted)] mt-1">
              Subí un archivo XML con un EnvioDTE recibido de un proveedor para empezar.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[var(--cx-bg-elevated)] text-xs uppercase tracking-wide text-[var(--cx-text-muted)]">
              <tr>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Folio</th>
                <th className="px-4 py-3 text-left">Emisor</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cx-border-light)]">
              {items.map(d => (
                <tr key={d.id} className="hover:bg-[var(--cx-bg-elevated)]">
                  <td className="px-4 py-3 font-semibold">{tipoLabel(d.tipo_dte)}</td>
                  <td className="px-4 py-3 font-mono">{d.folio}</td>
                  <td className="px-4 py-3">
                    <div>{d.razon_social_emisor || '—'}</div>
                    <div className="text-[10px] text-[var(--cx-text-muted)]">{d.rut_emisor}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{d.fecha_emision}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmtCLP(d.monto_total)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wide ${estadoBadge[d.estado_respuesta] ?? estadoBadge.pendiente}`}>
                      {d.estado_respuesta}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {d.estado_respuesta === 'pendiente' && (
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => handleResponder(d.id, true)}
                          disabled={respondingId === d.id}
                          className="px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100"
                        >
                          {respondingId === d.id ? <Loader2 size={12} className="animate-spin" /> : 'Aceptar'}
                        </button>
                        <button
                          onClick={() => handleResponder(d.id, false)}
                          disabled={respondingId === d.id}
                          className="px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold hover:bg-rose-100"
                        >
                          Rechazar
                        </button>
                      </div>
                    )}
                    {d.estado_respuesta !== 'pendiente' && d.fecha_respuesta && (
                      <span className="text-[10px] text-[var(--cx-text-muted)]">
                        {new Date(d.fecha_respuesta).toLocaleString('es-CL')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-700">
        <p className="font-semibold mb-1">📨 Próximamente: recepción automática vía email</p>
        <p>
          Estamos trabajando en un listener IMAP que va a procesar tu casilla DTE
          (configurada en Empresa → Facturación Electrónica) y dejar los DTEs acá automáticamente.
          Por ahora, descargá el XML del proveedor y subilo manualmente.
        </p>
      </div>
    </div>
  )
}
