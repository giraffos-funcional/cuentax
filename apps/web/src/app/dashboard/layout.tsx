/**
 * CUENTAX — Dashboard Layout (Light Theme)
 * Sidebar with collapsible accordion sections to reduce visual clutter.
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/stores/auth.store'
import { useSIIStatus } from '@/hooks'
import { apiClient } from '@/lib/api-client'
import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard, FileText, BookOpen,
  Settings, LogOut, ChevronLeft, ChevronRight,
  AlertTriangle, CheckCircle2, Wifi, WifiOff,
  Building2, Bell, Search, Menu, Star,
  Tag, Users, FileX, BarChart3, Folders, Send, PieChart, ShoppingCart,
  ListTree, BookText, Scale, TrendingUp, ArrowLeftRight,
  UserCircle, Receipt, CalendarDays, Briefcase, ClipboardList, Clock4, Activity,
  Wrench, ShieldCheck, RefreshCw
} from 'lucide-react'

// ── Navigation structure ─────────────────────────────────────
type NavItem = { href: string; icon: LucideIcon; label: string }
type NavEntry =
  | NavItem
  | { section: string; icon: LucideIcon; collapsible: true; items: NavItem[] }

const NAV: NavEntry[] = [
  // Direct items
  { href: '/dashboard',        icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/dashboard/emitir', icon: Send,            label: 'Emitir DTE' },
  { href: '/dashboard/compras', icon: ShoppingCart,  label: 'Compras' },
  { href: '/dashboard/ventas',  icon: TrendingUp,    label: 'Ventas' },

  // Collapsible sections
  {
    section: 'Documentos',
    icon: BookOpen,
    collapsible: true,
    items: [
      { href: '/dashboard/documentos',   icon: FileText, label: 'Emitidos' },
      { href: '/dashboard/cotizaciones', icon: FileText, label: 'Cotizaciones' },
      { href: '/dashboard/anulaciones',  icon: FileX,    label: 'Anulaciones' },
    ],
  },
  {
    section: 'Contabilidad',
    icon: BarChart3,
    collapsible: true,
    items: [
      { href: '/dashboard/contabilidad',                    icon: PieChart,       label: 'Panel Contable' },
      { href: '/dashboard/reportes',                        icon: BarChart3,      label: 'Reportes' },
      { href: '/dashboard/contabilidad/plan-cuentas',       icon: ListTree,       label: 'Plan de Cuentas' },
      { href: '/dashboard/contabilidad/libro-diario',       icon: BookText,       label: 'Libro Diario' },
      { href: '/dashboard/contabilidad/libro-mayor',        icon: BookOpen,       label: 'Libro Mayor' },
      { href: '/dashboard/contabilidad/balance',            icon: Scale,          label: 'Balance General' },
      { href: '/dashboard/contabilidad/resultados',         icon: TrendingUp,     label: 'Estado Resultados' },
      { href: '/dashboard/contabilidad/conciliacion',       icon: ArrowLeftRight, label: 'Conciliación' },
      { href: '/dashboard/contabilidad/lcv',                icon: BookOpen,       label: 'Libro C/V' },
      { href: '/dashboard/contabilidad/centros-costo',       icon: Folders,        label: 'Centros Costo' },
      { href: '/dashboard/contabilidad/flujo-caja',          icon: TrendingUp,     label: 'Flujo de Caja' },
    ],
  },
  {
    section: 'Remuneraciones',
    icon: UserCircle,
    collapsible: true,
    items: [
      { href: '/dashboard/remuneraciones',               icon: UserCircle,    label: 'Panel RRHH' },
      { href: '/dashboard/remuneraciones/empleados',     icon: Users,         label: 'Empleados' },
      { href: '/dashboard/remuneraciones/liquidaciones', icon: Receipt,       label: 'Liquidaciones' },
      { href: '/dashboard/remuneraciones/nominas',       icon: ClipboardList, label: 'Nóminas' },
      { href: '/dashboard/remuneraciones/ausencias',     icon: CalendarDays,  label: 'Ausencias' },
      { href: '/dashboard/remuneraciones/contratos',     icon: Briefcase,     label: 'Contratos' },
      { href: '/dashboard/remuneraciones/asistencia',    icon: Clock4,        label: 'Asistencia' },
      { href: '/dashboard/remuneraciones/finiquitos',    icon: FileX,         label: 'Finiquitos' },
      { href: '/dashboard/remuneraciones/indicadores',   icon: Activity,      label: 'Indicadores' },
      { href: '/dashboard/remuneraciones/libro-remuneraciones', icon: BookText, label: 'Libro Rem.' },
      { href: '/dashboard/remuneraciones/previred', icon: Send, label: 'Previred' },
    ],
  },

  // Herramientas
  {
    section: 'Herramientas',
    icon: Wrench,
    collapsible: true,
    items: [
      { href: '/dashboard/herramientas/tareas',        icon: RefreshCw,   label: 'Tareas Automaticas' },
      { href: '/dashboard/herramientas/certificacion', icon: ShieldCheck, label: 'Certificación SII' },
      { href: '/dashboard/folios',                     icon: Folders,     label: 'Folios (CAF)' },
    ],
  },

  // Direct items (bottom)
  { href: '/dashboard/contactos',     icon: Users,    label: 'Contactos' },
  { href: '/dashboard/productos',     icon: Tag,      label: 'Productos' },
  { href: '/dashboard/empresa',       icon: Building2, label: 'Mi Empresa' },
  { href: '/dashboard/configuracion', icon: Settings, label: 'Config. SII' },
]

function isNavItem(entry: NavEntry): entry is NavItem {
  return 'href' in entry
}

// ── NavLink ──────────────────────────────────────────────────
function NavLink({ item, collapsed, pathname, indent = false }: {
  item: NavItem; collapsed: boolean; pathname: string; indent?: boolean
}) {
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={`
        flex items-center gap-3 px-3 py-2 rounded-xl text-sm
        transition-all duration-150 group
        ${isActive
          ? 'bg-[var(--cx-active-bg)] text-[var(--cx-active-text)] border border-[var(--cx-active-border)] font-semibold'
          : 'text-[var(--cx-text-secondary)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)]'
        }
        ${collapsed ? 'justify-center' : ''}
        ${indent && !collapsed ? 'ml-3 text-[13px]' : ''}
      `}
    >
      <item.icon
        size={indent ? 14 : 16}
        className={`shrink-0 ${isActive ? 'text-[var(--cx-active-icon)]' : 'text-[var(--cx-text-muted)] group-hover:text-[var(--cx-text-secondary)]'}`}
      />
      {!collapsed && <span className="font-medium">{item.label}</span>}
    </Link>
  )
}

// ── Collapsible NavSection ───────────────────────────────────
function NavSection({ section, icon: SectionIcon, items, collapsed, pathname, open, onToggle }: {
  section: string; icon: LucideIcon; items: NavItem[]; collapsed: boolean; pathname: string
  open: boolean; onToggle: () => void
}) {
  const isActive = items.some(item => pathname === item.href || pathname.startsWith(`${item.href}/`))

  if (collapsed) {
    return (
      <div
        title={section}
        className={`flex justify-center py-2.5 rounded-xl transition-colors ${
          isActive ? 'text-[var(--cx-active-icon)]' : 'text-[var(--cx-text-muted)]'
        }`}
      >
        <SectionIcon size={16} />
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={onToggle}
        className={`
          flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm
          transition-all duration-150
          ${isActive
            ? 'text-[var(--cx-active-text)] font-semibold'
            : 'text-[var(--cx-text-secondary)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)]'
          }
        `}
      >
        <SectionIcon
          size={16}
          className={`shrink-0 ${isActive ? 'text-[var(--cx-active-icon)]' : 'text-[var(--cx-text-muted)]'}`}
        />
        <span className="font-medium flex-1 text-left">{section}</span>
        <ChevronRight
          size={12}
          className={`shrink-0 text-[var(--cx-text-muted)] transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
        />
      </button>

      <div className={`overflow-hidden transition-all duration-200 ${open ? 'max-h-[800px] opacity-100 mt-0.5' : 'max-h-0 opacity-0'}`}>
        <div className="space-y-0.5">
          {items.map((item) => (
            <NavLink key={item.href} item={item} collapsed={false} pathname={pathname} indent />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Company Switcher + Create Modal ──────────────────────────
function CompanySwitcher({ collapsed }: { collapsed: boolean }) {
  const user = useAuthStore(s => s.user)
  const accessToken = useAuthStore(s => s.accessToken)
  const [open, setOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  const [rutError, setRutError] = useState('')
  const [companyList, setCompanyList] = useState<Array<{ id: number, name: string, rut: string }>>([])
  const [favoriteId, setFavoriteId] = useState<number | null>(null)
  const [form, setForm] = useState({
    rut: '', razon_social: '', giro: '', direccion: '', comuna: '', email: '', telefono: '',
  })

  // Fetch companies and favorite from API
  const fetchCompanies = () => {
    if (!user || !accessToken) return
    apiClient.get('/api/v1/companies').then(res => {
      setCompanyList(res.data?.companies ?? [])
    }).catch(err => {
      console.warn('Failed to fetch companies:', err)
    })
    apiClient.get('/api/v1/companies/favorite').then(res => {
      setFavoriteId(res.data?.favorite_company_id ?? null)
    }).catch(() => {})
  }
  useEffect(() => {
    fetchCompanies()
  }, [user?.uid, accessToken])

  const handleToggleFavorite = async (e: React.MouseEvent, companyId: number) => {
    e.stopPropagation()
    try {
      if (favoriteId === companyId) {
        await apiClient.delete('/api/v1/companies/favorite')
        setFavoriteId(null)
      } else {
        await apiClient.post('/api/v1/companies/favorite', { company_id: companyId })
        setFavoriteId(companyId)
      }
    } catch (err) {
      console.warn('Failed to toggle favorite:', err)
    }
  }

  // All hooks MUST be above this line
  if (collapsed || !user) return null

  const companies = companyList.length > 0 ? companyList : (user.companies ?? [])

  const handleSwitch = async (companyId: number) => {
    setOpen(false)
    setSwitching(true)
    try {
      const { data } = await apiClient.post('/api/v1/companies/switch', { company_id: companyId })
      if (data.access_token && data.user) {
        // Store new auth data in localStorage for Zustand rehydration
        localStorage.setItem('cuentax-auth', JSON.stringify({
          state: { user: data.user, isAuthenticated: true },
          version: 0,
        }))
        // Save access token in sessionStorage so it survives page reload
        // (Zustand doesn't persist accessToken by design, but we need it after switch)
        sessionStorage.setItem('cuentax_switch_token', data.access_token)
        // Store token in memory
        useAuthStore.setState({ accessToken: data.access_token, user: data.user, isAuthenticated: true })
        // Full page reload to clear all SWR cache and component state
        window.location.replace('/dashboard')
      }
    } catch (err: any) {
      const apiMsg = err?.response?.data?.message ?? err?.response?.data?.error ?? err?.message ?? 'Error desconocido'
      console.error('Error switching company:', err?.response?.data ?? err)
      setSwitching(false)
      alert(`Error al cambiar empresa: ${apiMsg}`)
    }
  }

  const validateRut = (rut: string): boolean => {
    const cleaned = rut.replace(/\./g, '').replace(/-/g, '').toUpperCase()
    if (cleaned.length < 8 || cleaned.length > 9) return false
    const body = cleaned.slice(0, -1)
    const dv = cleaned.slice(-1)
    let sum = 0, mul = 2
    for (let i = body.length - 1; i >= 0; i--) {
      sum += parseInt(body[i]) * mul
      mul = mul === 7 ? 2 : mul + 1
    }
    const rem = 11 - (sum % 11)
    const expected = rem === 11 ? '0' : rem === 10 ? 'K' : String(rem)
    return dv === expected
  }

  const handleRutChange = (value: string) => {
    setForm(f => ({ ...f, rut: value }))
    if (value.length >= 8) {
      setRutError(validateRut(value) ? '' : 'RUT inválido — dígito verificador incorrecto')
    } else {
      setRutError('')
    }
  }

  const handleLookupSII = async () => {
    if (!form.rut.trim() || !validateRut(form.rut)) return
    setLookingUp(true)
    try {
      const { data } = await apiClient.get(`/api/v1/companies/lookup-rut/${encodeURIComponent(form.rut)}`)
      if (data.found) {
        setForm(f => ({
          ...f,
          razon_social: data.razon_social || f.razon_social,
          giro: data.giro || f.giro,
        }))
      } else {
        setRutError('RUT no encontrado en el SII')
      }
    } catch {
      setRutError('Error consultando SII')
    } finally {
      setLookingUp(false)
    }
  }

  const handleCreate = async () => {
    if (!form.rut.trim() || !form.razon_social.trim() || !form.giro.trim()) return
    if (!validateRut(form.rut)) { setRutError('RUT inválido'); return }
    setCreating(true)
    try {
      await apiClient.post('/api/v1/companies', form)
      setShowCreate(false)
      setForm({ rut: '', razon_social: '', giro: '', direccion: '', comuna: '', email: '', telefono: '' })
      fetchCompanies()
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Error creando empresa'
      alert(msg)
    } finally {
      setCreating(false)
    }
  }

  // No companies at all — show only create button
  if (companies.length === 0) {
    return (
      <>
        <div className="px-3 py-3 border-b border-[var(--cx-border-lighter)]">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-[var(--cx-active-bg)] border border-[var(--cx-active-border)] cursor-pointer hover:bg-[var(--cx-hover-bg)] transition-colors text-left"
          >
            <span className="text-[var(--cx-active-icon)] text-lg leading-none shrink-0">+</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[var(--cx-active-text)]">Agregar Empresa</p>
              <p className="text-[10px] text-[var(--cx-text-muted)]">Configura tu primera empresa</p>
            </div>
          </button>
        </div>
        {showCreate && renderCreateModal()}
      </>
    )
  }

  return (
    <>
      <div className="px-3 py-3 border-b border-[var(--cx-border-lighter)] relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-[var(--cx-hover-bg)] border border-[var(--cx-border-light)] cursor-pointer hover:bg-[var(--cx-bg-elevated)] transition-colors text-left"
        >
          <Building2 size={14} className="text-[var(--cx-violet-600)] shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-[var(--cx-text-primary)] truncate">{user.company_name || 'Sin empresa'}</p>
            <p className="text-[10px] text-[var(--cx-text-muted)]">
              {companies.length > 1 ? 'Cambiar empresa' : 'Empresa activa'}
            </p>
          </div>
          <ChevronRight size={12} className={`text-[var(--cx-text-muted)] transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>

        {open && (
          <div className="absolute left-3 right-3 top-full mt-1 z-30 rounded-xl bg-[var(--cx-bg-surface)] border border-[var(--cx-border-light)] shadow-lg overflow-hidden">
            {companies.map((c) => (
              <div
                key={c.id}
                className={`flex items-center gap-3 w-full px-3 py-2.5 text-left text-sm transition-colors ${
                  c.id === user.company_id
                    ? 'bg-[var(--cx-active-bg)] text-[var(--cx-active-text)]'
                    : 'text-[var(--cx-text-secondary)] hover:bg-[var(--cx-hover-bg)]'
                }`}
              >
                <button
                  onClick={() => { if (c.id !== user.company_id) handleSwitch(c.id) }}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left"
                >
                  <Building2 size={12} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{c.name}</p>
                    <p className="text-[10px] text-[var(--cx-text-muted)] font-mono">{c.rut}</p>
                  </div>
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={(e) => handleToggleFavorite(e, c.id)}
                    className="p-0.5 rounded hover:bg-[var(--cx-hover-bg)] transition-colors"
                    title={favoriteId === c.id ? 'Quitar como favorita' : 'Iniciar siempre con esta empresa'}
                  >
                    <Star
                      size={12}
                      className={favoriteId === c.id
                        ? 'text-amber-500 fill-amber-500'
                        : 'text-[var(--cx-text-muted)] hover:text-amber-400'
                      }
                    />
                  </button>
                  {c.id === user.company_id && (
                    <CheckCircle2 size={12} className="text-[var(--cx-active-icon)]" />
                  )}
                </div>
              </div>
            ))}
            {/* Nueva Empresa */}
            <button
              onClick={() => { setOpen(false); setShowCreate(true) }}
              className="flex items-center gap-3 w-full px-3 py-2.5 text-left text-sm text-[var(--cx-active-icon)] hover:bg-[var(--cx-active-bg)] transition-colors border-t border-[var(--cx-border-light)]"
            >
              <span className="text-base leading-none">+</span>
              <span className="text-xs font-semibold">Nueva Empresa</span>
            </button>
          </div>
        )}
      </div>

      {/* Switching overlay */}
      {switching && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center animate-pulse">
              <span className="text-white font-bold text-sm">CX</span>
            </div>
            <p className="text-sm font-medium text-[var(--cx-text-secondary)]">Cambiando empresa...</p>
          </div>
        </div>
      )}

      {showCreate && renderCreateModal()}
    </>
  )

  function renderCreateModal() { return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="card p-6 w-full max-w-lg mx-4 shadow-xl">
            <h2 className="text-base font-bold text-[var(--cx-text-primary)] mb-4">Nueva Empresa</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">RUT *</label>
                  <div className="flex gap-2">
                    <input value={form.rut} onChange={e => handleRutChange(e.target.value)} placeholder="76.543.210-K" className={`input-field text-sm flex-1 ${rutError ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : ''}`} />
                    <button
                      type="button"
                      onClick={handleLookupSII}
                      disabled={lookingUp || !form.rut.trim() || !!rutError}
                      className="btn-secondary text-xs px-3 py-2 whitespace-nowrap shrink-0"
                    >
                      {lookingUp ? '...' : 'Buscar SII'}
                    </button>
                  </div>
                  {rutError && <p className="text-[11px] text-[var(--cx-status-error-text)] mt-0.5">{rutError}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Razón Social *</label>
                  <input value={form.razon_social} onChange={e => setForm(f => ({ ...f, razon_social: e.target.value }))} placeholder="Mi Empresa SpA" className="input-field text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Giro *</label>
                <input value={form.giro} onChange={e => setForm(f => ({ ...f, giro: e.target.value }))} placeholder="Desarrollo de Software" className="input-field text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Dirección</label>
                  <input value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} placeholder="Av. Providencia 123" className="input-field text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Comuna</label>
                  <input value={form.comuna} onChange={e => setForm(f => ({ ...f, comuna: e.target.value }))} placeholder="Providencia" className="input-field text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Email</label>
                  <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contacto@empresa.cl" className="input-field text-sm" type="email" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Teléfono</label>
                  <input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} placeholder="+56 9 1234 5678" className="input-field text-sm" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleCreate} disabled={creating || !form.rut.trim() || !form.razon_social.trim() || !form.giro.trim() || !!rutError} className="btn-primary flex-1 justify-center">
                {creating ? 'Creando...' : 'Crear Empresa'}
              </button>
              <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )
  }
}

