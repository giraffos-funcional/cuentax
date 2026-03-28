/**
 * CUENTAX — Maestro: Productos y Servicios
 * Mia: "El catálogo de productos acelera la emisión DTE.
 * Precio con/sin IVA visible, badge de exento claro, búsqueda instantánea."
 * Connected to real data via useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct hooks.
 */
'use client'

import { useState } from 'react'
import { Search, Plus, Package, Edit, Trash2, Tag, Loader2, AlertCircle, X } from 'lucide-react'
import {
  useProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
} from '@/hooks'

// ── Types ──────────────────────────────────────────────────────

interface Product {
  id: number
  codigo?: string
  nombre: string
  descripcion?: string
  precio: number
  precio_con_iva: number
  unidad: string
  exento: boolean
  categoria?: string
}

interface ProductForm {
  codigo: string
  nombre: string
  descripcion: string
  precio: string
  unidad: string
  exento: boolean
  categoria: string
}

// ── Constants ──────────────────────────────────────────────────

const UNIDADES = ['UN', 'KG', 'LT', 'HR', 'MT'] as const

const EMPTY_FORM: ProductForm = {
  codigo: '',
  nombre: '',
  descripcion: '',
  precio: '',
  unidad: 'UN',
  exento: false,
  categoria: '',
}

// ── Helpers ────────────────────────────────────────────────────

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

// ── Sub-components ─────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando productos...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)] shrink-0" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando productos'}</span>
    </div>
  )
}

function EmptyState({ search, cat }: { search: string; cat: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Package size={32} className="text-[var(--cx-text-muted)]" />
      <p className="text-sm text-[var(--cx-text-secondary)]">
        {search || cat !== 'todas'
          ? 'No se encontraron productos con esos filtros'
          : 'Aún no hay productos. Agrega el primero.'}
      </p>
    </div>
  )
}

// ── Product Form Modal ─────────────────────────────────────────

