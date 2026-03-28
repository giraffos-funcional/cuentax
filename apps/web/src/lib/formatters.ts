/** Format number as Chilean Pesos (CLP) */
export const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

/** Format number as UF with 2 decimals */
export const formatUF = (n: number) =>
  `$${new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`

/** Format percentage */
export const formatPct = (n: number) =>
  isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(1)}%` : 'N/A'

/** Format date string to DD/MM/YYYY */
export const formatDate = (d: string) => {
  if (!d) return '-'
  const date = new Date(d)
  return date.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Month names in Spanish */
export const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
