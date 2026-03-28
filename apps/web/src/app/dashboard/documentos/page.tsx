/**
 * CUENTAX — Gestión de Documentos (Ciclo de Vida)
 * Mia: "Una tabla premium con filtros en línea, acciones contextuales,
 * y preview de estado en tiempo real. Como Linear pero para facturas."
 */

'use client'

import { useState } from 'react'
import { Search, Filter, Download, RefreshCw, FileText, Eye,
         MoreHorizontal, ArrowUpDown, ChevronDown, CheckCircle2,
         Clock, XCircle, AlertTriangle } from 'lucide-react'

type DTEStatus = 'borrador' | 'enviado' | 'aceptado' | 'rechazado' | 'anulado'
type DTETipo = 'Factura' | 'Boleta' | 'Nota Crédito' | 'Nota Débito'

interface DTE {
  id: string
  folio: number
  tipo: DTETipo
  receptor_nombre: string
  receptor_rut: string
  fecha: string
  monto: number
  status: DTEStatus
  track_id?: string
}

const MOCK_DOCUMENTS: DTE[] = [
  { id: '1', folio: 1043, tipo: 'Factura',      receptor_nombre: 'Empresa ABC Ltda.',    receptor_rut: '12.345.678-9', fecha: '2026-03-26', monto: 1250000, status: 'aceptado',  track_id: 'T001' },
  { id: '2', folio: 1042, tipo: 'Boleta',       receptor_nombre: 'Cliente Persona',       receptor_rut: '9.876.543-2',  fecha: '2026-03-26', monto: 45900,   status: 'aceptado',  track_id: 'T002' },
  { id: '3', folio: 1041, tipo: 'Factura',      receptor_nombre: 'Tech Solutions SpA',    receptor_rut: '76.543.210-K', fecha: '2026-03-25', monto: 890000,  status: 'enviado',   track_id: 'T003' },
  { id: '4', folio: 1040, tipo: 'Nota Crédito', receptor_nombre: 'Empresa ABC Ltda.',    receptor_rut: '12.345.678-9', fecha: '2026-03-25', monto: 125000,  status: 'aceptado',  track_id: 'T004' },
  { id: '5', folio: 1039, tipo: 'Factura',      receptor_nombre: 'Import & Co.',          receptor_rut: '99.887.766-5', fecha: '2026-03-24', monto: 2100000, status: 'rechazado' },
  { id: '6', folio: 1038, tipo: 'Boleta',       receptor_nombre: 'Cliente sin RFC',       receptor_rut: '55.443.322-1', fecha: '2026-03-23', monto: 23800,   status: 'anulado' },
  { id: '7', folio: 1037, tipo: 'Nota Débito',  receptor_nombre: 'Supplier Group Ltda.',  receptor_rut: '88.776.655-4', fecha: '2026-03-22', monto: 340000,  status: 'aceptado',  track_id: 'T007' },
]

const STATUS_CONFIG: Record<DTEStatus, { label: string, icon: typeof CheckCircle2, cls: string }> = {
  borrador:  { label: 'Borrador',  icon: Clock,         cls: 'badge-dte-draft' },
  enviado:   { label: 'Enviado',   icon: RefreshCw,     cls: 'badge-dte-sent' },
  aceptado:  { label: 'Aceptado', icon: CheckCircle2,   cls: 'badge-dte-accepted' },
  rechazado: { label: 'Rechaz.',  icon: XCircle,         cls: 'badge-dte-rejected' },
  anulado:   { label: 'Anulado',  icon: AlertTriangle,  cls: 'badge-dte-cancelled' },
}

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