function ProductModal({
  title,
  form,
  isSaving,
  onChange,
  onSubmit,
  onClose,
}: {
  title: string
  form: ProductForm
  isSaving: boolean
  onChange: (field: keyof ProductForm, value: string | boolean) => void
  onSubmit: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="card p-6 w-full max-w-lg mx-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-[var(--cx-text-primary)]">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          {/* Código + Nombre */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Código</label>
              <input
                value={form.codigo}
                onChange={e => onChange('codigo', e.target.value)}
                placeholder="SW-001"
                className="input-field py-2 text-sm font-mono"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">
                Nombre <span className="text-[var(--cx-status-error-text)]">*</span>
              </label>
              <input
                value={form.nombre}
                onChange={e => onChange('nombre', e.target.value)}
                placeholder="Desarrollo web mensual"
                className="input-field py-2 text-sm"
              />
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Descripción</label>
            <input
              value={form.descripcion}
              onChange={e => onChange('descripcion', e.target.value)}
              placeholder="Descripción opcional del producto o servicio"
              className="input-field py-2 text-sm"
            />
          </div>

          {/* Precio + Unidad */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">
                Precio Neto (CLP) <span className="text-[var(--cx-status-error-text)]">*</span>
              </label>
              <input
                type="number"
                min="0"
                value={form.precio}
                onChange={e => onChange('precio', e.target.value)}
                placeholder="500000"
                className="input-field py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Unidad</label>
              <select
                value={form.unidad}
                onChange={e => onChange('unidad', e.target.value)}
                className="input-field py-2 text-sm"
              >
                {UNIDADES.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Categoría */}
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Categoría</label>
            <input
              value={form.categoria}
              onChange={e => onChange('categoria', e.target.value)}
              placeholder="Software, Servicios, Consultoría..."
              className="input-field py-2 text-sm"
            />
          </div>

          {/* Exento toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--cx-bg-elevated)] border border-[var(--cx-border-light)]">
            <div>
              <p className="text-sm font-medium text-[var(--cx-text-primary)]">Exento de IVA</p>
              <p className="text-xs text-[var(--cx-text-muted)]">No aplica IVA 19% sobre este producto</p>
            </div>
            <button
              type="button"
              onClick={() => onChange('exento', !form.exento)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.exento
                  ? 'bg-amber-500'
                  : 'bg-[var(--cx-border-light)]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  form.exento ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button
            onClick={onSubmit}
            disabled={isSaving || !form.nombre.trim() || !form.precio}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? <Loader2 size={13} className="animate-spin" /> : null}
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Delete Confirmation Modal ──────────────────────────────────

function DeleteModal({
  product,
  isDeleting,
  onConfirm,
  onClose,
}: {
  product: Product
  isDeleting: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="card p-6 w-full max-w-sm mx-4 shadow-xl">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
            <Trash2 size={16} className="text-[var(--cx-status-error-text)]" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--cx-text-primary)]">Eliminar producto</h2>
            <p className="text-sm text-[var(--cx-text-secondary)] mt-1">
              ¿Eliminar <span className="font-semibold text-[var(--cx-text-primary)]">{product.nombre}</span>? Esta acción no se puede deshacer.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="btn-primary bg-red-600 hover:bg-red-700 border-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? <Loader2 size={13} className="animate-spin" /> : null}
            Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────

export default function ProductosPage() {
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState<string>('todas')

  // Modal state
  const [showCreate, setShowCreate] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Form state
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM)

  // Hooks
  const { productos, total, isLoading, error } = useProducts({ search: search || undefined })
  const { crear, isLoading: isCreating } = useCreateProduct()
  const { update } = useUpdateProduct()
  const { remove } = useDeleteProduct()

  // Client-side category filter (products hook does not support category filter param)
  const categorias = Array.from(
    new Set((productos as Product[]).map((p: Product) => p.categoria).filter(Boolean))
  ) as string[]

  const filtered = (productos as Product[]).filter((p: Product) => {
    return cat === 'todas' || p.categoria === cat
  })

  // ── Handlers ────────────────────────────────────────────────

  function handleFormChange(field: keyof ProductForm, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function openCreate() {
    setForm(EMPTY_FORM)
    setShowCreate(true)
  }

  function openEdit(product: Product) {
    setForm({
      codigo: product.codigo ?? '',
      nombre: product.nombre,
      descripcion: product.descripcion ?? '',
      precio: String(product.precio),
      unidad: product.unidad,
      exento: product.exento,
      categoria: product.categoria ?? '',
    })
    setEditProduct(product)
  }

  async function handleCreate() {
    if (!form.nombre.trim() || !form.precio) return
    const precio = Number(form.precio)
    await crear({
      codigo:      form.codigo || undefined,
      nombre:      form.nombre.trim(),
      descripcion: form.descripcion || undefined,
      precio,
      unidad:      form.unidad,
      exento:      form.exento,
      categoria:   form.categoria || undefined,
    })
    setShowCreate(false)
    setForm(EMPTY_FORM)
  }

  const [isEditSaving, setIsEditSaving] = useState(false)

  async function handleEdit() {
    if (!editProduct || !form.nombre.trim() || !form.precio) return
    setIsEditSaving(true)
    try {
      const precio = Number(form.precio)
      await update(editProduct.id, {
        codigo:      form.codigo || undefined,
        nombre:      form.nombre.trim(),
        descripcion: form.descripcion || undefined,
        precio,
        unidad:      form.unidad,
        exento:      form.exento,
        categoria:   form.categoria || undefined,
      })
      setEditProduct(null)
      setForm(EMPTY_FORM)
    } catch (err) {
      console.error('Error updating product:', err)
    } finally {
      setIsEditSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteProduct) return
    setIsDeleting(true)
    try {
      await remove(deleteProduct.id)
      setDeleteProduct(null)
    } finally {
      setIsDeleting(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Productos y Servicios</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            {isLoading ? 'Cargando...' : `${total} productos · Catálogo de la empresa`}
          </p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Plus size={14} /> Nuevo Producto
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o código..."
            className="input-field pl-8 py-2 text-sm"
          />
        </div>
        {['todas', ...categorias].map(c => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`px-3 py-2 rounded-xl text-sm font-medium capitalize transition-all border ${
              cat === c
                ? 'bg-[var(--cx-active-bg)] text-[var(--cx-active-icon)] border-[var(--cx-active-border)]'
                : 'text-[var(--cx-text-secondary)] border-[var(--cx-border-light)] hover:text-[var(--cx-text-primary)]'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* States */}
      {error && <ErrorState message="No se pudieron cargar los productos. Verifica la conexión." />}

      {/* Table */}
      <div className="card overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-[var(--cx-border-light)] text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest">
          <div className="col-span-1">Código</div>
          <div className="col-span-3">Nombre</div>
          <div className="col-span-2">Categoría</div>
          <div className="col-span-1">Unidad</div>
          <div className="col-span-2 text-right">Precio Neto</div>
          <div className="col-span-2 text-right">Precio c/IVA</div>
          <div className="col-span-1 text-right">Acciones</div>
        </div>

        {/* Loading */}
        {isLoading && <LoadingState />}

        {/* Rows */}
        {!isLoading && !error && (
          <div className="divide-y divide-[var(--cx-border-light)]">
            {filtered.length === 0 ? (
              <EmptyState search={search} cat={cat} />
            ) : (
              filtered.map((p: Product) => (
                <div
                  key={p.id}
                  className="grid grid-cols-12 gap-3 px-4 py-3.5 items-center hover:bg-[var(--cx-hover-bg)] transition-colors group"
                >
                  {/* Código */}
                  <div className="col-span-1 text-xs font-mono text-[var(--cx-text-secondary)]">
                    {p.codigo ?? '—'}
                  </div>

                  {/* Nombre + Exento badge */}
                  <div className="col-span-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[var(--cx-text-primary)] font-medium truncate">{p.nombre}</span>
                      {p.exento && (
                        <span className="badge-dte bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                          Exento
                        </span>
                      )}
                    </div>
                    {p.descripcion && (
                      <p className="text-xs text-[var(--cx-text-muted)] truncate mt-0.5">{p.descripcion}</p>
                    )}
                  </div>

                  {/* Categoría */}
                  <div className="col-span-2">
                    {p.categoria ? (
                      <span className="flex items-center gap-1 text-xs text-[var(--cx-text-secondary)]">
                        <Tag size={10} className="shrink-0" />
                        <span className="truncate">{p.categoria}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--cx-text-muted)]">—</span>
                    )}
                  </div>

                  {/* Unidad */}
                  <div className="col-span-1 text-xs text-[var(--cx-text-secondary)]">{p.unidad}</div>

                  {/* Precio Neto */}
                  <div className="col-span-2 text-right text-sm text-[var(--cx-text-primary)]">
                    {formatCLP(p.precio)}
                  </div>

                  {/* Precio c/IVA */}
                  <div className="col-span-2 text-right">
                    <span className="text-sm font-bold text-[var(--cx-text-primary)]">
                      {formatCLP(p.exento ? p.precio : (p.precio_con_iva ?? p.precio * 1.19))}
                    </span>
                  </div>

                  {/* Acciones */}
                  <div className="col-span-1 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(p)}
                      className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-active-icon)] hover:bg-[var(--cx-hover-bg)] transition-colors"
                      title="Editar producto"
                    >
                      <Edit size={12} />
                    </button>
                    <button
                      onClick={() => setDeleteProduct(p)}
                      className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-status-error-text)] hover:bg-[var(--cx-status-error-bg)] transition-colors"
                      title="Eliminar producto"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <ProductModal
          title="Nuevo Producto"
          form={form}
          isSaving={isCreating}
          onChange={handleFormChange}
          onSubmit={handleCreate}
          onClose={() => { setShowCreate(false); setForm(EMPTY_FORM) }}
        />
      )}

      {/* Edit Modal */}
      {editProduct && (
        <ProductModal
          title="Editar Producto"
          form={form}
          isSaving={isEditSaving}
          onChange={handleFormChange}
          onSubmit={handleEdit}
          onClose={() => { setEditProduct(null); setForm(EMPTY_FORM) }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteProduct && (
        <DeleteModal
          product={deleteProduct}
          isDeleting={isDeleting}
          onConfirm={handleDelete}
          onClose={() => setDeleteProduct(null)}
        />
      )}
    </div>
  )
}
