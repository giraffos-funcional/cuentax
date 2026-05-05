/**
 * Minimal i18n — no external lib.
 * Locale read from `cx_admin_lang` cookie (default es-CL); fallback to es.
 *
 * Usage:
 *   import { t } from '@/lib/i18n'
 *   t('login.title')                       // → "Iniciar sesión"
 *   t('login.welcome', { name: 'Pancho' }) // → "Hola Pancho"
 */
import { cookies } from 'next/headers'

type Locale = 'es' | 'en'

const dict: Record<Locale, Record<string, string>> = {
  es: {
    'app.title':                   'Cuentax Admin',
    'app.signOut':                 'Cerrar sesión',
    'login.title':                 'Cuentax Admin',
    'login.subtitle':              'Acceso de operador interno',
    'login.email':                 'Email',
    'login.password':              'Contraseña',
    'login.totp':                  'Código 2FA',
    'login.totpHint':              '6 dígitos de tu app de autenticación.',
    'login.submit':                'Iniciar sesión',
    'login.error.invalid':         'Email o contraseña inválidos.',
    'login.error.invalidTotp':     'Código 2FA incorrecto.',
    'login.error.missing':         'Completá email y contraseña.',
    'nav.overview':                'Overview',
    'nav.search':                  '🔎 Buscar',
    'nav.tenants':                 'Tenants',
    'nav.newTenant':                '+ Nuevo tenant',
    'nav.plans':                   'Planes',
    'nav.billing':                 'Billing',
    'nav.revenueShare':            'Revenue share',
    'nav.audit':                   'Audit log',
    'nav.crons':                   'Crons',
    'nav.security':                'Seguridad (2FA)',
  },
  en: {
    'app.title':                   'Cuentax Admin',
    'app.signOut':                 'Sign out',
    'login.title':                 'Cuentax Admin',
    'login.subtitle':              'Internal operator access',
    'login.email':                 'Email',
    'login.password':              'Password',
    'login.totp':                  '2FA code',
    'login.totpHint':              '6 digits from your authenticator.',
    'login.submit':                'Sign in',
    'login.error.invalid':         'Invalid email or password.',
    'login.error.invalidTotp':     'Wrong 2FA code.',
    'login.error.missing':         'Email and password required.',
    'nav.overview':                'Overview',
    'nav.search':                  '🔎 Search',
    'nav.tenants':                 'Tenants',
    'nav.newTenant':                '+ New tenant',
    'nav.plans':                   'Plans',
    'nav.billing':                 'Billing',
    'nav.revenueShare':            'Revenue share',
    'nav.audit':                   'Audit log',
    'nav.crons':                   'Crons',
    'nav.security':                'Security (2FA)',
  },
}

export function getLocale(): Locale {
  try {
    const v = cookies().get('cx_admin_lang')?.value
    if (v === 'en' || v === 'es') return v
  } catch {
    // outside of a request context
  }
  return 'es'
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const locale = getLocale()
  let str = dict[locale][key] ?? dict.es[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return str
}
