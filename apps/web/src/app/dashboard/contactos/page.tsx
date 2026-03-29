/**
 * CUENTAX — Maestro: Contactos (Clientes + Proveedores)
 * Mia: "El maestro de datos es el CRM interno del contador.
 * Busca por RUT o nombre, agrega desde el perfil del cliente,
 * y rellena el formulario DTE automáticamente."
 */
'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api-client'
import {
  Search, Plus, Building2, ArrowRight, Users,
  Edit, Trash2, Phone, Mail, Loader2, AlertCircle, X,
} from 'lucide-react'
import { useContacts, useCreateContact, useUpdateContact, useDeleteContact } from '@/hooks'

// ── Types ──────────────────────────────────────────────────────
interface ContactFormData {
  rut: string
  razon_social: string
  giro: string
  email: string
  telefono: string
  direccion: string
  comuna: string
  es_cliente: boolean
  es_proveedor: boolean
}

const EMPTY_FORM: ContactFormData = {
  rut: '',
  razon_social: '',
  giro: '',
  email: '',
  telefono: '',
  direccion: '',
  comuna: '',
  es_cliente: true,
  es_proveedor: false,
}

// ── Loading State ──────────────────────────────────────────────
function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando contactos...</span>
    </div>
  )
}

// ── Error State ────────────────────────────────────────────────
function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando contactos'}</span>
    </div>
  )
}

// ── Empty State ────────────────────────────────────────────────
function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 mb-4 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center shadow-sm">
        <Users size={28} className="text-violet-500" />
      </div>
      <p className="text-base font-semibold text-[var(--cx-text-primary)] mb-1">No hay contactos</p>
      <p className="text-sm text-[var(--cx-text-muted)] mb-1 max-w-xs">
        Agrega clientes y proveedores para autocompletar tus DTEs al emitir
      </p>
      <p className="text-xs text-[var(--cx-text-muted)] mb-5">
        También puedes buscar por RUT directamente en el SII
      </p>
      <button onClick={onNew} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-bold hover:from-violet-700 hover:to-indigo-700 transition-all shadow-md shadow-violet-500/20">
        <Plus size={14} /> Agregar Contacto
      </button>
    </div>
  )
}

