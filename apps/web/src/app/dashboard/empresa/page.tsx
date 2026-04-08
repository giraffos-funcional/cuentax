/**
 * CUENTAX — Configuración de Empresa
 * Edit company name, RUT, address, logo, rep legal.
 * Uses direct apiClient fetch (not SWR) to avoid stale cache after company switch.
 */

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Building2, Upload, Save, Loader2, AlertCircle, CheckCircle2, Shield, Wifi, WifiOff, RefreshCw, Moon } from 'lucide-react'
import { useUpdateCompany } from '@/hooks/use-remuneraciones'
import { useAuthStore } from '@/stores/auth.store'
import { apiClient } from '@/lib/api-client'

export default function EmpresaPage() {
  const { update } = useUpdateCompany()
  const companyId = useAuthStore(s => s.user?.company_id)
  const [empresa, setEmpresa] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Fetch empresa with retry - handles the post-switch token recovery race condition
  const fetchEmpresa = useCallback(async (retries = 3) => {
    setIsLoading(true)
    setError(null)
    for (let i = 0; i < retries; i++) {
      try {
        const { data } = await apiClient.get('/api/v1/remuneraciones/empresa')
        const emp = data?.empresa ?? null
        // Verify we got data for the RIGHT company (not stale from old token)
        if (emp && companyId && emp.id !== companyId) {
          // Token refresh returned old company data - wait and retry
          await new Promise(r => setTimeout(r, 1500))
          continue
        }
        setEmpresa(emp)
        setIsLoading(false)
        return
      } catch (err: any) {
        if (i < retries - 1) {
          await new Promise(r => setTimeout(r, 1500))
          continue
        }
        setError(err)
      }
    }
    setIsLoading(false)
  }, [companyId])

  // Fetch on mount and when companyId changes
  useEffect(() => {
    fetchEmpresa()
  }, [companyId, fetchEmpresa])

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

  // Pre-fill form when empresa loads or changes
  const loadedId_ref = useRef<number | null>(null)
  const authName = useAuthStore(s => s.user?.company_name)
  useEffect(() => {
    const currentId = empresa?.id ?? null
    if (empresa && currentId !== loadedId_ref.current) {
      // Odoo returns Python False for empty fields → handle as empty string
      const clean = (v: unknown) => (!v || v === false || String(v) === 'False') ? '' : String(v)
      setForm({
        name: clean(empresa.name) || authName || '',
        vat: clean(empresa.vat),
        street: clean(empresa.street),
        city: clean(empresa.city),
        phone: clean(empresa.phone),
        email: clean(empresa.email),
        website: clean(empresa.website),
      })
      if (empresa.logo && empresa.logo !== false && String(empresa.logo) !== 'False') {
        setLogoPreview(`data:image/png;base64,${empresa.logo}`)
      } else {
        setLogoPreview(null)
      }
      loadedId_ref.current = currentId
    }
  }, [empresa, authName])

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setLogoPreview(result)
      setLogoBase64(result.split(',')[1])
    }
    reader.readAsDataURL(file)
  }

  const { setAuth, setAccessToken } = useAuthStore()

  const handleSave = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const data: Record<string, unknown> = { ...form }
      if (logoBase64) {
        data.logo = logoBase64
      }
      const result = await update(data)

      // If RUT changed, backend returns new tokens — update auth state
      if (result?.tokens) {
        setAuth(result.tokens.user, result.tokens.access_token)
        setAccessToken(result.tokens.access_token)
      }

      await fetchEmpresa()
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
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Configuración de Empresa</h1>
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
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Razón Social *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} className="input-field text-sm w-full" placeholder="Razón social..." />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">RUT</label>
            <input value={form.vat} onChange={e => set('vat', e.target.value)} className="input-field text-sm w-full" placeholder="76.543.210-K" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Dirección</label>
            <input value={form.street} onChange={e => set('street', e.target.value)} className="input-field text-sm w-full" placeholder="Av. Providencia 1208" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Ciudad</label>
            <input value={form.city} onChange={e => set('city', e.target.value)} className="input-field text-sm w-full" placeholder="Santiago" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Teléfono</label>
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

      {/* SII Credentials */}
      <SIICredentialsCard />
    </div>
  )
}

// ── SII Credentials Card ────────────────────────────────────

