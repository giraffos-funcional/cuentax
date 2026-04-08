/**
 * Pagina de login — Acceso administrativo CUENTAX
 * Redirige al dashboard si ya hay sesion activa.
 */

import { LoginForm } from '@/components/auth/login-form'

export const metadata = {
  title: 'Iniciar Sesion — CUENTAX',
  description: 'Accede a tu cuenta de CUENTAX',
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
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
            Contabilidad y facturacion electronica &middot; SII Chile
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-xl shadow-slate-200/50">
          <h1 className="text-xl font-semibold text-slate-800 mb-6">Iniciar sesion</h1>
          <LoginForm />
        </div>

        {/* Footer */}
        <p className="text-center text-slate-400 text-xs mt-6">
          &copy; {new Date().getFullYear()} CUENTAX.cl &middot; Ambiente:{' '}
          <span className="text-violet-600 font-medium">
            {process.env['NEXT_PUBLIC_AMBIENTE'] ?? 'development'}
          </span>
        </p>
      </div>
    </main>
  )
}
