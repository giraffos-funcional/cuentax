/**
 * CUENTAX — Configuracion de Empresa
 * Edit company name, RUT, address, logo, rep legal.
 */

'use client'

import { useState, useRef, useEffect } from 'react'
import { Building2, Upload, Save, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useCompany, useUpdateCompany } from '@/hooks/use-remuneraciones'

export default function EmpresaPage() {
  const { empresa, isLoading, error, refresh } = useCompany()
  const { update } = useUpdateCompany()
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    name: '',
    vat: '',
    street: '',
    city: '',
    phone: '',
    email: '',
    website: '',
  })
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoBase64, setLogoBase64] = useState<string | null>(null)

  // Pre-fill form when company data loads
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (empresa && !loaded) {
      setForm({
        name: empresa.name || '',
        vat: empresa.vat === false ? '' : (empresa.vat || ''),
        street: empresa.street === false ? '' : (empresa.street || ''),
        city: empresa.city === false ? '' : (empresa.city || ''),
        phone: empresa.phone === false ? '' : (empresa.phone || ''),
        email: empresa.email === false ? '' : (empresa.email || ''),
        website: empresa.website === false ? '' : (empresa.website || ''),
      })
      if (empresa.logo && empresa.logo !== false) {
        setLogoPreview(`data:image/png;base64,${empresa.logo}`)
      }
      setLoaded(true)
    }
  }, [empresa, loaded])

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setLogoPreview(result)
      // Extract base64 without the data:image/... prefix
      setLogoBase64(result.split(',')[1])
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const data: Record<string, unknown> = { ...form }
      if (logoBase64) {
        data.logo = logoBase64
      }
      await update(data)
      refresh()
      setMsg({ type: 'ok', text: 'Empresa actualizada correctamente' })
      setLogoBase64(null)
    } catch {
      setMsg({ type: 'error', text: 'Error al guardar los datos' })
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(null), 4000)
    }
  }

  const set = (field: string, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
        <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando datos de empresa...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
        <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
        <span className="text-sm text-[var(--cx-status-error-text)]">Error cargando datos de empresa</span>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Configuracion de Empresa</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">Datos que aparecen en liquidaciones y contratos</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar
        </button>
      </div>

      {/* Feedback */}
      {msg && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border ${
          msg.type === 'ok'
            ? 'bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border-[var(--cx-status-ok-border)]'
            : 'bg-[var(--cx-status-error-bg)] text-[var(--cx-status-error-text)] border-[var(--cx-status-error-border)]'
        }`}>
          {msg.type === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {msg.text}
        </div>
      )}

      {/* Logo */}
      <div className="card border border-[var(--cx-border-light)] rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-[var(--cx-text-primary)] uppercase tracking-wider mb-4">Logo de la Empresa</h3>
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 rounded-xl border-2 border-dashed border-[var(--cx-border-light)] flex items-center justify-center overflow-hidden bg-[var(--cx-bg-elevated)]">
            {logoPreview ? (
              <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <Building2 size={32} className="text-[var(--cx-text-muted)]" />
            )}
          </div>
          <div>
            <button
              onClick={() => fileRef.current?.click()}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <Upload size={13} /> Subir Logo
            </button>
            <p className="text-xs text-[var(--cx-text-muted)] mt-2">PNG o JPG, max 2MB. Se muestra en liquidaciones y contratos.</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              onChange={handleLogoChange}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* Company Info */}
      <div className="card border border-[var(--cx-border-light)] rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-[var(--cx-text-primary)] uppercase tracking-wider mb-4">Datos de la Empresa</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Razon Social *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} className="input-field text-sm w-full" placeholder="Razon social..." />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">RUT</label>
            <input value={form.vat} onChange={e => set('vat', e.target.value)} className="input-field text-sm w-full" placeholder="76.543.210-K" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Direccion</label>
            <input value={form.street} onChange={e => set('street', e.target.value)} className="input-field text-sm w-full" placeholder="Av. Providencia 1208" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Ciudad</label>
            <input value={form.city} onChange={e => set('city', e.target.value)} className="input-field text-sm w-full" placeholder="Santiago" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Telefono</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)} className="input-field text-sm w-full" placeholder="+56 2 1234 5678" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Email</label>
            <input value={form.email} onChange={e => set('email', e.target.value)} className="input-field text-sm w-full" placeholder="contacto@empresa.cl" type="email" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Sitio Web</label>
            <input value={form.website} onChange={e => set('website', e.target.value)} className="input-field text-sm w-full" placeholder="https://empresa.cl" />
          </div>
        </div>
      </div>
    </div>
  )
}
