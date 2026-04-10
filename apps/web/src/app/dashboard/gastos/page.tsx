/**
 * CUENTAX — Gastos (Expenses)
 * Lista de gastos con KPIs, filtros, y acciones CRUD.
 * Los gastos se registran escaneando boletas/facturas con OCR.
 */
'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Search, Plus, Receipt, Loader2, AlertCircle,
  Trash2, Eye, Camera, CheckCircle2, Clock,
  ChevronLeft, ChevronRight, DollarSign, FileText, Filter,
  Image as ImageIcon,
} from 'lucide-react'
import { useGastos, useDeleteGasto } from '@/hooks'
import type { Gasto } from '@/hooks'
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

const TIPO_DOC_LABELS: Record<string, string> = {
  boleta: 'Boleta',
  factura: 'Factura',
  nota_credito: 'Nota de Credito',
  recibo: 'Recibo',
  otro: 'Otro',
}

// ── Loading State ──────────────────────────────────────────────
function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando gastos...</span>
    </div>
  )
}

// ── Error State ────────────────────────────────────────────────
function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando gastos'}</span>
    </div>
  )
}

// ── Empty State ────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 mb-4 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center shadow-sm">
        <Receipt size={28} className="text-violet-500" />
      </div>
      <p className="text-base font-semibold text-[var(--cx-text-primary)] mb-1">No tienes gastos registrados</p>
      <p className="text-sm text-[var(--cx-text-muted)] mb-5 max-w-xs">
        Escanea tu primera boleta o factura para comenzar a llevar el control de tus gastos
      </p>
      <Link
        href="/dashboard/gastos/escanear"
        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-bold hover:from-violet-700 hover:to-indigo-700 transition-all shadow-md shadow-violet-500/20"
      >
        <Camera size={14} /> Escanear Documento
      </Link>
    </div>
  )
}

