/**
 * CUENTAX — Dashboard Layout
 * Mia (UX/UI): "Este layout es la primera impresión real del producto.
 * Sidebar colapsable, navegación contextual, indicador de ambiente SII,
 * y un sistema de notificaciones que no interrumpe el flujo."
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, FileText, ArrowUpDown, BookOpen,
  Settings, LogOut, ChevronLeft, ChevronRight,
  AlertTriangle, CheckCircle2, Wifi, WifiOff,
  Building2, Bell, Search, Menu
} from 'lucide-react'

const NAV_ITEMS = [
  {
    section: 'Principal',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { href: '/dashboard/emitir', icon: FileText, label: 'Emitir DTE' },
      { href: '/dashboard/documentos', icon: BookOpen, label: 'Documentos' },
    ],
  },
  {
    section: 'Contabilidad',
    items: [
      { href: '/dashboard/cotizaciones', icon: FileText, label: 'Cotizaciones' },
      { href: '/dashboard/reportes', icon: ArrowUpDown, label: 'Reportes' },
    ],
  },
  {
    section: 'Sistema',
    items: [
      { href: '/dashboard/configuracion', icon: Settings, label: 'Configuración SII' },
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
      ok:      { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'SII Conectado' },
      warning: { icon: AlertTriangle, color: 'text-amber-400',  bg: 'bg-amber-500/10',  label: 'Sin certificado' },
      error:   { icon: WifiOff,       color: 'text-red-400',    bg: 'bg-red-500/10',    label: 'SII Sin conexión' },
      loading: { icon: Wifi,          color: 'text-slate-400',  bg: 'bg-slate-500/10',  label: 'Verificando...' },
    }
    const { icon: Icon, color, bg, label } = map[siiStatus]
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${bg} border border-white/5`}>
        <Icon size={13} className={`${color} shrink-0`} />
        {!collapsed && <span className={`text-xs font-medium ${color}`}>{label}</span>}
      </div>
    )
  }

  return (
    <aside
      className={`
        relative flex flex-col h-full
        bg-slate-950 border-r border-white/[0.06]
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-[68px]' : 'w-[240px]'}
      `}
    >
      {/* Toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-6 z-10 w-6 h-6 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Logo */}
      <div className={`flex items-center gap-3 p-4 border-b border-white/[0.06] ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20 shrink-0">
          <span className="text-white font-bold text-sm tracking-tighter">CX</span>
        </div>
        {!collapsed && (
          <div>
            <span className="text-white text-sm font-bold tracking-tight">
              CUENTA<span className="text-violet-400">X</span>
            </span>
            <div className="flex items-center gap-1 mt-0.5">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                ambiente === 'produccion'
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-amber-500/15 text-amber-400'
              }`}>
                {ambiente === 'produccion' ? 'PRODUCCIÓN' : 'CERT'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Empresa activa */}
      {!collapsed && (
        <div className="px-3 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] cursor-pointer hover:bg-white/[0.06] transition-colors">
            <Building2 size={14} className="text-violet-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-white truncate">{companyName}</p>
              <p className="text-[10px] text-slate-500">Empresa activa</p>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {NAV_ITEMS.map((group) => (
          <div key={group.section}>
            {!collapsed && (
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-2 mb-1.5">
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
                        ? 'bg-violet-500/10 text-violet-300 border border-violet-500/20'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                      }
                      ${collapsed ? 'justify-center' : ''}
                    `}
                  >
                    <item.icon
                      size={16}
                      className={`shrink-0 ${isActive ? 'text-violet-400' : 'text-slate-500 group-hover:text-slate-300'}`}
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
      <div className="p-3 border-t border-white/[0.06] space-y-2">
        <SIIIndicator />
        <button className={`
          flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm
          text-slate-500 hover:text-red-400 hover:bg-red-500/5
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
  return (
    <header className="h-14 flex items-center gap-4 px-6 border-b border-white/[0.06] bg-slate-950/80 backdrop-blur-sm">
      <button
        onClick={onMenuToggle}
        className="md:hidden text-slate-400 hover:text-white"
      >
        <Menu size={18} />
      </button>
      <h1 className="text-sm font-semibold text-white">{title}</h1>
      <div className="flex-1" />
      {/* Search */}
      <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-slate-500 hover:text-slate-300 text-xs transition-colors">
        <Search size={13} />
        <span className="hidden sm:block">Buscar...</span>
        <kbd className="hidden sm:block text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-600">⌘K</kbd>
      </button>
      {/* Notificaciones */}
      <button className="relative w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">
        <Bell size={15} />
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-violet-400" />
      </button>
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
      '/dashboard': 'Panel Principal',
      '/dashboard/emitir': 'Emitir DTE',
      '/dashboard/documentos': 'Documentos',
      '/dashboard/cotizaciones': 'Cotizaciones',
      '/dashboard/reportes': 'Reportes',
      '/dashboard/configuracion': 'Configuración SII',
    }
    return titles[pathname] ?? 'CUENTAX'
  }

  return (
    <div className="flex h-screen bg-[#080c14] overflow-hidden">
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
