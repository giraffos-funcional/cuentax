/**
 * CUENTAX — Self-serve signup (Phase 04 T4.1).
 *
 * Form: nombre, email, slug, RUT, plan. Live availability check on slug.
 * On submit, calls /api/v1/signup and redirects to <slug>.cuentax.cl.
 */
'use client'

import { useState, useEffect } from 'react'
import { Loader2, CheckCircle2, XCircle, Building2 } from 'lucide-react'

const BFF_URL = process.env['NEXT_PUBLIC_BFF_URL'] ?? ''

export default function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [slug, setSlug] = useState('')
  const [rut, setRut] = useState('')
  const [plan, setPlan] = useState('starter')
  const [submitting, setSubmitting] = useState(false)
  const [slugCheck, setSlugCheck] = useState<{ available: boolean; reason?: string } | null>(null)
  const [slugChecking, setSlugChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ url: string; trial: string | null } | null>(null)

  // Debounced slug availability
  useEffect(() => {
    const v = slug.trim().toLowerCase()
    if (!v || v.length < 2) { setSlugCheck(null); return }
    setSlugChecking(true)
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${BFF_URL}/api/v1/signup/slug-available?slug=${encodeURIComponent(v)}`)
        if (r.ok) setSlugCheck(await r.json())
      } catch { /* ignore */ }
      finally { setSlugChecking(false) }
    }, 400)
    return () => clearTimeout(t)
  }, [slug])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`${BFF_URL}/api/v1/signup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name, email,
          slug:        slug.trim().toLowerCase(),
          primary_rut: rut || undefined,
          plan_code:   plan,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.message ?? data?.error ?? 'Error al crear la cuenta')
        return
      }
      setSuccess({ url: data.tenant_url, trial: data.trial_ends_at })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-zinc-200 p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-3" />
          <h1 className="text-2xl font-semibold mb-1">¡Cuenta creada!</h1>
          <p className="text-sm text-zinc-600 mb-4">
            {success.trial
              ? `Trial activo hasta el ${new Date(success.trial).toLocaleDateString('es-CL')}.`
              : 'Tu cuenta está lista para empezar.'}
          </p>
          <a
            href={success.url}
            className="inline-block rounded-md bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 text-sm font-medium"
          >
            Ir a {success.url.replace('https://', '')}
          </a>
        </div>
      </main>
    )
  }

  const slugOk = slugCheck?.available === true
  const canSubmit = name && email && slug && slugOk && !submitting

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-50 px-4 py-10">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-zinc-200 p-8">
        <header className="mb-6 text-center">
          <Building2 className="w-10 h-10 text-blue-600 mx-auto mb-2" />
          <h1 className="text-2xl font-semibold">Probar Cuentax 14 días</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Para contadores y despachos contables.
          </p>
        </header>

        {error && (
          <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Nombre del despacho">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: ACME Asesores Tributarios"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>

          <Field label="Email">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contador@empresa.cl"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>

          <Field
            label="Subdominio"
            hint={slug && (
              <span className="font-mono">
                {slug.trim().toLowerCase()}.cuentax.cl
              </span>
            )}
          >
            <div className="relative">
              <input
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value.replace(/[^a-z0-9-]/gi, ''))}
                placeholder="ej: acme-asesores"
                pattern="[a-z0-9](-?[a-z0-9])*"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 pr-9"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                {slugChecking ? <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                 : slugCheck?.available ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                 : slugCheck && !slugCheck.available ? <XCircle className="w-4 h-4 text-red-600" />
                 : null}
              </span>
            </div>
            {slugCheck && !slugCheck.available && (
              <p className="text-xs text-red-600 mt-1">
                {slugCheck.reason === 'taken'    && 'Ese subdominio ya está en uso.'}
                {slugCheck.reason === 'reserved' && 'Ese subdominio está reservado.'}
                {slugCheck.reason === 'invalid'  && 'Sólo letras, números y guiones.'}
              </p>
            )}
          </Field>

          <Field label="RUT del despacho (opcional)">
            <input
              value={rut}
              onChange={(e) => setRut(e.target.value)}
              placeholder="76123456-7"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>

          <Field label="Plan">
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="starter">Starter ($19.000/mes — 100 DTEs, 3 PYMEs)</option>
              <option value="pro">Pro ($49.000/mes — 500 DTEs, 10 PYMEs)</option>
              <option value="business">Business ($99.000/mes — 2000 DTEs, 50 PYMEs)</option>
            </select>
          </Field>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-md bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
            Crear mi cuenta de prueba
          </button>

          <p className="text-xs text-zinc-500 text-center mt-2">
            Sin tarjeta de crédito. 14 días gratis. Cobra al 5° del mes siguiente.
          </p>
        </form>
      </div>
    </main>
  )
}

function Field({
  label, hint, children,
}: {
  label: string
  hint?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-zinc-700">{label}</span>
        {hint && <span className="text-xs text-zinc-500">{hint}</span>}
      </div>
      {children}
    </label>
  )
}
