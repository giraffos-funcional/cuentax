/**
 * CUENTAX — Airbnb Transaction History Parser
 * ==============================================
 * Parses the CSV export you get from:
 *   Airbnb → Menu → Earnings → Transaction History → Download CSV
 *
 * Typical columns (both English and Spanish Airbnb exports supported):
 *   Date / Fecha
 *   Type / Tipo (Reservation, Payout, Resolution, Adjustment, Co-host payout, ...)
 *   Confirmation Code / Código de confirmación
 *   Start Date / Fecha de inicio
 *   Nights / Noches
 *   Guest / Huésped
 *   Listing / Anuncio                <- THE KEY FIELD: maps to cost center
 *   Details / Detalles
 *   Reference / Referencia
 *   Currency / Moneda
 *   Amount / Monto                   <- gross amount (can be negative for refunds)
 *   Paid Out / Pagado                <- net payout amount
 *   Host Fee / Comisión del anfitrión <- Airbnb's commission (negative or absolute)
 *   Cleaning Fee / Tarifa de limpieza
 *   Occupancy Taxes / Impuestos
 *
 * We only care about 'Reservation' type rows for revenue recognition.
 * Payouts are bank-side (they show up in the bank statement).
 */

export interface AirbnbReservation {
  reservation_date: string      // YYYY-MM-DD — when payment was recorded
  start_date: string | null     // YYYY-MM-DD — when stay started
  end_date: string | null       // computed: start + nights
  nights: number
  guest: string
  listing: string               // raw listing name — match this to cost center
  confirmation_code: string
  currency: string
  gross_amount: number          // what guest paid (positive)
  host_fee: number              // Airbnb commission (positive absolute value)
  cleaning_fee: number
  occupancy_taxes: number
  net_earning: number           // gross - host_fee - cleaning (what you actually get)
  raw_row: Record<string, string>
}

export interface AirbnbParseResult {
  reservations: AirbnbReservation[]
  /** Unique listings detected across all reservations — useful to help the
   * user map each listing to a cost center on first upload. */
  listings: Array<{ name: string; count: number; total_gross: number }>
  unsupported_rows: number      // rows skipped (non-reservation types)
  parse_errors: string[]
  detected_currency: string
  date_range: { from: string; to: string } | null
}

const RESERVATION_TYPE_VALUES = new Set([
  'reservation', 'reserva', 'reservación', 'reservacion',
])

// Map of "human column name" → array of possible header strings (EN + ES)
const COLUMN_ALIASES: Record<string, string[]> = {
  date:          ['Date', 'Fecha'],
  type:          ['Type', 'Tipo'],
  start_date:    ['Start Date', 'Fecha de inicio', 'Check-in Date'],
  nights:        ['Nights', 'Noches'],
  guest:         ['Guest', 'Huésped', 'Huesped'],
  listing:       ['Listing', 'Anuncio'],
  confirmation:  ['Confirmation Code', 'Código de confirmación', 'Codigo de confirmacion'],
  currency:      ['Currency', 'Moneda'],
  amount:        ['Amount', 'Monto', 'Gross Earnings', 'Ganancias brutas'],
  paid_out:      ['Paid Out', 'Pagado', 'Net Earnings', 'Ganancias netas'],
  host_fee:      ['Host Fee', 'Comisión del anfitrión', 'Comision del anfitrion', 'Service Fee'],
  cleaning_fee:  ['Cleaning Fee', 'Tarifa de limpieza'],
  occupancy_tax: ['Occupancy Taxes', 'Impuestos de ocupación', 'Impuestos de ocupacion'],
}

function resolveColumnIndex(headers: string[], aliases: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim()
    for (const alias of aliases) {
      if (h.toLowerCase() === alias.toLowerCase()) return i
    }
  }
  return -1
}

/** Parse a row that may contain quoted fields with commas inside. */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuote = !inQuote
      }
    } else if (ch === ',' && !inQuote) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map(s => s.trim())
}

