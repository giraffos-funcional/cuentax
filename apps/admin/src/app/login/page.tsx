import { redirect } from 'next/navigation'
import { adminFetch, AdminApiError } from '@/lib/api'
import { setAdminCookie, getAdminToken } from '@/lib/auth'
import { t } from '@/lib/i18n'

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; totp?: string; email?: string }
}) {
  if (getAdminToken()) redirect('/dashboard')

  async function login(formData: FormData) {
    'use server'
    const email = String(formData.get('email') ?? '').trim()
    const password = String(formData.get('password') ?? '')
    const totp_code = String(formData.get('totp_code') ?? '').trim() || undefined
    if (!email || !password) redirect('/login?error=missing')

    try {
      const result = await adminFetch<{ access_token: string }>('/auth/login', {
        method: 'POST',
        body: { email, password, ...(totp_code ? { totp_code } : {}) },
      })
      setAdminCookie(result.access_token)
    } catch (err) {
      if (err instanceof AdminApiError) {
        const code = (err.body as { error?: string })?.error
        if (code === 'totp_required' || code === 'invalid_totp') {
          // Re-render with TOTP field shown
          redirect(`/login?totp=1&email=${encodeURIComponent(email)}${code === 'invalid_totp' ? '&error=invalid_totp' : ''}`)
        }
      }
      redirect('/login?error=invalid')
    }
    redirect('/dashboard')
  }

  const showTotp = searchParams.totp === '1'

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-border p-8">
        <h1 className="text-2xl font-semibold mb-1">{t('login.title')}</h1>
        <p className="text-sm text-muted-foreground mb-6">{t('login.subtitle')}</p>

        {searchParams.error === 'invalid' && (
          <p className="mb-4 text-sm text-destructive">{t('login.error.invalid')}</p>
        )}
        {searchParams.error === 'invalid_totp' && (
          <p className="mb-4 text-sm text-destructive">{t('login.error.invalidTotp')}</p>
        )}
        {searchParams.error === 'missing' && (
          <p className="mb-4 text-sm text-destructive">{t('login.error.missing')}</p>
        )}

        <form action={login} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">{t('login.email')}</span>
            <input
              type="email"
              name="email"
              required
              defaultValue={searchParams.email ?? ''}
              autoFocus={!showTotp}
              readOnly={showTotp}
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">{t('login.password')}</span>
            <input
              type="password"
              name="password"
              required
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>

          {showTotp && (
            <label className="block">
              <span className="text-sm font-medium">{t('login.totp')}</span>
              <input
                type="text"
                name="totp_code"
                required
                pattern="\d{6}"
                inputMode="numeric"
                placeholder="123456"
                autoFocus
                className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="text-xs text-muted-foreground">{t('login.totpHint')}</span>
            </label>
          )}

          <button
            type="submit"
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {t('login.submit')}
          </button>
        </form>
      </div>
    </main>
  )
}
