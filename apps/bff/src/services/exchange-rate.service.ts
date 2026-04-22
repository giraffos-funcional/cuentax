/**
 * CUENTAX — Exchange Rates + Multi-Currency Conversion
 * =======================================================
 * Per-company rate table. The "reporting" currency is the company's primary
 * currency (USD for US companies, CLP for CL). Bank accounts and transactions
 * in other currencies are converted using the rate on the transaction date.
 *
 * Rate semantics: 1 unit of from_currency = <rate> of to_currency.
 * Lookup: nearest date ≤ target date. Falls back to inverse rate if the
 * direct pair doesn't exist (USD→CLP via CLP→USD).
 */

import { and, eq, desc, lte } from 'drizzle-orm'
import { db } from '@/db/client'
import { exchangeRates } from '@/db/schema'

export interface ExchangeRateRow {
  id: number
  company_id: number
  date: string
  from_currency: string
  to_currency: string
  rate: number
  source: string | null
}

export interface SetRateInput {
  date: string
  from_currency: string
  to_currency: string
  rate: number
  source?: string
}

export async function listRates(
  companyId: number, from?: string, to?: string,
): Promise<ExchangeRateRow[]> {
  const conditions = [eq(exchangeRates.company_id, companyId)]
  if (from) conditions.push(eq(exchangeRates.from_currency, from.toUpperCase()))
  if (to) conditions.push(eq(exchangeRates.to_currency, to.toUpperCase()))
  const rows = await db.select().from(exchangeRates).where(and(...conditions))
    .orderBy(desc(exchangeRates.date))
  return rows.map(toRow)
}

export async function setRate(companyId: number, input: SetRateInput): Promise<ExchangeRateRow> {
  const existing = await db.select().from(exchangeRates).where(and(
    eq(exchangeRates.company_id, companyId),
    eq(exchangeRates.date, input.date),
    eq(exchangeRates.from_currency, input.from_currency.toUpperCase()),
    eq(exchangeRates.to_currency, input.to_currency.toUpperCase()),
  )).limit(1)

  if (existing.length > 0) {
    const [updated] = await db.update(exchangeRates).set({
      rate: String(input.rate),
      source: input.source ?? 'manual',
    }).where(eq(exchangeRates.id, existing[0].id)).returning()
    return toRow(updated)
  }
  const [created] = await db.insert(exchangeRates).values({
    company_id: companyId,
    date: input.date,
    from_currency: input.from_currency.toUpperCase(),
    to_currency: input.to_currency.toUpperCase(),
    rate: String(input.rate),
    source: input.source ?? 'manual',
  }).returning()
  return toRow(created)
}

export async function bulkSetRates(companyId: number, inputs: SetRateInput[]): Promise<{ inserted: number }> {
  let n = 0
  for (const i of inputs) { await setRate(companyId, i); n++ }
  return { inserted: n }
}

export async function deleteRate(id: number): Promise<void> {
  await db.delete(exchangeRates).where(eq(exchangeRates.id, id))
}

/**
 * Convert `amount` from `from` → `to` using the latest rate on or before `date`.
 * Returns the converted amount. Throws if no rate can be found and currencies differ.
 * Same-currency: returns amount unchanged.
 */
export async function convert(
  companyId: number,
  amount: number,
  from: string,
  to: string,
  date: string,
): Promise<{ amount: number; rate: number; rate_date: string }> {
  const F = from.toUpperCase()
  const T = to.toUpperCase()
  if (F === T) return { amount, rate: 1, rate_date: date }

  // Direct lookup
  const direct = await db.select().from(exchangeRates).where(and(
    eq(exchangeRates.company_id, companyId),
    eq(exchangeRates.from_currency, F),
    eq(exchangeRates.to_currency, T),
    lte(exchangeRates.date, date),
  )).orderBy(desc(exchangeRates.date)).limit(1)
  if (direct.length > 0) {
    const rate = Number(direct[0].rate)
    return { amount: amount * rate, rate, rate_date: direct[0].date }
  }

  // Inverse lookup
  const inverse = await db.select().from(exchangeRates).where(and(
    eq(exchangeRates.company_id, companyId),
    eq(exchangeRates.from_currency, T),
    eq(exchangeRates.to_currency, F),
    lte(exchangeRates.date, date),
  )).orderBy(desc(exchangeRates.date)).limit(1)
  if (inverse.length > 0) {
    const inv = Number(inverse[0].rate)
    if (inv === 0) throw new Error(`Exchange rate ${T}->${F} is zero`)
    const rate = 1 / inv
    return { amount: amount * rate, rate, rate_date: inverse[0].date }
  }

  throw new Error(`No exchange rate found ${F}->${T} on or before ${date}`)
}

function toRow(row: typeof exchangeRates.$inferSelect): ExchangeRateRow {
  return {
    id: row.id,
    company_id: row.company_id,
    date: row.date,
    from_currency: row.from_currency,
    to_currency: row.to_currency,
    rate: Number(row.rate),
    source: row.source,
  }
}