// ── SII Indicator ────────────────────────────────────────────
interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  siiStatus: 'ok' | 'warning' | 'error' | 'loading'
  ambiente: string
}

function Sidebar({ collapsed, onToggle, siiStatus, ambiente }: SidebarProps) {
  const pathname = usePathname()

  // Determine which section should be open based on current path
  const getActiveSection = (): string | null => {
    for (const entry of NAV) {
      if (!isNavItem(entry) && entry.items.some(item => pathname === item.href || pathname.startsWith(`${item.href}/`))) {
        return entry.section
      }
    }
    return null
  }
  const [openSection, setOpenSection] = useState<string | null>(getActiveSection)

  // Auto-open when navigating into a section
  useEffect(() => {
    const active = getActiveSection()
    if (active) setOpenSection(active)
  }, [pathname])

  const SIIIndicator = () => {
    const map = {
      ok:      { icon: CheckCircle2, color: 'text-[var(--cx-status-ok-text)]',    bg: 'bg-[var(--cx-status-ok-bg)] border-[var(--cx-status-ok-border)]',       label: 'SII Conectado' },
      warning: { icon: AlertTriangle, color: 'text-[var(--cx-status-warn-text)]',  bg: 'bg-[var(--cx-status-warn-bg)] border-[var(--cx-status-warn-border)]',   label: 'Sin certificado' },
      error:   { icon: WifiOff,       color: 'text-[var(--cx-status-error-text)]', bg: 'bg-[var(--cx-status-error-bg)] border-[var(--cx-status-error-border)]', label: 'SII Sin conexión' },
      loading: { icon: Wifi,          color: 'text-[var(--cx-text-secondary)]',    bg: 'bg-[var(--cx-bg-elevated)] border-[var(--cx-border-light)]',            label: 'Verificando...' },
    }
    const { icon: Icon, color, bg, label } = map[siiStatus]
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${bg}`}>
        <Icon size={13} className={`${color} shrink-0`} />
        {!collapsed && <span className={`text-xs font-medium ${color}`}>{label}</span>}
      </div>
    )
  }

  return (
    <aside
      className={`
        relative flex flex-col h-full
        bg-[var(--cx-bg-surface)] border-r border-[var(--cx-border-light)]
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-[68px]' : 'w-[240px]'}
      `}
    >
      {/* Toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-6 z-10 w-6 h-6 rounded-full bg-[var(--cx-bg-surface)] border border-[var(--cx-border-light)] flex items-center justify-center text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-all shadow-sm"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Logo */}
      <div className={`flex items-center gap-3 p-4 border-b border-[var(--cx-border-lighter)] ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md shadow-violet-500/20 shrink-0">
          <span className="text-white font-bold text-sm tracking-tighter">CX</span>
        </div>
        {!collapsed && (
          <div>
            <span className="text-[var(--cx-text-primary)] text-sm font-bold tracking-tight">
              CUENTA<span className="text-[var(--cx-violet-600)]">X</span>
            </span>
            <div className="flex items-center gap-1 mt-0.5">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                ambiente === 'produccion'
                  ? 'bg-[var(--cx-status-ok-bg)] text-[var(--cx-status-ok-text)] border border-[var(--cx-status-ok-border)]'
                  : 'bg-[var(--cx-status-warn-bg)] text-[var(--cx-status-warn-text)] border border-[var(--cx-status-warn-border)]'
              }`}>
                {ambiente === 'produccion' ? 'PRODUCCIÓN' : 'CERT'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Company Switcher */}
      <CompanySwitcher collapsed={collapsed} />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {NAV.map((entry, i) => {
          if (isNavItem(entry)) {
            return <NavLink key={entry.href} item={entry} collapsed={collapsed} pathname={pathname} />
          }
          return (
            <NavSection
              key={entry.section}
              section={entry.section}
              icon={entry.icon}
              items={entry.items}
              collapsed={collapsed}
              pathname={pathname}
              open={openSection === entry.section}
              onToggle={() => setOpenSection(openSection === entry.section ? null : entry.section)}
            />
          )
        })}
      </nav>

      {/* Status SII + Logout */}
      <div className="p-3 border-t border-[var(--cx-border-lighter)] space-y-2">
        <SIIIndicator />
        <button
          onClick={async () => {
            try {
              await apiClient.post('/api/v1/auth/logout')
            } catch {}
            useAuthStore.getState().clearAuth()
            window.location.href = '/login'
          }}
          className={`
            flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm
            text-[var(--cx-text-muted)] hover:text-[var(--cx-status-error-text)] hover:bg-[var(--cx-status-error-bg)]
            transition-all duration-150
            ${collapsed ? 'justify-center' : ''}
          `}
        >
          <LogOut size={15} className="shrink-0" />
          {!collapsed && <span className="font-medium">Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  )
}

// ── Topbar ────────────────────────────────────────────────────
function Topbar({ title, collapsed, onMenuToggle }: { title: string, collapsed: boolean, onMenuToggle: () => void }) {
  const [showNotifications, setShowNotifications] = useState(false)

  return (
    <header className="h-14 flex items-center gap-4 px-6 border-b border-[var(--cx-border-light)] bg-[var(--cx-bg-surface)]/80 backdrop-blur-sm">
      <button
        onClick={onMenuToggle}
        className="md:hidden text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)]"
      >
        <Menu size={18} />
      </button>
      <h1 className="text-sm font-semibold text-[var(--cx-text-primary)]">{title}</h1>
      <div className="flex-1" />
      {/* Search */}
      <button
        onClick={() => {
          const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true })
          document.dispatchEvent(event)
        }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--cx-hover-bg)] border border-[var(--cx-border-light)] text-[var(--cx-text-muted)] hover:text-[var(--cx-text-secondary)] text-xs transition-colors"
      >
        <Search size={13} />
        <span className="hidden sm:block">Buscar...</span>
        <kbd className="hidden sm:block text-[10px] px-1.5 py-0.5 rounded bg-[var(--cx-bg-surface)] border border-[var(--cx-border-light)] text-[var(--cx-text-muted)]">⌘K</kbd>
      </button>
      {/* Notificaciones */}
      <div className="relative">
        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="relative w-8 h-8 rounded-lg flex items-center justify-center text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors"
        >
          <Bell size={15} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[var(--cx-violet-500)]" />
        </button>
        {showNotifications && (
          <div className="absolute right-0 top-10 w-64 rounded-xl bg-[var(--cx-bg-surface)] border border-[var(--cx-border-light)] shadow-lg p-4 z-50">
            <p className="text-xs font-semibold text-[var(--cx-text-primary)] mb-2">Notificaciones</p>
            <p className="text-xs text-[var(--cx-text-muted)]">Sin notificaciones nuevas</p>
          </div>
        )}
      </div>
    </header>
  )
}

// ── Layout Principal ──────────────────────────────────────────
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const { cert, connectivity } = useSIIStatus()

  // Derive sidebar SII status from real hook data
  const derivedSiiStatus: 'ok' | 'warning' | 'error' | 'loading' = (() => {
    if (!cert.cargado) return 'warning'
    if (cert.cargado && connectivity.conectado) return 'ok'
    if (cert.cargado && !connectivity.conectado) return 'error'
    return 'loading'
  })()
  const derivedAmbiente = connectivity.ambiente ?? 'certificacion'

  const getTitle = () => {
    const titles: Record<string, string> = {
      '/dashboard':                  'Panel Principal',
      '/dashboard/emitir':           'Emitir DTE',
      '/dashboard/documentos':       'Documentos Emitidos',
      '/dashboard/cotizaciones':     'Cotizaciones',
      '/dashboard/anulaciones':      'Anulaciones (NC/ND)',
      '/dashboard/reportes':         'Reportes',
      '/dashboard/folios':           'Administración de Folios',
      '/dashboard/contactos':        'Contactos',
      '/dashboard/productos':        'Productos y Servicios',
      '/dashboard/empresa':          'Mi Empresa',
      '/dashboard/configuracion':    'Configuración SII',
      '/dashboard/contabilidad':              'Panel Contable',
      '/dashboard/contabilidad/plan-cuentas': 'Plan de Cuentas',
      '/dashboard/contabilidad/libro-diario': 'Libro Diario',
      '/dashboard/contabilidad/libro-mayor':  'Libro Mayor',
      '/dashboard/contabilidad/balance':      'Balance General',
      '/dashboard/contabilidad/resultados':   'Estado de Resultados',
      '/dashboard/contabilidad/conciliacion': 'Conciliación Bancaria',
      '/dashboard/remuneraciones':               'Panel RRHH',
      '/dashboard/remuneraciones/empleados':     'Empleados',
      '/dashboard/remuneraciones/liquidaciones': 'Liquidaciones de Sueldo',
      '/dashboard/remuneraciones/nominas':       'Nóminas Mensuales',
      '/dashboard/remuneraciones/ausencias':     'Ausencias y Vacaciones',
      '/dashboard/remuneraciones/contratos':     'Contratos',
      '/dashboard/remuneraciones/asistencia':    'Asistencia',
      '/dashboard/remuneraciones/finiquitos':    'Finiquitos',
      '/dashboard/remuneraciones/indicadores':   'Indicadores Previsionales',
    }
    return titles[pathname] ?? 'CUENTAX'
  }

  return (
    <div className="flex h-screen bg-[var(--cx-bg-base)] overflow-hidden">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        siiStatus={derivedSiiStatus}
        ambiente={derivedAmbiente}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar
          title={getTitle()}
          collapsed={collapsed}
          onMenuToggle={() => setCollapsed(!collapsed)}
        />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