// ── Contact Form Modal ─────────────────────────────────────────
function ContactModal({
  title,
  initial,
  isSaving,
  onSave,
  onClose,
}: {
  title: string
  initial: ContactFormData
  isSaving: boolean
  onSave: (data: ContactFormData) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<ContactFormData>(initial)
  const [lookingUp, setLookingUp] = useState(false)

  const set = (field: keyof ContactFormData, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleLookupSII = async () => {
    if (!form.rut.trim()) return
    setLookingUp(true)
    try {
      const { data } = await apiClient.get(`/api/v1/companies/lookup-rut/${encodeURIComponent(form.rut)}`)
      if (data.found) {
        setForm(f => ({
          ...f,
          razon_social: data.razon_social || f.razon_social,
          giro: data.giro || f.giro,
        }))
      }
    } catch {}
    finally { setLookingUp(false) }
  }

  const handleSubmit = async () => {
    if (!form.rut.trim() || !form.razon_social.trim()) return
    await onSave(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="card p-6 w-full max-w-lg mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-[var(--cx-text-primary)]">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-3">
          {/* RUT + Razón Social */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">RUT *</label>
              <div className="flex gap-2">
                <input
                  value={form.rut}
                  onChange={e => set('rut', e.target.value)}
                  placeholder="12.345.678-9"
                  className="input-field text-sm flex-1"
                />
                <button
                  type="button"
                  onClick={handleLookupSII}
                  disabled={lookingUp || !form.rut.trim()}
                  className="btn-secondary text-xs px-2 py-1.5 whitespace-nowrap shrink-0"
                >
                  {lookingUp ? '...' : 'SII'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Razón Social *</label>
              <input
                value={form.razon_social}
                onChange={e => set('razon_social', e.target.value)}
                placeholder="Empresa Ltda."
                className="input-field text-sm"
              />
            </div>
          </div>

          {/* Giro */}
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Giro</label>
            <input
              value={form.giro}
              onChange={e => set('giro', e.target.value)}
              placeholder="Actividad económica"
              className="input-field text-sm"
            />
          </div>

          {/* Email + Teléfono */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="correo@empresa.cl"
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Teléfono</label>
              <input
                value={form.telefono}
                onChange={e => set('telefono', e.target.value)}
                placeholder="+56 9 1234 5678"
                className="input-field text-sm"
              />
            </div>
          </div>

          {/* Dirección + Comuna */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Dirección</label>
              <input
                value={form.direccion}
                onChange={e => set('direccion', e.target.value)}
                placeholder="Av. Principal 123"
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Comuna</label>
              <input
                value={form.comuna}
                onChange={e => set('comuna', e.target.value)}
                placeholder="Santiago"
                className="input-field text-sm"
              />
            </div>
          </div>

          {/* Tipo: Cliente / Proveedor */}
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-2">Tipo</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.es_cliente}
                  onChange={e => set('es_cliente', e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-[var(--cx-text-primary)]">Cliente</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.es_proveedor}
                  onChange={e => set('es_proveedor', e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-[var(--cx-text-primary)]">Proveedor</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={handleSubmit}
            disabled={isSaving || !form.rut.trim() || !form.razon_social.trim()}
            className="btn-primary flex-1 justify-center"
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : null}
            Guardar
          </button>
          <button onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Delete Confirm Modal ───────────────────────────────────────
function DeleteConfirmModal({
  name,
  isDeleting,
  onConfirm,
  onClose,
}: {
  name: string
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
            <h2 className="text-sm font-bold text-[var(--cx-text-primary)]">Eliminar contacto</h2>
            <p className="text-xs text-[var(--cx-text-secondary)] mt-0.5">
              ¿Eliminar a <span className="font-semibold text-[var(--cx-text-primary)]">{name}</span>? Esta acción es reversible desde el historial.
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

// ── Page ──────────────────────────────────────────────────────
export default function ContactosPage() {
  const [search, setSearch] = useState('')
  const [tipo, setTipo] = useState<'todos' | 'clientes' | 'proveedores'>('todos')

  // Modals
  const [showCreate, setShowCreate] = useState(false)
  const [editingContact, setEditingContact] = useState<any>(null)
  const [deletingContact, setDeletingContact] = useState<any>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Hooks
  const { contactos, total, isLoading, error } = useContacts({
    search: search || undefined,
    tipo: tipo === 'todos' ? undefined : tipo,
  })
  const { crear, isLoading: isCreating } = useCreateContact()
  const { update } = useUpdateContact()
  const { remove } = useDeleteContact()
  const [isEditing, setIsEditing] = useState(false)

  // Handlers
  const handleCreate = async (data: ContactFormData) => {
    await crear(data)
    setShowCreate(false)
  }

  const handleEdit = async (data: ContactFormData) => {
    if (!editingContact) return
    setIsEditing(true)
    try {
      await update(editingContact.id, data)
      setEditingContact(null)
    } catch (err) {
      console.error('Error updating contact:', err)
    } finally {
      setIsEditing(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingContact) return
    setIsDeleting(true)
    try {
      await remove(deletingContact.id)
      setDeletingContact(null)
    } finally {
      setIsDeleting(false)
    }
  }

  const openEdit = (c: any) => {
    setEditingContact(c)
  }

  const editInitial = editingContact
    ? {
        rut: editingContact.rut ?? '',
        razon_social: editingContact.razon_social ?? '',
        giro: editingContact.giro ?? '',
        email: editingContact.email ?? '',
        telefono: editingContact.telefono ?? '',
        direccion: editingContact.direccion ?? '',
        comuna: editingContact.comuna ?? '',
        es_cliente: editingContact.es_cliente ?? false,
        es_proveedor: editingContact.es_proveedor ?? false,
      }
    : EMPTY_FORM

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Contactos</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            {isLoading ? 'Cargando...' : `${total} contactos · Clientes y proveedores`}
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={14} /> Nuevo Contacto
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o RUT..."
            className="input-field pl-8 py-2 text-sm"
          />
        </div>
        {(['todos', 'clientes', 'proveedores'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTipo(t)}
            className={`px-3 py-2 rounded-xl text-sm font-medium capitalize transition-all border ${
              tipo === t
                ? 'bg-[var(--cx-active-bg)] text-[var(--cx-active-icon)] border-[var(--cx-active-border)]'
                : 'text-[var(--cx-text-secondary)] border-[var(--cx-border-light)] hover:text-[var(--cx-text-primary)]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* States */}
      {isLoading && <LoadingState />}
      {!isLoading && error && <ErrorState />}
      {!isLoading && !error && contactos.length === 0 && (
        <EmptyState onNew={() => setShowCreate(true)} />
      )}

      {/* Grid de contactos */}
      {!isLoading && !error && contactos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {contactos.map((c: any) => (
            <div key={c.id} className="card p-4 group hover:border-[var(--cx-border-hover)] transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center border border-[var(--cx-border-light)]">
                    <Building2 size={16} className="text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--cx-text-primary)]">{c.razon_social}</p>
                    <p className="text-xs text-[var(--cx-text-muted)] font-mono">{c.rut}</p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEdit(c)}
                    className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors"
                  >
                    <Edit size={12} />
                  </button>
                  <button
                    onClick={() => setDeletingContact(c)}
                    className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-status-error-text)] hover:bg-[var(--cx-status-error-bg)] transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {c.giro && (
                <p className="text-xs text-[var(--cx-text-secondary)] mb-3">{c.giro}</p>
              )}

              <div className="space-y-1.5">
                {c.email && (
                  <div className="flex items-center gap-2 text-xs text-[var(--cx-text-secondary)]">
                    <Mail size={11} className="text-[var(--cx-text-muted)]" />{c.email}
                  </div>
                )}
                {c.telefono && (
                  <div className="flex items-center gap-2 text-xs text-[var(--cx-text-secondary)]">
                    <Phone size={11} className="text-[var(--cx-text-muted)]" />{c.telefono}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--cx-border-light)]">
                <div className="flex gap-2">
                  {c.es_cliente && (
                    <span className="badge-dte bg-[var(--cx-active-bg)] text-[var(--cx-active-icon)] border border-[var(--cx-active-border)]">
                      Cliente
                    </span>
                  )}
                  {c.es_proveedor && (
                    <span className="badge-dte bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      Proveedor
                    </span>
                  )}
                </div>
                {c.dtes_count != null && (
                  <div className="flex items-center gap-1 text-xs text-[var(--cx-text-muted)]">
                    <span>{c.dtes_count} DTEs</span>
                    <ArrowRight size={10} />
                  </div>
                )}
              </div>

              {/* Quick action */}
              <button
                onClick={() =>
                  window.location.href = `/dashboard/emitir?rut=${c.rut}&receptor=${encodeURIComponent(c.razon_social)}`
                }
                className="mt-2 w-full btn-secondary py-1.5 text-xs justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Emitir DTE →
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <ContactModal
          title="Nuevo Contacto"
          initial={EMPTY_FORM}
          isSaving={isCreating}
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Edit Modal */}
      {editingContact && (
        <ContactModal
          title="Editar Contacto"
          initial={editInitial}
          isSaving={isEditing}
          onSave={handleEdit}
          onClose={() => setEditingContact(null)}
        />
      )}

      {/* Delete Confirm Modal */}
      {deletingContact && (
        <DeleteConfirmModal
          name={deletingContact.razon_social}
          isDeleting={isDeleting}
          onConfirm={handleDelete}
          onClose={() => setDeletingContact(null)}
        />
      )}
    </div>
  )
}
