/**
 * CUENTAX — Portal del Trabajador Layout
 * Simple, clean layout for employee self-service.
 * Separate from the main admin dashboard.
 */

'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import { usePortalAuthStore } from '@/stores/portal-auth.store'
import { usePortalProfile } from '@/hooks/use-portal'
import {
  Receipt, Briefcase, Clock4, CalendarDays, FileText,
  LogOut, User, Building2,
} from 'lucide-react'

// ── Navigation items ──────────────────────────────────────────
const NAV_ITEMS = [
  { href: '/portal',            icon: Receipt,      label: 'Mis Liquidaciones' },
  { href: '/portal/contrato',   icon: Briefcase,    label: 'Mi Contrato' },
  { href: '/portal/documentos', icon: FileText,     label: 'Documentos' },
  { href: '/portal/asistencia', icon: Clock4,       label: 'Asistencia' },
  { href: '/portal/ausencias',  icon: CalendarDays, label: 'Ausencias' },
  { href: '/portal/perfil',     icon: User,         label: 'Mi Perfil' },
]

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { employee, isAuthenticated, clearAuth } = usePortalAuthStore()
  const { profile } = usePortalProfile()

  // Redirect to login if not authenticated (skip if already on login page)
  useEffect(() => {
    if (!isAuthenticated && !pathname.startsWith('/portal/login')) {
      router.replace('/portal/login')
    }
  }, [isAuthenticated, pathname, router])

  // On login page — render without chrome
  if (pathname === '/portal/login') {
    return <>{children}</>
  }

  // Not authenticated — show nothing while redirecting
  if (!isAuthenticated) {
    return null
  }

  const handleLogout = () => {
    clearAuth()
    router.replace('/portal/login')
  }

  return (
    <div className="min-h-screen bg-[var(--cx-bg-base)]">
      {/* Top navigation bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-[var(--cx-border)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Company logo + brand */}
            <Link href="/portal" className="flex items-center gap-2.5">
              {profile?.company_logo ? (
                <Image
                  src={`data:image/png;base64,${profile.company_logo}`}
                  alt={profile.company_name ?? 'Empresa'}
                  width={32}
                  height={32}
                  className="w-8 h-8 rounded-lg object-contain"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm">
                  <Building2 size={16} className="text-white" />
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-slate-800 text-sm font-semibold tracking-tight leading-none max-w-[180px] truncate" title={profile?.company_name ?? ''}>
                  {profile?.company_name || <>CUENTA<span className="text-violet-600">X</span></>}
                </span>
                <span className="text-[10px] text-slate-400 leading-none mt-0.5">
                  Portal del Trabajador
                </span>
              </div>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden sm:flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const isActive =
                  item.href === '/portal'
                    ? pathname === '/portal' || pathname.startsWith('/portal/liquidaciones')
                    : pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-violet-50 text-violet-700'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <item.icon size={14} />
                    {item.label}
                  </Link>
                )
              })}
            </nav>

            {/* User info + logout */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
                <User size={14} />
                <span className="font-medium text-slate-700">{employee?.name ?? ''}</span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Cerrar sesion"
              >
                <LogOut size={14} />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </div>
          </div>

          {/* Mobile nav */}
          <nav className="flex sm:hidden items-center gap-1 pb-2 overflow-x-auto -mx-1 pr-4">
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href === '/portal'
                  ? pathname === '/portal' || pathname.startsWith('/portal/liquidaciones')
                  : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-violet-50 text-violet-700'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <item.icon size={13} />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--cx-border)] py-4 mt-8">
        <p className="text-center text-[11px] text-slate-400">
          CUENTAX Portal del Trabajador &middot; {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  )
}
