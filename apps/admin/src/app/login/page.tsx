import { redirect } from 'next/navigation'
import { adminFetch } from '@/lib/api'
import { setAdminCookie, getAdminToken } from '@/lib/auth'

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  if (getAdminToken()) redirect('/dashboard')

  async function login(formData: FormData) {
    'use server'
    const email = String(formData.get('email') ?? '').trim()
    const password = String(formData.get('password') ?? '')
    if (!email || !password) redirect('/login?error=missing')

    try {
      const result = await adminFetch<{ access_token: string }>('/auth/login', {
        method: 'POST',
        body: { email, password },
      })
      setAdminCookie(result.access_token)
    } catch {
      redirect('/login?error=invalid')
    }
    redirect('/dashboard')
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-border p-8">
        <h1 className="text-2xl font-semibold mb-1">Cuentax Admin</h1>
        <p className="text-sm text-muted-foreground mb-6">Acceso de operador interno</p>
        {searchParams.error === 'invalid' && (
          <p className="mb-4 text-sm text-destructive">Email o contraseña inválidos.</p>
        )}
        {searchParams.error === 'missing' && (
          <p className="mb-4 text-sm text-destructive">Completá email y contraseña.</p>
        )}
        <form action={login} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              name="email"
              required
              autoFocus
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Contraseña</span>
            <input
              type="password"
              name="password"
              required
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Iniciar sesión
          </button>
        </form>
      </div>
    </main>
  )
}
