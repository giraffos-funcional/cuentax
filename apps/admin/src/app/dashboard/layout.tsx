import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { adminFetch } from '@/lib/api'
import { clearAdminCookie, requireSession } from '@/lib/auth'
import { ThemeToggle } from '@/components/theme-toggle'
import { MobileSidebarToggle } from '@/components/mobile-sidebar-toggle'
import { LangToggle } from '@/components/lang-toggle'
import { t } from '@/lib/i18n'

interface Me { id: number; email: string; name: string | null; role: string }

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  requireSession()

  let me: Me
  try {
    me = await adminFetch<Me>('/me')
  } catch {
    clearAdminCookie()
    redirect('/login')
  }

  async function logout() {
    'use server'
    clearAdminCookie()
    redirect('/login')
  }

  return (
    <div className="min-h-screen flex">
      <MobileSidebarToggle />
      <aside className="cx-sidebar w-60 border-r border-border bg-white p-4 flex flex-col fixed md:static inset-y-0 left-0 z-40 -translate-x-full md:translate-x-0 transition-transform">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="font-semibold">{t('app.title')}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{me.email} · {me.role}</p>
          </div>
          <div className="flex items-center gap-1">
            <LangToggle />
            <ThemeToggle />
          </div>
        </div>
        <nav className="flex flex-col gap-1 text-sm">
          <Link href="/dashboard"                 className="px-3 py-2 rounded hover:bg-muted">{t('nav.overview')}</Link>
          <Link href="/dashboard/search"          className="px-3 py-2 rounded hover:bg-muted">{t('nav.search')}</Link>
          <Link href="/dashboard/tenants"         className="px-3 py-2 rounded hover:bg-muted">{t('nav.tenants')}</Link>
          <Link href="/dashboard/tenants/new"     className="px-3 py-2 rounded hover:bg-muted">{t('nav.newTenant')}</Link>
          <Link href="/dashboard/plans"           className="px-3 py-2 rounded hover:bg-muted">{t('nav.plans')}</Link>
          <Link href="/dashboard/billing"         className="px-3 py-2 rounded hover:bg-muted">{t('nav.billing')}</Link>
          <Link href="/dashboard/revenue-share"   className="px-3 py-2 rounded hover:bg-muted">{t('nav.revenueShare')}</Link>
          <Link href="/dashboard/audit"           className="px-3 py-2 rounded hover:bg-muted">{t('nav.audit')}</Link>
          <Link href="/dashboard/crons"           className="px-3 py-2 rounded hover:bg-muted">{t('nav.crons')}</Link>
          <Link href="/dashboard/security"        className="px-3 py-2 rounded hover:bg-muted">{t('nav.security')}</Link>
        </nav>
        <form action={logout} className="mt-auto">
          <button className="w-full text-left text-sm text-muted-foreground hover:text-zinc-900 px-3 py-2 rounded hover:bg-muted">
            {t('app.signOut')}
          </button>
        </form>
      </aside>
      <main className="flex-1 p-4 md:p-8 max-w-6xl pt-16 md:pt-8">{children}</main>
    </div>
  )
}
