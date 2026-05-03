/**
 * CUENTAX — Configuración de Empresa
 * Datos completos de la empresa para emisión DTE.
 * Usa /api/v1/companies/me (BFF) — sincroniza con Odoo automáticamente.
 */

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Building2, Upload, Save, Loader2, AlertCircle, CheckCircle2,
  Shield, Wifi, WifiOff, RefreshCw, Moon, FileCheck2, Info,
} from 'lucide-react'
import { useUpdateCompany } from '@/hooks/use-remuneraciones'
import { useAuthStore } from '@/stores/auth.store'
import { apiClient } from '@/lib/api-client'

const REGIONES_CL = [
  'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo',
  'Valparaíso', 'Metropolitana', 'O\'Higgins', 'Maule', 'Ñuble',
  'Biobío', 'La Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes',
]

const OFICINAS_REGIONALES_SII = [
  'Arica', 'Iquique', 'Antofagasta', 'Calama', 'Copiapó', 'La Serena', 'Ovalle',
  'Valparaíso', 'Viña del Mar', 'Los Andes', 'Quillota', 'San Antonio',
  'Santiago Centro', 'Santiago Norte', 'Santiago Sur', 'Santiago Oriente', 'Santiago Poniente',
  'Maipú', 'Ñuñoa', 'Providencia', 'Las Condes',
  'Rancagua', 'San Fernando', 'Talca', 'Curicó', 'Linares', 'Chillán',
  'Concepción', 'Talcahuano', 'Los Ángeles', 'Temuco', 'Angol', 'Valdivia',
  'Osorno', 'Puerto Montt', 'Castro', 'Coyhaique', 'Punta Arenas',
]

const TIPOS_CONTRIBUYENTE = [
  { value: 'iva_afecto_1a', label: 'IVA afecto 1ª categoría' },
  { value: 'iva_afecto_2a', label: 'IVA afecto 2ª categoría' },
  { value: 'exento', label: 'Exento' },
  { value: 'pequeno_contribuyente', label: 'Pequeño contribuyente' },
] as const

type TabKey = 'general' | 'dte'

interface CompanyForm {
  // General
  razon_social: string
  rut: string
  giro: string
  tipo_contribuyente: string
  actividad_economica: string
  actividades_economicas_extra: string
  direccion: string
  comuna: string
  ciudad: string
  region: string
  telefono: string
  movil: string
  email: string
  sitio_web: string
  // DTE / Resolución
  correo_dte: string
  ambiente_sii: string
  oficina_regional_sii: string
  numero_resolucion_sii: string
  fecha_resolucion_sii: string
}

const EMPTY_FORM: CompanyForm = {
  razon_social: '', rut: '', giro: '', tipo_contribuyente: '',
  actividad_economica: '', actividades_economicas_extra: '',
  direccion: '', comuna: '', ciudad: 'Santiago', region: '',
  telefono: '', movil: '', email: '', sitio_web: '',
  correo_dte: '', ambiente_sii: 'certificacion',
  oficina_regional_sii: '', numero_resolucion_sii: '', fecha_resolucion_sii: '',
}