function SIICredentialsCard() {
  const [siiUser, setSiiUser] = useState('')
  const [siiPassword, setSiiPassword] = useState('')
  const [autoSync, setAutoSync] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [credStatus, setCredStatus] = useState<{
    sii_user: string | null
    has_password: boolean
    auto_sync: boolean
    last_sync: string | null
  } | null>(null)

  // Fetch current credential status
  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/api/v1/rcv/credentials')
      setCredStatus(data)
      setSiiUser(data.sii_user ?? '')
      setAutoSync(data.auto_sync ?? false)
      setSiiPassword('') // Never pre-fill password
    } catch {
      // RCV routes may not exist yet — non-critical
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  const handleSave = async () => {
    if (!siiUser.trim()) {
      setMsg({ type: 'error', text: 'Ingresa el RUT del usuario SII' })
      setTimeout(() => setMsg(null), 3000)
      return
    }
    // Only require password on first setup
    if (!credStatus?.has_password && !siiPassword.trim()) {
      setMsg({ type: 'error', text: 'Ingresa la clave tributaria' })
      setTimeout(() => setMsg(null), 3000)
      return
    }

    setSaving(true)
    setMsg(null)
    try {
      const body: Record<string, unknown> = {
        sii_user: siiUser.trim(),
        auto_sync: autoSync,
      }
      // Only send password if user entered one
      if (siiPassword.trim()) {
        body.sii_password = siiPassword.trim()
      }
      await apiClient.put('/api/v1/rcv/credentials', body)
      setMsg({ type: 'ok', text: 'Credenciales SII guardadas correctamente' })
      setSiiPassword('')
      await fetchStatus()
    } catch {
      setMsg({ type: 'error', text: 'Error al guardar las credenciales' })
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(null), 4000)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setMsg(null)
    try {
      const { data } = await apiClient.post('/api/v1/rcv/test-credentials')
      setMsg({ type: 'ok', text: data.message ?? 'Conexion exitosa con el SII' })
    } catch (err: any) {
      const errorMsg = err.response?.data?.error ?? 'Error al probar la conexion'
      setMsg({ type: 'error', text: errorMsg })
    } finally {
      setTesting(false)
      setTimeout(() => setMsg(null), 5000)
    }
  }

  if (loading) return null

  return (
    <div className="card border border-[var(--cx-border-light)] rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Shield size={16} className="text-[var(--cx-active-icon)]" />
        <h3 className="text-sm font-semibold text-[var(--cx-text-primary)] uppercase tracking-wider">
          Credenciales SII — Sincronizacion RCV
        </h3>
      </div>

      <p className="text-xs text-[var(--cx-text-muted)] mb-4">
        Ingresa las credenciales del SII para sincronizar automaticamente el Registro de Compras y Ventas.
        La clave se almacena encriptada (AES-256).
      </p>

      {/* Status badges */}
      {credStatus && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {credStatus.has_password ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border border-[var(--cx-status-ok-border)]">
              <Wifi size={11} /> Credenciales configuradas
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--cx-status-warn-bg)] text-[var(--cx-status-warn-text)] border border-[var(--cx-status-warn-border)]">
              <WifiOff size={11} /> Sin credenciales
            </span>
          )}
          {credStatus.auto_sync && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--cx-active-bg)] text-[var(--cx-active-text)] border border-[var(--cx-active-border)]">
              <RefreshCw size={11} /> Sync automatico activo
            </span>
          )}
          {credStatus.last_sync && (
            <span className="text-[11px] text-[var(--cx-text-muted)]">
              Ultima sync: {new Date(credStatus.last_sync).toLocaleString('es-CL')}
            </span>
          )}
        </div>
      )}

      {/* Feedback */}
      {msg && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border mb-4 ${
          msg.type === 'ok'
            ? 'bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border-[var(--cx-status-ok-border)]'
            : 'bg-[var(--cx-status-error-bg)] text-[var(--cx-status-error-text)] border-[var(--cx-status-error-border)]'
        }`}>
          {msg.type === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {msg.text}
        </div>
      )}

      {/* Form */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">RUT para login SII *</label>
          <input
            value={siiUser}
            onChange={e => setSiiUser(e.target.value)}
            className="input-field text-sm w-full"
            placeholder="76673985-7"
          />
          <p className="text-[10px] text-[var(--cx-text-muted)] mt-1">RUT de la empresa o del representante legal</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">
            Clave Tributaria {credStatus?.has_password ? '(dejar vacio para mantener)' : '*'}
          </label>
          <input
            type="password"
            value={siiPassword}
            onChange={e => setSiiPassword(e.target.value)}
            className="input-field text-sm w-full"
            placeholder={credStatus?.has_password ? '••••••••' : 'Clave tributaria'}
          />
          <p className="text-[10px] text-[var(--cx-text-muted)] mt-1">La misma clave que usas para entrar a sii.cl</p>
        </div>
      </div>

      {/* Nocturnal sync card */}
      <div className={`mt-4 rounded-xl border p-4 transition-colors ${
        autoSync
          ? 'bg-[var(--cx-active-bg)] border-[var(--cx-active-border)]'
          : 'bg-[var(--cx-bg-elevated)] border-[var(--cx-border-light)]'
      }`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              autoSync ? 'bg-[var(--cx-active-icon)] text-white' : 'bg-[var(--cx-border-light)] text-[var(--cx-text-muted)]'
            }`}>
              <Moon size={18} />
            </div>
            <div>
              <span className="text-sm font-semibold text-[var(--cx-text-primary)]">Sincronizacion Nocturna</span>
              <p className="text-xs text-[var(--cx-text-secondary)] mt-0.5">
                Cada noche a las 01:00 AM se sincronizan automaticamente las compras y ventas del mes actual y el anterior desde el SII.
              </p>
              <p className="text-[11px] text-[var(--cx-text-muted)] mt-1">
                {autoSync
                  ? 'Al llegar en la manana, tus datos estaran actualizados.'
                  : 'Activa para tener tus datos listos cada manana sin hacer nada.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoSync}
            onClick={() => setAutoSync(!autoSync)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              autoSync ? 'bg-[var(--cx-active-icon)]' : 'bg-[var(--cx-border-light)]'
            }`}
          >
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
              autoSync ? 'translate-x-5.5' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 mt-5">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar Credenciales
        </button>
        {credStatus?.has_password && (
          <button
            onClick={handleTest}
            disabled={testing}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
            Probar Conexion
          </button>
        )}
      </div>
    </div>
  )
}
