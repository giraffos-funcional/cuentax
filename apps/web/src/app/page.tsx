/**
 * Página de login — Punto de entrada de Giraffos SII
 * Redirige al dashboard si ya hay sesión activa.
 */

import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/auth/login-form'

export const metadata = {
  title: 'Iniciar Sesión',
  description: 'Accede a tu cuenta de Giraffos SII',
}

// TODO Sprint 1: Verificar sesión activa y redirigir
export default function LoginPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <span className="text-white font-bold text-lg">G</span>
            </div>
            <span className="text-white text-2xl font-semibold tracking-tight">
              Giraffos <span className="text-cyan-400">SII</span>
            </span>
          </div>
          <p className="text-slate-400 text-sm">
            Facturación electrónica con conexión directa al SII
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl shadow-black/40">
          <h1 className="text-xl font-semibold text-white mb-6">Iniciar sesión</h1>
          <LoginForm />
        </div>

        {/* Footer */}
        <p className="text-center text-slate-600 text-xs mt-6">
          © {new Date().getFullYear()} Giraffos · Ambiente:{' '}
          <span className="text-cyan-500">
            {process.env['NEXT_PUBLIC_AMBIENTE'] ?? 'development'}
          </span>
        </p>
      </div>
    </main>
  )
}
