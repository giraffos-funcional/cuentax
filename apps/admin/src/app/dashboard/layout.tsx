import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { adminFetch } from '@/lib/api'
import { clearAdminCookie, requireSession } from '@/lib/auth'

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
      <aside className="w-60 border-r border-border bg-white p-4 flex flex-col">
        <div className="mb-8">
          <h1 className="font-semibold">Cuentax Admin</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{me.email} · {me.role}</p>
        </div>
        <nav className="flex flex-col gap-1 text-sm">
          <Link href="/dashboard" className="px-3 py-2 rounded hover:bg-muted">Overview</Link>
          <Link href="/dashboard/tenants" className="px-3 py-2 rounded hover:bg-muted">Tenants</Link>
          <Link href="/dashboard/tenants/new" className="px-3 py-2 rounded hover:bg-muted">+ Nuevo tenant</Link>
          <Link href="/dashboard/plans" className="px-3 py-2 rounded hover:bg-muted">Planes</Link>
          <Link href="/dashboard/billing" className="px-3 py-2 rounded hover:bg-muted">Billing</Link>
          <Link href="/dashboard/revenue-share" className="px-3 py-2 rounded hover:bg-muted">Revenue share</Link>
          <Link href="/dashboard/audit" className="px-3 py-2 rounded hover:bg-muted">Audit log</Link>
          <Link href="/dashboard/security" className="px-3 py-2 rounded hover:bg-muted">Seguridad (2FA)</Link>
        </nav>
        <form action={logout} className="mt-auto">
          <button className="w-full text-left text-sm text-muted-foreground hover:text-zinc-900 px-3 py-2 rounded hover:bg-muted">
            Cerrar sesión
          </button>
        </form>
      </aside>
      <main className="flex-1 p-8 max-w-6xl">{children}</main>
    </div>
  )
}
