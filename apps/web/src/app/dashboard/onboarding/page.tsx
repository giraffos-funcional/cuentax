/**
 * CUENTAX — Onboarding checklist
 *
 * Visible al primer login del tenant. Muestra los pasos pendientes para
 * dejar la cuenta operativa: empresa, cert SII, CAF, contactos, primer
 * DTE, suscripción.
 */
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Circle, Loader2, ArrowRight, Rocket } from 'lucide-react'
import { apiClient } from '@/lib/api-client'

interface Step {
  id: string
  label: string
  done: boolean
  href: string
}

interface OnboardingStatus {
  completed: number
  total: number
  progress_pct: number
  steps: Step[]
}

export default function OnboardingPage() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiClient.get<OnboardingStatus>('/api/v1/onboarding/status')
      .then((r) => setStatus(r.data))
      .catch((err) => setError(err?.response?.data?.error ?? 'Error al cargar onboarding'))
  }, [])

  if (error) {
    return <div className="max-w-2xl mx-auto p-6 text-red-700">{error}</div>
  }
  if (!status) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-zinc-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…
      </div>
    )
  }

  const allDone = status.completed === status.total

  return (
    <div className="max-w-2xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Rocket className="w-6 h-6 text-blue-600" /> Bienvenido a Cuentax
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Completá los pasos para dejar tu cuenta lista para emitir DTE.
        </p>
      </header>

      <div className="mb-6 bg-white rounded-lg border border-zinc-200 p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-zinc-600">
            <strong>{status.completed}</strong> de <strong>{status.total}</strong> pasos completados
          </p>
          <p className="text-sm font-semibold">{status.progress_pct}%</p>
        </div>
        <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all"
            style={{ width: `${status.progress_pct}%` }}
          />
        </div>
      </div>

      <ul className="space-y-2">
        {status.steps.map((s) => (
          <li
            key={s.id}
            className={`flex items-center justify-between p-4 rounded-lg border ${
              s.done ? 'bg-green-50 border-green-200' : 'bg-white border-zinc-200 hover:border-zinc-300'
            }`}
          >
            <div className="flex items-center gap-3">
              {s.done
                ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                : <Circle className="w-5 h-5 text-zinc-300" />}
              <span className={`text-sm font-medium ${s.done ? 'text-green-900' : 'text-zinc-800'}`}>
                {s.label}
              </span>
            </div>
            {!s.done && (
              <Link
                href={s.href}
                className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                Ir <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </li>
        ))}
      </ul>

      {allDone && (
        <div className="mt-6 p-4 rounded-lg bg-green-600 text-white">
          <p className="font-semibold">🎉 Todo listo</p>
          <p className="text-sm opacity-90 mt-1">
            Tu cuenta está completamente configurada. ¡A trabajar!
          </p>
        </div>
      )}
    </div>
  )
}