function parseNumber(raw: string): number {
  if (!raw) return 0
  const cleaned = raw.replace(/[$"\s]/g, '').replace(/\((.*)\)/, '-$1')
  // Airbnb may use US (comma thousands, period decimal) or regional formats
  // Try US first: remove commas
  const us = Number(cleaned.replace(/,/g, ''))
  if (Number.isFinite(us)) return us
  return 0
}

/**
 * Parse a date cell. Airbnb exports can use MM/DD/YYYY (US), DD/MM/YYYY (ES/CL)
 * or YYYY-MM-DD. We try each and pick the one that produces a valid date.
 */
function parseDate(raw: string): string | null {
  if (!raw) return null
  const clean = raw.trim().replace(/"/g, '')
  // ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) return clean.slice(0, 10)
  // MM/DD/YYYY or DD/MM/YYYY
  const slash = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (slash) {
    const [, a, b, y] = slash
    // Heuristic: if first part > 12, it's day (DD/MM); else assume MM/DD (US).
    const aN = Number(a); const bN = Number(b)
    if (aN > 12) {
      return `${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`
    }
    return `${y}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`
  }
  return null
}

export function parseAirbnbCsv(content: string): AirbnbParseResult {
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) {
    return {
      reservations: [], listings: [], unsupported_rows: 0,
      parse_errors: ['File is empty or has no data rows'],
      detected_currency: 'USD', date_range: null,
    }
  }

  const headers = splitCsvLine(lines[0])
  const idx = {
    date: resolveColumnIndex(headers, COLUMN_ALIASES.date),
    type: resolveColumnIndex(headers, COLUMN_ALIASES.type),
    start_date: resolveColumnIndex(headers, COLUMN_ALIASES.start_date),
    nights: resolveColumnIndex(headers, COLUMN_ALIASES.nights),
    guest: resolveColumnIndex(headers, COLUMN_ALIASES.guest),
    listing: resolveColumnIndex(headers, COLUMN_ALIASES.listing),
    confirmation: resolveColumnIndex(headers, COLUMN_ALIASES.confirmation),
    currency: resolveColumnIndex(headers, COLUMN_ALIASES.currency),
    amount: resolveColumnIndex(headers, COLUMN_ALIASES.amount),
    paid_out: resolveColumnIndex(headers, COLUMN_ALIASES.paid_out),
    host_fee: resolveColumnIndex(headers, COLUMN_ALIASES.host_fee),
    cleaning_fee: resolveColumnIndex(headers, COLUMN_ALIASES.cleaning_fee),
    occupancy_tax: resolveColumnIndex(headers, COLUMN_ALIASES.occupancy_tax),
  }

  const errors: string[] = []
  if (idx.type === -1) errors.push('Could not find "Type / Tipo" column')
  if (idx.listing === -1) errors.push('Could not find "Listing / Anuncio" column')
  if (idx.amount === -1 && idx.paid_out === -1) {
    errors.push('Could not find "Amount" or "Paid Out" column')
  }

  const reservations: AirbnbReservation[] = []
  const listingStats = new Map<string, { count: number; total_gross: number }>()
  let unsupported = 0
  let detectedCurrency = 'USD'
  let minDate: string | null = null
  let maxDate: string | null = null

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i])
    if (cols.length < 3) continue

    const type = (idx.type >= 0 ? cols[idx.type] : '').toLowerCase().trim()
    if (!RESERVATION_TYPE_VALUES.has(type)) {
      unsupported++
      continue
    }

    const listing = idx.listing >= 0 ? cols[idx.listing].trim() : ''
    const dateRaw = idx.date >= 0 ? cols[idx.date] : ''
    const date = parseDate(dateRaw) ?? dateRaw
    const startDate = idx.start_date >= 0 ? parseDate(cols[idx.start_date]) : null
    const nights = idx.nights >= 0 ? Number(cols[idx.nights]) || 0 : 0
    const currency = (idx.currency >= 0 ? cols[idx.currency] : 'USD').trim() || 'USD'
    if (currency) detectedCurrency = currency

    const grossAmount = idx.amount >= 0 ? parseNumber(cols[idx.amount]) : 0
    const hostFee = Math.abs(idx.host_fee >= 0 ? parseNumber(cols[idx.host_fee]) : 0)
    const cleaningFee = idx.cleaning_fee >= 0 ? parseNumber(cols[idx.cleaning_fee]) : 0
    const occupancyTax = idx.occupancy_tax >= 0 ? parseNumber(cols[idx.occupancy_tax]) : 0
    const paidOut = idx.paid_out >= 0 ? parseNumber(cols[idx.paid_out]) : (grossAmount - hostFee)

    const endDate = (startDate && nights > 0)
      ? new Date(new Date(startDate).getTime() + nights * 86400000).toISOString().slice(0, 10)
      : null

    reservations.push({
      reservation_date: date,
      start_date: startDate,
      end_date: endDate,
      nights,
      guest: idx.guest >= 0 ? cols[idx.guest] : '',
      listing,
      confirmation_code: idx.confirmation >= 0 ? cols[idx.confirmation] : '',
      currency,
      gross_amount: grossAmount,
      host_fee: hostFee,
      cleaning_fee: cleaningFee,
      occupancy_taxes: occupancyTax,
      net_earning: paidOut,
      raw_row: Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ''])),
    })

    if (listing) {
      const s = listingStats.get(listing) ?? { count: 0, total_gross: 0 }
      s.count++
      s.total_gross += grossAmount
      listingStats.set(listing, s)
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      if (!minDate || date < minDate) minDate = date
      if (!maxDate || date > maxDate) maxDate = date
    }
  }

  return {
    reservations,
    listings: [...listingStats.entries()]
      .map(([name, s]) => ({ name, count: s.count, total_gross: s.total_gross }))
      .sort((a, b) => b.total_gross - a.total_gross),
    unsupported_rows: unsupported,
    parse_errors: errors,
    detected_currency: detectedCurrency,
    date_range: minDate && maxDate ? { from: minDate, to: maxDate } : null,
  }
}
