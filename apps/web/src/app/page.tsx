/**
 * Página de login — Punto de entrada de Giraffos SII
 * Redirige al dashboard si ya hay sesión activa.
 */

import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/auth/login-form'

export const metadata = {
  title: 'Iniciar Sesión',
  description: 'Accede a tu cuenta de CUENTAX',
}

// TODO Sprint 1: Verificar sesión activa y redirigir
export default function LoginPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <span className="text-white font-bold text-xl tracking-tighter">CX</span>
            </div>
            <span className="text-white text-2xl font-bold tracking-tight">
              CUENTA<span className="text-violet-400">X</span>
            </span>
          </div>
          <p className="text-slate-400 text-sm">
            Contabilidad y facturación electrónica · SII Chile
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl shadow-black/40">
          <h1 className="text-xl font-semibold text-white mb-6">Iniciar sesión</h1>
          <LoginForm />
        </div>

        {/* Footer */}
        <p className="text-center text-slate-600 text-xs mt-6">
          © {new Date().getFullYear()} CUENTAX.cl · Ambiente:{' '}
          <span className="text-violet-400">
            {process.env['NEXT_PUBLIC_AMBIENTE'] ?? 'development'}
          </span>
        </p>
      </div>
    </main>
  )
}