export default function EmpresaPage() {
  const companyId = useAuthStore(s => s.user?.company_id)
  const [tab, setTab] = useState<TabKey>('general')
  const [form, setForm] = useState<CompanyForm>(EMPTY_FORM)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoBase64, setLogoBase64] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [readiness, setReadiness] = useState<{ ready: boolean; missing: string[] } | null>(null)
  const [actividadesSII, setActividadesSII] = useState<Array<{ codigo: number; descripcion: string }>>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const { update: updateOdooLegacy } = useUpdateCompany()

  // Pull actividades económicas from SII based on current RUT
  useEffect(() => {
    const rut = (form.rut || '').replace(/\./g, '').trim()
    if (!rut || rut.length < 8) return
    apiClient.get(`/api/v1/companies/lookup-rut/${encodeURIComponent(rut)}`)
      .then(r => {
        const list = Array.isArray(r.data?.actividades) ? r.data.actividades : []
        setActividadesSII(list.filter((a: any) => a?.codigo && a?.descripcion))
      })
      .catch(() => setActividadesSII([]))
  }, [form.rut])

  const fetchAll = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [{ data: company }, { data: ready }, { data: legacy }] = await Promise.all([
        apiClient.get('/api/v1/companies/me'),
        apiClient.get('/api/v1/companies/me/readiness').catch(() => ({ data: null })),
        apiClient.get('/api/v1/remuneraciones/empresa').catch(() => ({ data: null })),
      ])
      const c = company ?? {}
      const clean = (v: unknown) => (!v || v === false || String(v) === 'False') ? '' : String(v)
      setForm({
        razon_social: clean(c.razon_social) || clean(c.name),
        rut: clean(c.rut),
        giro: clean(c.giro),
        tipo_contribuyente: clean(c.tipo_contribuyente),
        actividad_economica: c.actividad_economica != null ? String(c.actividad_economica) : '',
        actividades_economicas_extra: Array.isArray(c.actividades_economicas)
          ? c.actividades_economicas.join(', ')
          : '',
        direccion: clean(c.direccion),
        comuna: clean(c.comuna),
        ciudad: clean(c.ciudad) || 'Santiago',
        region: clean(c.region),
        telefono: clean(c.telefono),
        movil: clean(c.movil),
        email: clean(c.email),
        sitio_web: clean(c.sitio_web),
        correo_dte: clean(c.correo_dte),
        ambiente_sii: clean(c.ambiente_sii) || 'certificacion',
        oficina_regional_sii: clean(c.oficina_regional_sii),
        numero_resolucion_sii: c.numero_resolucion_sii != null ? String(c.numero_resolucion_sii) : '',
        fecha_resolucion_sii: toIsoDate(c.fecha_resolucion_sii),
      })
      setReadiness(ready)
      const odooLogo = legacy?.empresa?.logo
      if (odooLogo && odooLogo !== false && String(odooLogo) !== 'False') {
        setLogoPreview(`data:image/png;base64,${odooLogo}`)
      } else {
        setLogoPreview(null)
      }
    } catch (err: any) {
      setError(err?.message ?? 'Error cargando empresa')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [companyId, fetchAll])

  const set = <K extends keyof CompanyForm>(field: K, value: CompanyForm[K]) =>
    setForm(prev => ({ ...prev, [field]: value }))

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

  const handleSave = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const extras = form.actividades_economicas_extra
        .split(',').map(s => s.trim()).filter(Boolean)
        .map(Number).filter(n => Number.isInteger(n))

      const payload: Record<string, unknown> = {
        razon_social: form.razon_social || undefined,
        giro: form.giro || undefined,
        tipo_contribuyente: form.tipo_contribuyente || undefined,
        actividad_economica: form.actividad_economica
          ? Number(form.actividad_economica) : undefined,
        actividades_economicas: extras.length ? extras : undefined,
        direccion: form.direccion || undefined,
        comuna: form.comuna || undefined,
        ciudad: form.ciudad || undefined,
        region: form.region || undefined,
        telefono: form.telefono || undefined,
        movil: form.movil || undefined,
        email: form.email || undefined,
        sitio_web: form.sitio_web || undefined,
        correo_dte: form.correo_dte || undefined,
        ambiente_sii: form.ambiente_sii || undefined,
        oficina_regional_sii: form.oficina_regional_sii || undefined,
        numero_resolucion_sii: form.numero_resolucion_sii
          ? Number(form.numero_resolucion_sii) : undefined,
        fecha_resolucion_sii: form.fecha_resolucion_sii || undefined,
      }
      await apiClient.put('/api/v1/companies/me', payload)

      // Logo va vía Odoo (legacy)
      if (logoBase64) {
        await updateOdooLegacy({ logo: logoBase64 })
        setLogoBase64(null)
      }

      await fetchAll()
      setMsg({ type: 'ok', text: 'Empresa actualizada correctamente' })
    } catch (err: any) {
      const detail = err?.response?.data?.details?.fieldErrors
      if (detail) {
        const first = Object.entries(detail)[0]
        setMsg({ type: 'error', text: `${first[0]}: ${(first[1] as string[])[0]}` })
      } else {
        setMsg({ type: 'error', text: 'Error al guardar los datos' })
      }
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(null), 4000)
    }
  }

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
        <span className="text-sm text-[var(--cx-status-error-text)]">{error}</span>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Configuración de Empresa</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            Datos requeridos para emisión de Documentos Tributarios Electrónicos.
          </p>
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

      {/* Readiness banner */}
      {readiness && (
        readiness.ready ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl border bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border-[var(--cx-status-ok-border)] text-sm">
            <FileCheck2 size={16} />
            <span><b>Empresa lista para emitir DTE.</b> Todos los campos requeridos están completos.</span>
          </div>
        ) : (
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl border bg-[var(--cx-status-warn-bg)] text-[var(--cx-status-warn-text)] border-[var(--cx-status-warn-border)] text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div>
              <b>Empresa incompleta — la emisión está bloqueada.</b>
              <span className="block text-xs mt-1">Faltan: {readiness.missing.join(', ')}.</span>
            </div>
          </div>
        )
      )}

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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--cx-border-light)]">
        {([
          { key: 'general' as TabKey, label: 'Información General' },
          { key: 'dte' as TabKey, label: 'Facturación Electrónica' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${
              tab === t.key
                ? 'border-[var(--cx-active-icon)] text-[var(--cx-text-primary)]'
                : 'border-transparent text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <>
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
                <p className="text-xs text-[var(--cx-text-muted)] mt-2">PNG o JPG, max 2MB. Aparece en facturas, liquidaciones y contratos.</p>
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

          {/* General Info */}
          <div className="card border border-[var(--cx-border-light)] rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-[var(--cx-text-primary)] uppercase tracking-wider mb-4">Información General</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Razón Social *">
                <input value={form.razon_social} onChange={e => set('razon_social', e.target.value)} className="input-field text-sm w-full" placeholder="GIRAFFOS LIMITADA" />
              </Field>
              <Field label="RUT *">
                <input value={form.rut} onChange={e => set('rut', e.target.value)} className="input-field text-sm w-full" placeholder="76.543.210-K" disabled />
                <Hint>Para cambiar el RUT, contacta a soporte.</Hint>
              </Field>
              <Field label="Giro / Descripción de actividad *" className="sm:col-span-2">
                <input value={form.giro} onChange={e => set('giro', e.target.value)} className="input-field text-sm w-full" placeholder="CONSULTORIA EN INFORMATICA" />
              </Field>
              <Field label="Tipo de contribuyente *">
                <select value={form.tipo_contribuyente} onChange={e => set('tipo_contribuyente', e.target.value)} className="input-field text-sm w-full">
                  <option value="">— Seleccionar —</option>
                  {TIPOS_CONTRIBUYENTE.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Actividad económica principal *">
                {actividadesSII.length > 0 ? (
                  <select
                    value={form.actividad_economica}
                    onChange={e => set('actividad_economica', e.target.value)}
                    className="input-field text-sm w-full"
                  >
                    <option value="">— Seleccionar —</option>
                    {actividadesSII.map(a => (
                      <option key={a.codigo} value={a.codigo}>
                        {a.codigo} — {a.descripcion}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    value={form.actividad_economica}
                    onChange={e => set('actividad_economica', e.target.value)}
                    className="input-field text-sm w-full"
                    placeholder="620200"
                  />
                )}
                <Hint>
                  {actividadesSII.length > 0
                    ? `${actividadesSII.length} actividad${actividadesSII.length > 1 ? 'es' : ''} consultada${actividadesSII.length > 1 ? 's' : ''} desde el SII según el RUT.`
                    : 'Código CIIU del SII (ej. 620200 = Consultoría informática)'}
                </Hint>
              </Field>
              <Field label="Actividades económicas adicionales" className="sm:col-span-2">
                {actividadesSII.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {actividadesSII.map(a => {
                      const codes = form.actividades_economicas_extra
                        .split(',').map(s => s.trim()).filter(Boolean)
                      const checked = codes.includes(String(a.codigo))
                      const isPrimary = String(a.codigo) === form.actividad_economica
                      return (
                        <label
                          key={a.codigo}
                          className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${
                            checked || isPrimary
                              ? 'bg-[var(--cx-active-bg)] border-[var(--cx-active-border)] text-[var(--cx-active-text)]'
                              : 'bg-[var(--cx-bg-elevated)] border-[var(--cx-border-light)]'
                          } ${isPrimary ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          <input
                            type="checkbox"
                            disabled={isPrimary}
                            checked={checked || isPrimary}
                            onChange={e => {
                              const next = new Set(codes)
                              if (e.target.checked) next.add(String(a.codigo))
                              else next.delete(String(a.codigo))
                              set('actividades_economicas_extra', Array.from(next).join(', '))
                            }}
                          />
                          <span><b>{a.codigo}</b> — {a.descripcion}</span>
                        </label>
                      )
                    })}
                  </div>
                ) : (
                  <input
                    value={form.actividades_economicas_extra}
                    onChange={e => set('actividades_economicas_extra', e.target.value)}
                    className="input-field text-sm w-full"
                    placeholder="620100, 631100"
                  />
                )}
                <Hint>
                  {actividadesSII.length > 0
                    ? 'La actividad principal queda marcada automáticamente. Tildá las adicionales que correspondan.'
                    : 'Códigos CIIU separados por coma (opcional)'}
                </Hint>
              </Field>
              <Field label="Dirección *" className="sm:col-span-2">
                <input value={form.direccion} onChange={e => set('direccion', e.target.value)} className="input-field text-sm w-full" placeholder="Av. Irarrázabal 2401 oficina 1108" />
              </Field>
              <Field label="Comuna *">
                <input value={form.comuna} onChange={e => set('comuna', e.target.value)} className="input-field text-sm w-full" placeholder="Ñuñoa" />
              </Field>
              <Field label="Ciudad *">
                <input value={form.ciudad} onChange={e => set('ciudad', e.target.value)} className="input-field text-sm w-full" placeholder="Santiago" />
              </Field>
              <Field label="Región">
                <select value={form.region} onChange={e => set('region', e.target.value)} className="input-field text-sm w-full">
                  <option value="">— Seleccionar —</option>
                  {REGIONES_CL.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Teléfono">
                <input value={form.telefono} onChange={e => set('telefono', e.target.value)} className="input-field text-sm w-full" placeholder="+56 2 1234 5678" />
              </Field>
              <Field label="Móvil">
                <input value={form.movil} onChange={e => set('movil', e.target.value)} className="input-field text-sm w-full" placeholder="+56 9 1234 5678" />
              </Field>
              <Field label="Email">
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className="input-field text-sm w-full" placeholder="contacto@empresa.cl" />
              </Field>
              <Field label="Sitio Web" className="sm:col-span-2">
                <input value={form.sitio_web} onChange={e => set('sitio_web', e.target.value)} className="input-field text-sm w-full" placeholder="https://empresa.cl" />
              </Field>
            </div>
          </div>
        </>
      )}

      {tab === 'dte' && (
        <>
          <div className="card border border-[var(--cx-border-light)] rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <FileCheck2 size={16} className="text-[var(--cx-active-icon)]" />
              <h3 className="text-sm font-semibold text-[var(--cx-text-primary)] uppercase tracking-wider">Resolución SII y DTE</h3>
            </div>
            <p className="text-xs text-[var(--cx-text-muted)] mb-4 flex items-start gap-1">
              <Info size={12} className="mt-0.5 shrink-0" />
              Datos de la resolución que autoriza a la empresa a emitir documentos tributarios electrónicos. Se usan en Caratula, libros y firma.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Correo DTE *">
                <input type="email" value={form.correo_dte} onChange={e => set('correo_dte', e.target.value)} className="input-field text-sm w-full" placeholder="dte@empresa.cl" />
                <Hint>Buzón al que llegan los DTEs recibidos. Distinto del email general.</Hint>
              </Field>
              <Field label="Ambiente *">
                <select value={form.ambiente_sii} onChange={e => set('ambiente_sii', e.target.value)} className="input-field text-sm w-full">
                  <option value="certificacion">Certificación</option>
                  <option value="produccion">Producción</option>
                </select>
                <Hint>Cambiar a Producción solo después de obtener la Resolución SII.</Hint>
              </Field>
              <Field label="Oficina Regional SII *">
                <select value={form.oficina_regional_sii} onChange={e => set('oficina_regional_sii', e.target.value)} className="input-field text-sm w-full">
                  <option value="">— Seleccionar —</option>
                  {OFICINAS_REGIONALES_SII.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Número de Resolución SII *">
                <input type="number" value={form.numero_resolucion_sii} onChange={e => set('numero_resolucion_sii', e.target.value)} className="input-field text-sm w-full" placeholder="80" />
              </Field>
              <Field label="Fecha de Resolución SII *">
                <DateDDMMYYYYInput
                  value={form.fecha_resolucion_sii}
                  onChange={v => set('fecha_resolucion_sii', v)}
                />
                <Hint>Formato dd/mm/yyyy (ej. 22/08/2014)</Hint>
              </Field>
            </div>
          </div>

          <SIICredentialsCard />
        </>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">{label}</label>
      {children}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] text-[var(--cx-text-muted)] mt-1">{children}</p>
}

// Coerce server value (string ISO, Date, or Date-as-string) to 'YYYY-MM-DD'.
// Avoids tz-shift bugs with String(Date).slice in Santiago (UTC-4).
function toIsoDate(v: unknown): string {
  if (!v) return ''
  if (typeof v === 'string') {
    // Already ISO date or ISO datetime → first 10 chars
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
    // Date.toString() format: parse via Date
    const d = new Date(v)
    return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`
  }
  return ''
}

// Text input dd/mm/yyyy that stores ISO yyyy-mm-dd internally
function DateDDMMYYYYInput({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const isoToDmy = (iso: string) => {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
  }
  const [text, setText] = useState(isoToDmy(value))
  useEffect(() => { setText(isoToDmy(value)) }, [value])

  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8)
    let formatted = digits
    if (digits.length >= 5) formatted = `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`
    else if (digits.length >= 3) formatted = `${digits.slice(0,2)}/${digits.slice(2)}`
    setText(formatted)
    const m = formatted.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (m) {
      const dd = m[1], mm = m[2], yyyy = m[3]
      const dt = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
      if (dt.getFullYear() === Number(yyyy) && dt.getMonth() + 1 === Number(mm) && dt.getDate() === Number(dd)) {
        onChange(`${yyyy}-${mm}-${dd}`)
        return
      }
    }
    if (formatted === '') onChange('')
  }

  return (
    <input
      type="text"
      value={text}
      onChange={e => handleChange(e.target.value)}
      placeholder="dd/mm/yyyy"
      maxLength={10}
      inputMode="numeric"
      className="input-field text-sm w-full"
    />
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

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/api/v1/rcv/credentials')
      setCredStatus(data)
      setSiiUser(data.sii_user ?? '')
      setAutoSync(data.auto_sync ?? false)
      setSiiPassword('')
    } catch {
      // Non-critical
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
      if (siiPassword.trim()) body.sii_password = siiPassword.trim()
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
          Credenciales SII — Sincronización RCV
        </h3>
      </div>

      <p className="text-xs text-[var(--cx-text-muted)] mb-4">
        Credenciales del SII para sincronizar Registro de Compras y Ventas.
        La clave se almacena encriptada (AES-256).
      </p>

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
              <RefreshCw size={11} /> Sync automático activo
            </span>
          )}
          {credStatus.last_sync && (
            <span className="text-[11px] text-[var(--cx-text-muted)]">
              Última sync: {new Date(credStatus.last_sync).toLocaleString('es-CL')}
            </span>
          )}
        </div>
      )}

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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="RUT para login SII *">
          <input value={siiUser} onChange={e => setSiiUser(e.target.value)} className="input-field text-sm w-full" placeholder="76673985-7" />
          <Hint>RUT de la empresa o del representante legal.</Hint>
        </Field>
        <Field label={`Clave Tributaria ${credStatus?.has_password ? '(dejar vacío para mantener)' : '*'}`}>
          <input
            type="password"
            value={siiPassword}
            onChange={e => setSiiPassword(e.target.value)}
            className="input-field text-sm w-full"
            placeholder={credStatus?.has_password ? '••••••••' : 'Clave tributaria'}
          />
          <Hint>La misma clave que usas para entrar a sii.cl.</Hint>
        </Field>
      </div>

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
              <span className="text-sm font-semibold text-[var(--cx-text-primary)]">Sincronización Nocturna</span>
              <p className="text-xs text-[var(--cx-text-secondary)] mt-0.5">
                Cada noche a las 01:00 AM se sincronizan automáticamente las compras y ventas del mes actual y el anterior desde el SII.
              </p>
              <p className="text-[11px] text-[var(--cx-text-muted)] mt-1">
                {autoSync
                  ? 'Al llegar en la mañana, tus datos estarán actualizados.'
                  : 'Activa para tener tus datos listos cada mañana sin hacer nada.'}
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
            Probar Conexión
          </button>
        )}
      </div>
    </div>
  )
}
