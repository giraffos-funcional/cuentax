'use client'

/**
 * CUENTAX — Locale Context
 * =========================
 * Provides country-aware formatting and feature visibility to all components.
 * Reads country_code, locale, currency from the auth store (set during login/switch).
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import { formatCurrency, formatDate, getMonthNames } from '@/lib/formatters'

interface LocaleContextValue {
  /** ISO country code: 'CL' or 'US' */
  country: string
  /** BCP-47 locale: 'es-CL' or 'en-US' */
  locale: string
  /** ISO currency: 'CLP' or 'USD' */
  currency: string
  /** Format a number as currency using company settings */
  fmtCurrency: (n: number) => string
  /** Format a date string using company locale */
  fmtDate: (d: string) => string
  /** Month names in the company locale */
  monthNames: string[]
  /** Shorthand checks */
  isChile: boolean
  isUSA: boolean
}

const LocaleContext = createContext<LocaleContextValue>({
  country: 'CL',
  locale: 'es-CL',
  currency: 'CLP',
  fmtCurrency: (n) => formatCurrency(n, 'CLP', 'es-CL'),
  fmtDate: (d) => formatDate(d, 'es-CL'),
  monthNames: getMonthNames('es-CL'),
  isChile: true,
  isUSA: false,
})

export function LocaleProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore(s => s.user)

  const value = useMemo<LocaleContextValue>(() => {
    const country = user?.country_code ?? 'CL'
    const locale = user?.locale ?? (country === 'US' ? 'en-US' : 'es-CL')
    const currency = user?.currency ?? (country === 'US' ? 'USD' : 'CLP')

    return {
      country,
      locale,
      currency,
      fmtCurrency: (n: number) => formatCurrency(n, currency, locale),
      fmtDate: (d: string) => formatDate(d, locale),
      monthNames: getMonthNames(locale),
      isChile: country === 'CL',
      isUSA: country === 'US',
    }
  }, [user?.country_code, user?.locale, user?.currency])

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  )
}

/** Hook to access locale context in any component */
export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext)
}
