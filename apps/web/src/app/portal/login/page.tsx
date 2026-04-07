/**
 * CUENTAX — Portal del Trabajador Login
 * Employee login with RUT + 6-digit PIN.
 */

'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle, KeyRound } from 'lucide-react'
import { usePortalLogin } from '@/hooks/use-portal'
import { usePortalAuthStore } from '@/stores/portal-auth.store'
import { useEffect } from 'react'

// ── RUT formatting helper ─────────────────────────────────────
function formatRut(value: string): string {
  // Strip all non-alphanumeric chars
  const clean = value.replace(/[^0-9kK]/g, '')
  if (clean.length <= 1) return clean

  const body = clean.slice(0, -1)
  const dv = clean.slice(-1).toUpperCase()

  // Format body with dots
  let formatted = ''
  let count = 0
  for (let i = body.length - 1; i >= 0; i--) {
    if (count > 0 && count % 3 === 0) {
      formatted = '.' + formatted
    }
    formatted = body[i] + formatted
    count++
  }

  return `${formatted}-${dv}`
}

// ── Validation schema ─────────────────────────────────────────
const portalLoginSchema = z.object({
  rut: z.string().min(7, 'RUT invalido').max(12, 'RUT invalido'),
  pin: z.string().length(6, 'PIN debe tener 6 digitos').regex(/^\d{6}$/, 'PIN solo puede contener numeros'),
})

type PortalLoginData = z.infer<typeof portalLoginSchema>

export default function PortalLoginPage() {
  const router = useRouter()
  const isAuthenticated = usePortalAuthStore((s) => s.isAuthenticated)
  const { login, isLoading } = usePortalLogin()
  const [serverError, setServerError] = useState<string | null>(null)

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/portal')
    }
  }, [isAuthenticated, router])

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<PortalLoginData>({ resolver: zodResolver(portalLoginSchema) })

  const rutValue = watch('rut')

  // Format RUT as user types
  const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatRut(e.target.value)
    setValue('rut', formatted, { shouldValidate: false })
  }

  const onSubmit = async (data: PortalLoginData) => {
    setServerError(null)
    try {
      await login(data.rut, data.pin)
      router.push('/portal')
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      const msg = axiosErr?.response?.data?.message ?? 'Error al iniciar sesion. Verifica tus credenciales.'
      setServerError(msg)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <span className="text-white font-bold text-xl tracking-tighter">CX</span>
            </div>
            <span className="text-slate-800 text-2xl font-bold tracking-tight">
              CUENTA<span className="text-violet-600">X</span>
            </span>
          </div>
          <p className="text-slate-500 text-sm">
            Portal del Trabajador
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-xl shadow-slate-200/50">
          <div className="flex items-center gap-2 mb-6">
            <KeyRound size={18} className="text-violet-600" />
            <h1 className="text-lg font-semibold text-slate-800">Ingresa a tu portal</h1>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* RUT */}
            <div>
              <label htmlFor="portal-rut" className="block text-xs font-medium text-slate-600 mb-1.5">
                RUT
              </label>
              <input
                id="portal-rut"
                type="text"
                autoComplete="username"
                placeholder="12.345.678-9"
                className="input-field"
                maxLength={12}
                {...register('rut', { onChange: handleRutChange })}
              />
              {errors.rut && (
                <p className="mt-1 text-xs text-red-500">{errors.rut.message}</p>
              )}
            </div>

            {/* PIN */}
            <div>
              <label htmlFor="portal-pin" className="block text-xs font-medium text-slate-600 mb-1.5">
                PIN (6 digitos)
              </label>
              <input
                id="portal-pin"
                type="password"
                autoComplete="current-password"
                placeholder="------"
                maxLength={6}
                inputMode="numeric"
                className="input-field text-center tracking-[0.5em] text-lg"
                {...register('pin')}
              />
              {errors.pin && (
                <p className="mt-1 text-xs text-red-500">{errors.pin.message}</p>
              )}
            </div>

            {/* Server error */}
            {serverError && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200">
                <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-600">{serverError}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full justify-center mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Ingresando...
                </>
              ) : (
                'Ingresar'
              )}
            </button>

            <p className="text-center text-xs text-slate-400 mt-4">
              Solicita tu PIN a tu empleador o contacta a{' '}
              <a
                href="mailto:soporte@cuentax.cl"
                className="text-violet-600 hover:text-violet-500 transition-colors"
              >
                soporte
              </a>
            </p>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-slate-400 text-xs mt-6">
          CUENTAX.cl &middot; Portal del Trabajador
        </p>
      </div>
    </main>
  )
}
