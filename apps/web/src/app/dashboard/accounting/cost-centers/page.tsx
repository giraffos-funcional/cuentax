'use client'

/**
 * Cost Centers management — CL + US.
 * CRUD + keywords + Airbnb listing mapping + sync from Odoo.
 */

import { useState } from 'react'
import {
  Plus, Edit2, Trash2, RefreshCw, Loader2, Search, X, Home, Tag,
  AlertCircle, CheckCircle2, Info,
} from 'lucide-react'
import {
  useCostCentersV2 as useCostCenters, useCreateCostCenterV2 as useCreateCostCenter,
  useUpdateCostCenter, useDeleteCostCenter,
  useSyncCostCenters, useAutoTagCostCenters, type CostCenter,
} from '@/hooks'
import { useLocale } from '@/contexts/locale-context'

export default function CostCentersPage() {
  const { country } = useLocale()
  const { costCenters, total, isLoading, mutate } = useCostCenters()
  const { create, loading: creating } = useCreateCostCenter()
  const { update } = useUpdateCostCenter()
  const { remove } = useDeleteCostCenter()
  const { sync, loading: syncing } = useSyncCostCenters()
  const { autoTag, loading: tagging } = useAutoTagCostCenters()

  const [modal, setModal] = useState<null | { mode: 'create' | 'edit'; center?: CostCenter }>(null)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const isCL = country === 'CL'
  const L = isCL
    ? { title: 'Centros de Costo', subtitle: 'Dimensiones analíticas: propiedades, proyectos, casos, locales, etc.', new: 'Nuevo', syncOdoo: 'Sincronizar con Odoo', autoTag: 'Auto-taggear histórico', search: 'Buscar...', loading: 'Cargando...', noCenters: 'No hay centros de costo aún. Crea uno o sincroniza desde Odoo.', name: 'Nombre', plan: 'Plan', code: 'Código', keywords: 'Keywords', airbnb: 'Listing Airbnb', notes: 'Notas', actions: 'Acciones', edit: 'Editar', delete: 'Desactivar', cancel: 'Cancelar', save: 'Guardar', confirmDelete: '¿Desactivar este centro? Las clasificaciones existentes conservan su tag.', keywordsHelp: 'Palabras que aparecen en tu cartola bancaria cuando un gasto pertenece a este centro. Separadas por coma.', airbnbHelp: 'Nombre exacto del Listing en Airbnb (para mapeo automático en import de CSV).', planHelp: 'Ej: "Propiedades", "Proyectos", "Casos", "Locales". Se crea automáticamente si no existe.' }
    : { title: 'Cost Centers', subtitle: 'Analytic dimensions: properties, projects, cases, stores, etc.', new: 'New', syncOdoo: 'Sync from Odoo', autoTag: 'Auto-tag history', search: 'Search...', loading: 'Loading...', noCenters: 'No cost centers yet. Create one or sync from Odoo.', name: 'Name', plan: 'Plan', code: 'Code', keywords: 'Keywords', airbnb: 'Airbnb Listing', notes: 'Notes', actions: 'Actions', edit: 'Edit', delete: 'Deactivate', cancel: 'Cancel', save: 'Save', confirmDelete: 'Deactivate this cost center? Existing classifications keep their tag.', keywordsHelp: 'Words that appear in your bank statement when an expense belongs to this center. Comma-separated.', airbnbHelp: 'Exact Listing name in Airbnb (for auto-mapping CSV imports).', planHelp: 'E.g. "Properties", "Projects", "Cases", "Stores". Auto-created if missing.' }

  const filtered = costCenters.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.keywords.some(k => k.toLowerCase().includes(search.toLowerCase())) ||
    (c.airbnb_listing?.toLowerCase() ?? '').includes(search.toLowerCase()),
  )

  const handleSync = async () => {
    const r = await sync()
    setToast(`✓ Sincronizados ${r.synced} centros (total en Odoo: ${r.total_in_odoo})`)
    setTimeout(() => setToast(null), 4000)
  }

  const handleAutoTag = async () => {
    const r = await autoTag()
    setToast(`✓ ${r.tagged} transacciones tagged, ${r.total_untagged} aún sin centro`)
    setTimeout(() => setToast(null), 4000)
  }

  const handleDelete = async (c: CostCenter) => {
    if (!confirm(L.confirmDelete)) return
    await remove(c.id)
    mutate()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Home className="w-6 h-6" /> {L.title}
          </h1>
          <p className="text-sm text-zinc-400 mt-1">{L.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg text-sm disabled:opacity-50">
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {L.syncOdoo}
          </button>
          <button onClick={handleAutoTag} disabled={tagging}
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg text-sm disabled:opacity-50">
            {tagging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Tag className="w-4 h-4" />}
            {L.autoTag}
          </button>
          <button onClick={() => setModal({ mode: 'create' })}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> {L.new}
          </button>
        </div>
      </div>

      {toast && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {toast}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={L.search}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-3 py-2 text-sm text-white"
        />
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />{L.loading}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500 gap-3">
            <Info className="w-8 h-8" />
            <p className="text-sm">{L.noCenters}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                <th className="px-4 py-3">{L.name}</th>
                <th className="px-4 py-3">{L.plan}</th>
                <th className="px-4 py-3">{L.code}</th>
                <th className="px-4 py-3">{L.keywords}</th>
                <th className="px-4 py-3">{L.airbnb}</th>
                <th className="px-4 py-3 text-center">{L.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-white font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{c.plan_name || '—'}</td>
                  <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{c.code || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 max-w-md">
                      {c.keywords.length === 0 ? (
                        <span className="text-zinc-600 text-xs">—</span>
                      ) : c.keywords.map((k, i) => (
                        <span key={i} className="px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-300">
                          {k}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{c.airbnb_listing || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => setModal({ mode: 'edit', center: c })}
                        className="text-blue-400 hover:text-blue-300 p-1" title={L.edit}>
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(c)}
                        className="text-red-400 hover:text-red-300 p-1" title={L.delete}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="px-4 py-2 text-xs text-zinc-500 border-t border-zinc-800">
          {filtered.length} de {total}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <CostCenterModal
          mode={modal.mode}
          center={modal.center}
          labels={L}
          isCL={isCL}
          onClose={() => setModal(null)}
          onSave={async (data) => {
            if (modal.mode === 'create') {
              await create(data)
              setToast('✓ Centro creado')
            } else if (modal.center) {
              await update(modal.center.id, data)
              setToast('✓ Centro actualizado')
            }
            setModal(null)
            mutate()
            setTimeout(() => setToast(null), 3000)
          }}
          saving={creating}
        />
      )}
    </div>
  )
}

function CostCenterModal({ mode, center, labels: L, isCL, onClose, onSave, saving }: {
  mode: 'create' | 'edit'
  center?: CostCenter
  labels: any
  isCL: boolean
  onClose: () => void
  onSave: (data: any) => Promise<void>
  saving: boolean
}) {
  const [name, setName] = useState(center?.name ?? '')
  const [code, setCode] = useState(center?.code ?? '')
  const [planName, setPlanName] = useState(center?.plan_name ?? (isCL ? 'Propiedades' : 'Properties'))
  const [keywordsInput, setKeywordsInput] = useState((center?.keywords ?? []).join(', '))
  const [airbnbListing, setAirbnbListing] = useState(center?.airbnb_listing ?? '')
  const [notes, setNotes] = useState(center?.notes ?? '')

  const handleSubmit = async () => {
    if (!name.trim()) return
    const keywords = keywordsInput.split(',').map(k => k.trim()).filter(Boolean)
    const data: any = { name: name.trim(), keywords, airbnb_listing: airbnbListing.trim() || undefined, notes: notes.trim() || undefined }
    if (code.trim()) data.code = code.trim()
    if (mode === 'create' && planName.trim()) data.plan_name = planName.trim()
    await onSave(data)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">
            {mode === 'create' ? L.new : L.edit} · {L.title}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <Field label={L.name + ' *'}>
          <input
            type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder={isCL ? 'Ej: Apto Providencia 101' : 'E.g. Apt Providence 101'}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </Field>

        {mode === 'create' && (
          <Field label={L.plan} hint={L.planHelp}>
            <input
              type="text" value={planName} onChange={e => setPlanName(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </Field>
        )}

        <Field label={L.code}>
          <input
            type="text" value={code} onChange={e => setCode(e.target.value)}
            placeholder={isCL ? 'Ej: PROP001' : 'E.g. PROP001'}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
          />
        </Field>

        <Field label={L.keywords} hint={L.keywordsHelp}>
          <input
            type="text" value={keywordsInput} onChange={e => setKeywordsInput(e.target.value)}
            placeholder={isCL ? 'GC PROV 101, EDIF PROVIDENCIA, LIMPIEZA 101' : 'HOA UNIT 101, CLEANING 101, PROV MGMT'}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </Field>

        <Field label={L.airbnb} hint={L.airbnbHelp}>
          <input
            type="text" value={airbnbListing} onChange={e => setAirbnbListing(e.target.value)}
            placeholder={isCL ? 'Departamento moderno en Providencia' : 'Modern apartment in Providence'}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </Field>

        <Field label={L.notes}>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </Field>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-300 hover:text-white">{L.cancel}</button>
          <button onClick={handleSubmit} disabled={!name.trim() || saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {L.save}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-zinc-300 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-zinc-500 mt-1">{hint}</p>}
    </div>
  )
}
