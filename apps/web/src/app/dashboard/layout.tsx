/**
 * CUENTAX — Dashboard Layout (Light Theme)
 * Clean, professional sidebar with light surfaces.
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/stores/auth.store'
import { apiClient } from '@/lib/api-client'
import {
  LayoutDashboard, FileText, ArrowUpDown, BookOpen,
  Settings, LogOut, ChevronLeft, ChevronRight,
  AlertTriangle, CheckCircle2, Wifi, WifiOff,
  Building2, Bell, Search, Menu,
  Tag, Users, FileX, BarChart3, Folders, Send,
  ListTree, BookText, Scale, TrendingUp, ArrowLeftRight,
  UserCircle, Receipt, CalendarDays, Briefcase, ClipboardList, Clock4
} from 'lucide-react'

const NAV_ITEMS = [
  {
    section: 'Principal',
    items: [
      { href: '/dashboard',             icon: LayoutDashboard, label: 'Dashboard' },
      { href: '/dashboard/emitir',      icon: Send,            label: 'Emitir DTE' },
      { href: '/dashboard/documentos',  icon: BookOpen,        label: 'Documentos' },
      { href: '/dashboard/cotizaciones',icon: FileText,        label: 'Cotizaciones' },
      { href: '/dashboard/anulaciones', icon: FileX,           label: 'Anulaciones' },
    ],
  },
  {
    section: 'Contabilidad',
    items: [
      { href: '/dashboard/reportes',                        icon: BarChart3,      label: 'Reportes' },
      { href: '/dashboard/contabilidad/plan-cuentas',       icon: ListTree,       label: 'Plan de Cuentas' },
      { href: '/dashboard/contabilidad/libro-diario',       icon: BookText,       label: 'Libro Diario' },
      { href: '/dashboard/contabilidad/libro-mayor',        icon: BookOpen,       label: 'Libro Mayor' },
      { href: '/dashboard/contabilidad/balance',            icon: Scale,          label: 'Balance General' },
      { href: '/dashboard/contabilidad/resultados',         icon: TrendingUp,     label: 'Estado Resultados' },
      { href: '/dashboard/contabilidad/conciliacion',       icon: ArrowLeftRight, label: 'Conciliación' },
      { href: '/dashboard/folios',                          icon: Folders,        label: 'Folios (CAF)' },
    ],
  },
  {
    section: 'Remuneraciones',
    items: [
      { href: '/dashboard/remuneraciones',              icon: UserCircle,    label: 'Panel RRHH' },
      { href: '/dashboard/remuneraciones/empleados',    icon: Users,         label: 'Empleados' },
      { href: '/dashboard/remuneraciones/liquidaciones', icon: Receipt,       label: 'Liquidaciones' },
      { href: '/dashboard/remuneraciones/nominas',      icon: ClipboardList, label: 'Nóminas' },
      { href: '/dashboard/remuneraciones/ausencias',    icon: CalendarDays,  label: 'Ausencias' },
      { href: '/dashboard/remuneraciones/contratos',    icon: Briefcase,     label: 'Contratos' },
      { href: '/dashboard/remuneraciones/asistencia',   icon: Clock4,        label: 'Asistencia' },
    ],
  },
  {
    section: 'Maestros',
    items: [
      { href: '/dashboard/contactos', icon: Users, label: 'Contactos' },
      { href: '/dashboard/productos', icon: Tag,   label: 'Productos' },
    ],
  },
  {
    section: 'Sistema',
    items: [
      { href: '/dashboard/configuracion', icon: Settings, label: 'Config. SII' },
    ],
  },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  siiStatus: 'ok' | 'warning' | 'error' | 'loading'
  companyName: string
  ambiente: string
}

function Sidebar({ collapsed, onToggle, siiStatus, companyName, ambiente }: SidebarProps) {
  const pathname = usePathname()

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

      {/* Empresa activa */}
      {!collapsed && (
        <div className="px-3 py-3 border-b border-[var(--cx-border-lighter)]">
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[var(--cx-hover-bg)] border border-[var(--cx-border-light)] cursor-pointer hover:bg-[var(--cx-bg-elevated)] transition-colors">
            <Building2 size={14} className="text-[var(--cx-violet-600)] shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-[var(--cx-text-primary)] truncate">{companyName}</p>
              <p className="text-[10px] text-[var(--cx-text-muted)]">Empresa activa</p>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {NAV_ITEMS.map((group) => (
          <div key={group.section}>
            {!collapsed && (
              <p className="text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest px-2 mb-1.5">
                {group.section}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm
                      transition-all duration-150 group
                      ${isActive
                        ? 'bg-[var(--cx-active-bg)] text-[var(--cx-active-text)] border border-[var(--cx-active-border)] font-semibold'
                        : 'text-[var(--cx-text-secondary)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)]'
                      }
                      ${collapsed ? 'justify-center' : ''}
                    `}
                  >
                    <item.icon
                      size={16}
                      className={`shrink-0 ${isActive ? 'text-[var(--cx-active-icon)]' : 'text-[var(--cx-text-muted)] group-hover:text-[var(--cx-text-secondary)]'}`}
                    />
                    {!collapsed && (
                      <span className="font-medium">{item.label}</span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
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
            window.location.href = '/'
          }}
          className={`
          flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm
          text-[var(--cx-text-muted)] hover:text-[var(--cx-status-error-text)] hover:bg-[var(--cx-status-error-bg)]
          transition-all duration-150
          ${collapsed ? 'justify-center' : ''}
        `}>
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
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--cx-hover-bg)] border border-[var(--cx-border-light)] text-[var(--cx-text-muted)] hover:text-[var(--cx-text-secondary)] text-xs transition-colors">
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
      '/dashboard/configuracion':    'Configuración SII',
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
    }
    return titles[pathname] ?? 'CUENTAX'
  }

  return (
    <div className="flex h-screen bg-[var(--cx-bg-base)] overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        siiStatus="warning"
        companyName="Mi Empresa SpA"
        ambiente="certificacion"
      />

      {/* Main */}
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
