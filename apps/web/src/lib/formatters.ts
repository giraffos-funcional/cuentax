// ── Locale-Aware Formatters ─────────────────────────────────

/** Format currency based on locale and currency code */
export const formatCurrency = (n: number, currency: string = 'CLP', locale: string = 'es-CL') =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'CLP' ? 0 : 2,
  }).format(n)

/** Format number as Chilean Pesos (CLP) — backward compatible alias */
export const formatCLP = (n: number) => formatCurrency(n, 'CLP', 'es-CL')

/** Format number as USD */
export const formatUSD = (n: number) => formatCurrency(n, 'USD', 'en-US')

/** Format number as UF with 2 decimals */
export const formatUF = (n: number) =>
  `$${new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`

/** Format percentage */
export const formatPct = (n: number) =>
  isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(1)}%` : 'N/A'

/** Format date string based on locale */
export const formatDate = (d: string, locale: string = 'es-CL') => {
  if (!d) return '-'
  const date = new Date(d)
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Get month names for a locale */
export const getMonthNames = (locale: string = 'es-CL'): string[] =>
  Array.from({ length: 12 }, (_, i) => {
    const name = new Date(2024, i).toLocaleDateString(locale, { month: 'long' })
    return name.charAt(0).toUpperCase() + name.slice(1)
  })

/** Month names in Spanish — backward compatible */
export const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