export default function DocumentosPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<DTEStatus | 'todos'>('todos')
  const [tipoFilter, setTipoFilter]   = useState<DTETipo | 'todos'>('todos')
  const [selected, setSelected]       = useState<Set<string>>(new Set())

  const filtered = MOCK_DOCUMENTS.filter((d) => {
    const matchSearch = !search || d.receptor_nombre.toLowerCase().includes(search.toLowerCase()) ||
                        String(d.folio).includes(search)
    const matchStatus = statusFilter === 'todos' || d.status === statusFilter
    const matchTipo   = tipoFilter === 'todos' || d.tipo === tipoFilter
    return matchSearch && matchStatus && matchTipo
  })

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const totalPage = filtered.reduce((s, d) => s + d.monto, 0)

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Documentos</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">{filtered.length} documentos · {formatCLP(totalPage)} total</p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <button className="btn-secondary flex items-center gap-2">
              <Download size={13} />{selected.size} seleccionados
            </button>
          )}
          <button className="btn-primary" onClick={() => window.location.href = '/dashboard/emitir'}>
            + Nuevo DTE
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por receptor, folio..."
            className="input-field pl-8 py-2 text-sm"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="input-field w-auto py-2 text-sm pr-8"
        >
          <option value="todos">Todos los estados</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <select
          value={tipoFilter}
          onChange={(e) => setTipoFilter(e.target.value as any)}
          className="input-field w-auto py-2 text-sm pr-8"
        >
          <option value="todos">Todos los tipos</option>
          {['Factura', 'Boleta', 'Nota Crédito', 'Nota Débito'].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-[var(--cx-border-light)] text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest">
          <div className="col-span-1">
            <input type="checkbox" className="rounded" />
          </div>
          <div className="col-span-1 flex items-center gap-1 cursor-pointer hover:text-[var(--cx-text-secondary)]">Folio <ArrowUpDown size={9} /></div>
          <div className="col-span-2">Tipo</div>
          <div className="col-span-3">Receptor</div>
          <div className="col-span-2">Fecha</div>
          <div className="col-span-2 text-right">Monto</div>
          <div className="col-span-1 text-center">Estado</div>
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-[var(--cx-text-muted)]">
            <FileText size={28} />
            <p className="text-sm">No hay documentos que coincidan</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--cx-border-light)]">
            {filtered.map((doc) => {
              const statusConf = STATUS_CONFIG[doc.status]
              return (
                <div
                  key={doc.id}
                  className={`grid grid-cols-12 gap-3 px-4 py-3.5 items-center hover:bg-[var(--cx-hover-bg)] transition-colors group ${selected.has(doc.id) ? 'bg-[var(--cx-active-bg)]' : ''}`}
                >
                  <div className="col-span-1">
                    <input
                      type="checkbox"
                      checked={selected.has(doc.id)}
                      onChange={() => toggleSelect(doc.id)}
                      className="rounded border-slate-700 accent-violet-500"
                    />
                  </div>
                  <div className="col-span-1 text-sm font-mono text-[var(--cx-text-primary)] font-semibold">#{doc.folio}</div>
                  <div className="col-span-2">
                    <span className="badge-dte bg-[var(--cx-bg-elevated)] text-[var(--cx-text-secondary)] border border-[var(--cx-border-light)]">
                      {doc.tipo}
                    </span>
                  </div>
                  <div className="col-span-3 min-w-0">
                    <p className="text-sm text-[var(--cx-text-primary)] truncate font-medium">{doc.receptor_nombre}</p>
                    <p className="text-[11px] text-[var(--cx-text-muted)]">{doc.receptor_rut}</p>
                  </div>
                  <div className="col-span-2 text-sm text-[var(--cx-text-secondary)]">{doc.fecha}</div>
                  <div className="col-span-2 text-right text-sm font-semibold text-[var(--cx-text-primary)]">{formatCLP(doc.monto)}</div>
                  <div className="col-span-1 flex items-center justify-center">
                    <span className={statusConf.cls}>{statusConf.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[var(--cx-border-light)] flex items-center justify-between">
          <p className="text-xs text-[var(--cx-text-muted)]">{filtered.length} documentos</p>
          <p className="text-sm font-semibold text-[var(--cx-text-primary)]">Total: {formatCLP(totalPage)}</p>
        </div>
      </div>
    </div>
  )
}
