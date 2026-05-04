'use client'

import { useEffect, useState } from 'react'
import { Loader2, Shield, ShieldCheck, ShieldOff } from 'lucide-react'

const BFF_URL = process.env.NEXT_PUBLIC_BFF_URL ?? '' // Falls back to relative URLs (proxied)

interface Me {
  id: number
  email: string
  role: string
  totp_enabled: boolean
}

export default function SecurityPage() {
  const [me, setMe] = useState<Me | null>(null)
  const [enrollSecret, setEnrollSecret] = useState<string | null>(null)
  const [enrollUrl, setEnrollUrl] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')

  // The admin app uses a server-side cookie for auth. We hit /me through
  // a thin proxy that forwards the cookie token. Since this page is
  // client-side, we need a route that returns admin-scoped data.
  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setMe(d))
      .catch(() => setError('No se pudo cargar tu sesión.'))
  }, [])

  const startEnroll = async () => {
    setBusy(true); setError(null)
    try {
      const r = await fetch('/api/admin-proxy/auth/totp/enroll', {
        method: 'POST', credentials: 'include',
      })
      if (!r.ok) throw new Error('No se pudo iniciar 2FA')
      const j = await r.json()
      setEnrollSecret(j.secret)
      setEnrollUrl(j.otpauth_url)
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  const verifyEnroll = async () => {
    setBusy(true); setError(null)
    try {
      const r = await fetch('/api/admin-proxy/auth/totp/verify', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.error ?? 'Código inválido')
      }
      setEnrollSecret(null); setEnrollUrl(null); setCode('')
      setMe((m) => m ? { ...m, totp_enabled: true } : m)
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  const disable = async () => {
    setBusy(true); setError(null)
    try {
      const r = await fetch('/api/admin-proxy/auth/totp/disable', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: disablePassword }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.error ?? 'No se pudo desactivar')
      }
      setMe((m) => m ? { ...m, totp_enabled: false } : m)
      setDisablePassword('')
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  if (!me) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…
      </div>
    )
  }

  return (
    <>
      <header className="mb-6">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <Shield className="w-5 h-5" /> Seguridad
        </h2>
        <p className="text-sm text-muted-foreground">Tu sesión: {me.email} · {me.role}</p>
      </header>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      <section className="bg-white border border-border rounded-lg p-6">
        <h3 className="font-semibold mb-2 flex items-center gap-2">
          {me.totp_enabled
            ? <><ShieldCheck className="w-5 h-5 text-green-600" /> Autenticación de 2 factores activa</>
            : <><ShieldOff className="w-5 h-5 text-zinc-400" /> Autenticación de 2 factores desactivada</>}
        </h3>

        {!me.totp_enabled && !enrollSecret && (
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              Recomendamos activar 2FA para super-admins. Usá Google Authenticator,
              Authy o cualquier app TOTP estándar.
            </p>
            <button
              onClick={startEnroll}
              disabled={busy}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {busy && <Loader2 className="w-4 h-4 inline animate-spin mr-2" />}
              Activar 2FA
            </button>
          </div>
        )}

        {enrollSecret && enrollUrl && (
          <div className="space-y-4">
            <p className="text-sm">Escaneá este link en tu app de autenticación, o ingresá el secreto manualmente:</p>
            <div className="bg-zinc-50 p-3 rounded text-xs font-mono break-all border border-zinc-200">
              {enrollSecret}
            </div>
            <p className="text-xs text-muted-foreground">otpauth URL (para QR):</p>
            <code className="block bg-zinc-50 p-3 rounded text-xs break-all border border-zinc-200">{enrollUrl}</code>

            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
                pattern="\d{6}"
                className="rounded-md border border-border px-3 py-2 text-sm font-mono w-32"
              />
              <button
                onClick={verifyEnroll}
                disabled={busy || code.length !== 6}
                className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                Verificar y activar
              </button>
            </div>
          </div>
        )}

        {me.totp_enabled && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Para desactivar 2FA confirmá tu contraseña.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                placeholder="Contraseña"
                className="rounded-md border border-border px-3 py-2 text-sm"
              />
              <button
                onClick={disable}
                disabled={busy || !disablePassword}
                className="rounded-md bg-destructive text-destructive-foreground px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                Desactivar 2FA
              </button>
            </div>
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground mt-6">
        BFF: <code>{BFF_URL || '/proxy'}</code>
      </p>
    </>
  )
}
