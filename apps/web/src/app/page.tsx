/**
 * CUENTAX — Landing Page
 * Showcase all platform features including Portal del Trabajador.
 */

import Link from 'next/link'

// ── Feature data ────────────────────────────────────────────────
const HERO_FEATURES = [
  'Facturacion electronica SII',
  'Contabilidad integrada',
  'Portal del Trabajador',
  'Remuneraciones',
]

const MODULES = [
  {
    title: 'Facturacion Electronica',
    description: 'Emite facturas, boletas, notas de credito y debito. Certificado ante el SII con folios CAF automaticos.',
    icon: '📄',
    items: ['Facturas y boletas electronicas', 'Notas de credito y debito', 'Gestion de folios CAF', 'Envio automatico al SII'],
  },
  {
    title: 'Contabilidad',
    description: 'Libro diario, mayor, balance y reportes. Todo conectado con tus documentos tributarios.',
    icon: '📊',
    items: ['Libro de compras y ventas', 'Libro diario y mayor', 'Balance y estado de resultados', 'Conciliacion bancaria'],
  },
  {
    title: 'Remuneraciones',
    description: 'Calculo de sueldos, imposiciones y liquidaciones de sueldo con cumplimiento legal chileno.',
    icon: '💰',
    items: ['Liquidaciones de sueldo', 'Calculo de AFP e Isapre', 'Libro de remuneraciones', 'Finiquitos'],
  },
]

const PORTAL_FEATURES = [
  {
    title: 'Mis Liquidaciones',
    description: 'Consulta y descarga tus liquidaciones de sueldo en PDF con detalle de haberes y descuentos.',
    icon: '🧾',
  },
  {
    title: 'Mi Contrato',
    description: 'Visualiza tu contrato vigente con cargo, sueldo base y fechas. Descargable en PDF.',
    icon: '📋',
  },
  {
    title: 'Documentos',
    description: 'Genera Certificado Laboral, Certificado de Antiguedad y Constancia de Empleo al instante.',
    icon: '📑',
  },
  {
    title: 'Asistencia',
    description: 'Revisa tu registro de asistencia mensual con dias trabajados y horas totales.',
    icon: '⏰',
  },
  {
    title: 'Ausencias',
    description: 'Consulta tus solicitudes de ausencia, vacaciones y licencias medicas.',
    icon: '📅',
  },
  {
    title: 'Mi Perfil',
    description: 'Accede a tus datos personales, contacto, informacion de contrato y prevision.',
    icon: '👤',
  },
]

export const metadata = {
  title: 'CUENTAX — Plataforma Contable SII Chile',
  description: 'Facturacion electronica, contabilidad, remuneraciones y Portal del Trabajador. Certificado SII Chile.',
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* ── Navbar ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-sm tracking-tighter">CX</span>
            </div>
            <span className="text-slate-800 text-sm font-bold tracking-tight">
              CUENTA<span className="text-violet-600">X</span>
            </span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6 text-sm text-slate-600">
            <a href="#funcionalidades" className="hover:text-violet-600 transition-colors">Funcionalidades</a>
            <a href="#portal" className="hover:text-violet-600 transition-colors">Portal Trabajador</a>
            <Link href="/portal/login" className="hover:text-violet-600 transition-colors">Portal Empleados</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-slate-600 hover:text-slate-800 transition-colors"
            >
              Iniciar sesion
            </Link>
            <Link
              href="/portal/login"
              className="text-sm px-4 py-1.5 rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-700 transition-colors shadow-sm"
            >
              Portal Empleados
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-50/60 via-white to-indigo-50/40" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-100 text-violet-700 text-xs font-medium mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
              Certificado SII Chile
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 tracking-tight leading-[1.1]">
              Tu contabilidad,{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600">
                simple y conectada
              </span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl leading-relaxed">
              Facturacion electronica, contabilidad, remuneraciones y un portal de autoservicio para tus trabajadores. Todo en una sola plataforma.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/login"
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold text-sm shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-shadow"
              >
                Comenzar ahora
              </Link>
              <Link
                href="/portal/login"
                className="px-6 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors"
              >
                Acceder al Portal
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-3">
              {HERO_FEATURES.map((f) => (
                <span key={f} className="px-3 py-1 rounded-full bg-white border border-slate-200 text-xs text-slate-600 shadow-sm">
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Modules ────────────────────────────────────────── */}
      <section id="funcionalidades" className="py-20 sm:py-28 bg-slate-50/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
              Todo lo que necesitas para tu empresa
            </h2>
            <p className="mt-4 text-slate-600 max-w-2xl mx-auto">
              Desde la facturacion electronica hasta las remuneraciones, CUENTAX cubre el ciclo contable completo.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {MODULES.map((mod) => (
              <div
                key={mod.title}
                className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg hover:shadow-slate-200/50 transition-shadow"
              >
                <span className="text-3xl">{mod.icon}</span>
                <h3 className="text-lg font-semibold text-slate-800 mt-4">{mod.title}</h3>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed">{mod.description}</p>
                <ul className="mt-4 space-y-2">
                  {mod.items.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="w-1 h-1 rounded-full bg-violet-400 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Portal del Trabajador ──────────────────────────── */}
      <section id="portal" className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Nuevo
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
              Portal del Trabajador
            </h2>
            <p className="mt-4 text-slate-600 max-w-2xl mx-auto">
              Tus empleados acceden a sus liquidaciones, contratos y documentos laborales desde cualquier dispositivo. Sin llamar a RRHH.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {PORTAL_FEATURES.map((feat) => (
              <div
                key={feat.title}
                className="group relative bg-white rounded-2xl border border-slate-200 p-6 hover:border-violet-200 hover:shadow-lg hover:shadow-violet-100/50 transition-all"
              >
                <span className="text-2xl">{feat.icon}</span>
                <h3 className="text-base font-semibold text-slate-800 mt-3">{feat.title}</h3>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed">{feat.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Link
              href="/portal/login"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold text-sm shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-shadow"
            >
              Acceder al Portal del Trabajador
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────── */}
      <section className="py-20 bg-gradient-to-br from-violet-600 to-indigo-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Simplifica la gestion de tu empresa
          </h2>
          <p className="mt-4 text-violet-200 text-lg max-w-2xl mx-auto">
            Facturacion, contabilidad, remuneraciones y portal de empleados. Todo conectado, todo en un solo lugar.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/login"
              className="px-8 py-3 rounded-xl bg-white text-violet-700 font-semibold text-sm shadow-lg hover:shadow-xl transition-shadow"
            >
              Comenzar ahora
            </Link>
            <Link
              href="/portal/login"
              className="px-8 py-3 rounded-xl border border-violet-400 text-white font-semibold text-sm hover:bg-violet-500/20 transition-colors"
            >
              Portal de Empleados
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="py-8 border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <span className="text-white font-bold text-[10px] tracking-tighter">CX</span>
            </div>
            <span className="text-slate-400 text-xs">
              &copy; {new Date().getFullYear()} CUENTAX.cl
            </span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-400">
            <Link href="/login" className="hover:text-slate-600 transition-colors">Admin</Link>
            <Link href="/portal/login" className="hover:text-slate-600 transition-colors">Portal Empleados</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