// ── Delete Confirm Modal ───────────────────────────────────────
function DeleteConfirmModal({
  gasto,
  isDeleting,
  onConfirm,
  onClose,
}: {
  gasto: Gasto
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
              Eliminar gasto de <span className="font-semibold text-[var(--cx-text-primary)]">{gasto.emisor_razon_social || 'Sin emisor'}</span> por {formatCLP(gasto.monto_total)}?
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

// ── KPI Card ──────────────────────────────────────────────────
function KPICard({ icon: Icon, label, value, sub }: {
  icon: typeof DollarSign
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 flex items-center justify-center">
          <Icon size={16} className="text-[var(--cx-active-icon)]" />
        </div>
        <span className="text-xs font-medium text-[var(--cx-text-muted)] uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-lg font-bold text-[var(--cx-text-primary)]">{value}</p>
      {sub && <p className="text-xs text-[var(--cx-text-muted)] mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Gasto Card ────────────────────────────────────────────────
function GastoCard({
  gasto,
  onDelete,
}: {
  gasto: Gasto
  onDelete: (g: Gasto) => void
}) {
  return (
    <div className="card p-4 group hover:border-[var(--cx-border-hover)] transition-all">
      <div className="flex items-start gap-3">
        {/* Photo thumbnail */}
        <div className="w-14 h-14 rounded-xl bg-[var(--cx-bg-elevated)] border border-[var(--cx-border-light)] flex items-center justify-center overflow-hidden flex-shrink-0">
          {gasto.foto_url ? (
            <img
              src={gasto.foto_url}
              alt="Documento"
              className="w-full h-full object-cover"
            />
          ) : (
            <ImageIcon size={20} className="text-[var(--cx-text-muted)]" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--cx-text-primary)] truncate">
                {gasto.emisor_razon_social || 'Sin emisor'}
              </p>
              <p className="text-xs text-[var(--cx-text-muted)] font-mono">
                {gasto.emisor_rut || 'Sin RUT'}
              </p>
            </div>
            <p className="text-sm font-bold text-[var(--cx-text-primary)] whitespace-nowrap">
              {formatCLP(gasto.monto_total)}
            </p>
          </div>

          {/* Metadata row */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="badge-dte bg-[var(--cx-bg-elevated)] text-[var(--cx-text-secondary)] border border-[var(--cx-border-light)] text-[10px]">
              {TIPO_DOC_LABELS[gasto.tipo_documento] ?? gasto.tipo_documento}
            </span>
            {gasto.numero_documento && (
              <span className="text-[10px] font-mono text-[var(--cx-text-muted)]">
                #{gasto.numero_documento}
              </span>
            )}
            <span className="text-[10px] text-[var(--cx-text-muted)]">
              {formatDate(gasto.fecha_documento)}
            </span>
          </div>

          {/* Category + verification */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--cx-border-light)]">
            <div className="flex items-center gap-2">
              <span className="badge-dte bg-violet-50 text-violet-600 border border-violet-200 text-[10px]">
                {CATEGORIA_MAP[gasto.categoria] ?? gasto.categoria}
              </span>
              {gasto.verificado ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                  <CheckCircle2 size={10} /> Verificado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600">
                  <Clock size={10} /> Pendiente
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Link
                href={`/dashboard/gastos/${gasto.id}`}
                className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors"
              >
                <Eye size={12} />
              </Link>
              <button
                onClick={() => onDelete(gasto)}
                className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-status-error-text)] hover:bg-[var(--cx-status-error-bg)] transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────
export default function GastosPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [categoriaFilter, setCategoriaFilter] = useState('')
  const [verificadoFilter, setVerificadoFilter] = useState('')

  const now = new Date()
  const [mesFilter] = useState(String(now.getMonth() + 1))
  const [yearFilter] = useState(String(now.getFullYear()))

  // Delete modal
  const [deletingGasto, setDeletingGasto] = useState<Gasto | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Hooks
  const { gastos, total, pages, isLoading, error } = useGastos(page, {
    categoria: categoriaFilter || undefined,
    verificado: verificadoFilter || undefined,
    mes: mesFilter,
    year: yearFilter,
  })
  const { remove } = useDeleteGasto()

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return gastos
    const q = search.toLowerCase().trim()
    return gastos.filter((g: Gasto) =>
      (g.emisor_razon_social?.toLowerCase().includes(q)) ||
      (g.emisor_rut?.toLowerCase().includes(q)) ||
      (g.numero_documento?.toLowerCase().includes(q)) ||
      (g.descripcion?.toLowerCase().includes(q))
    )
  }, [gastos, search])

  // KPI calculations
  const totalGastosMes = useMemo(() =>
    gastos.reduce((sum: number, g: Gasto) => sum + g.monto_total, 0),
    [gastos],
  )
  const ivaCredito = useMemo(() =>
    gastos.reduce((sum: number, g: Gasto) => sum + g.monto_iva, 0),
    [gastos],
  )

  // Handlers
  const handleDelete = async () => {
    if (!deletingGasto) return
    setIsDeleting(true)
    try {
      await remove(deletingGasto.id)
      setDeletingGasto(null)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCategoriaChange = (v: string) => {
    setCategoriaFilter(v)
    setPage(1)
  }

  const handleVerificadoChange = (v: string) => {
    setVerificadoFilter(v)
    setPage(1)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Gastos</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            {isLoading ? 'Cargando...' : `${total} gastos registrados`}
          </p>
        </div>
        <Link href="/dashboard/gastos/escanear" className="btn-primary">
          <Camera size={14} /> Escanear Documento
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard
          icon={DollarSign}
          label="Total Gastos del Mes"
          value={formatCLP(totalGastosMes)}
          sub={`${gastos.length} documentos`}
        />
        <KPICard
          icon={Receipt}
          label="IVA Credito Recuperable"
          value={formatCLP(ivaCredito)}
          sub="Para declaracion mensual"
        />
        <KPICard
          icon={FileText}
          label="Documentos Registrados"
          value={String(total)}
          sub={`${gastos.filter((g: Gasto) => g.verificado).length} verificados`}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por emisor, RUT, numero..."
            className="input-field pl-8 py-2 text-sm"
          />
        </div>

        <select
          value={categoriaFilter}
          onChange={e => handleCategoriaChange(e.target.value)}
          className="input-field w-auto py-2 text-sm pr-8"
        >
          <option value="">Todas las categorias</option>
          {CATEGORIAS.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        <select
          value={verificadoFilter}
          onChange={e => handleVerificadoChange(e.target.value)}
          className="input-field w-auto py-2 text-sm pr-8"
        >
          <option value="">Todos los estados</option>
          <option value="true">Verificados</option>
          <option value="false">Pendientes</option>
        </select>
      </div>

      {/* States */}
      {isLoading && <LoadingState />}
      {!isLoading && error && <ErrorState />}
      {!isLoading && !error && gastos.length === 0 && <EmptyState />}

      {/* Gastos Grid */}
      {!isLoading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((g: Gasto) => (
            <GastoCard
              key={g.id}
              gasto={g}
              onDelete={setDeletingGasto}
            />
          ))}
        </div>
      )}

      {/* No results from search */}
      {!isLoading && !error && gastos.length > 0 && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-[var(--cx-text-muted)]">
          <Filter size={24} />
          <p className="text-sm">No hay gastos que coincidan con la busqueda</p>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="p-1.5 rounded-lg border border-[var(--cx-border-light)] text-[var(--cx-text-secondary)] hover:bg-[var(--cx-hover-bg)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={13} />
          </button>
          <span className="text-xs text-[var(--cx-text-secondary)] tabular-nums">
            {page} / {pages}
          </span>
          <button
            disabled={page >= pages}
            onClick={() => setPage(p => Math.min(pages, p + 1))}
            className="p-1.5 rounded-lg border border-[var(--cx-border-light)] text-[var(--cx-text-secondary)] hover:bg-[var(--cx-hover-bg)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      )}

      {/* Floating action button (mobile) */}
      <Link
        href="/dashboard/gastos/escanear"
        className="fixed bottom-6 right-6 z-40 md:hidden w-14 h-14 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-violet-500/30 hover:from-violet-700 hover:to-indigo-700 transition-all active:scale-95"
      >
        <Plus size={22} />
      </Link>

      {/* Delete Confirm Modal */}
      {deletingGasto && (
        <DeleteConfirmModal
          gasto={deletingGasto}
          isDeleting={isDeleting}
          onConfirm={handleDelete}
          onClose={() => setDeletingGasto(null)}
        />
      )}
    </div>
  )
}
