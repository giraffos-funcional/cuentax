/**
 * CUENTAX — Report Currency Conversion
 * =======================================
 * Helpers to convert report amounts between currencies when a company has
 * bank accounts or journal entries in currencies other than its reporting
 * currency. Uses the latest rate ≤ the transaction date from the
 * exchange_rates table.
 *
 * This is a thin wrapper around `convert()` for batch conversions in
 * report contexts (many amounts, same date or same rate period).
 */

import { convert } from './exchange-rate.service'
import { logger } from '@/core/logger'

export interface ConversionResult {
  original_amount: number
  original_currency: string
  converted_amount: number
  target_currency: string
  rate: number
  rate_date: string
}

/**
 * Convert an amount to the reporting currency, if needed. Same-currency
 * passes through unchanged. Missing rate → returns original + logs warning.
 */
export async function convertToReportCurrency(
  companyId: number,
  amount: number,
  fromCurrency: string,
  reportCurrency: 'CLP' | 'USD',
  date: string,
): Promise<ConversionResult> {
  const F = fromCurrency.toUpperCase()
  const T = reportCurrency.toUpperCase()

  if (F === T) {
    return {
      original_amount: amount,
      original_currency: F,
      converted_amount: amount,
      target_currency: T,
      rate: 1,
      rate_date: date,
    }
  }

  try {
    const r = await convert(companyId, amount, F, T, date)
    return {
      original_amount: amount,
      original_currency: F,
      converted_amount: Math.round(r.amount * 100) / 100,
      target_currency: T,
      rate: r.rate,
      rate_date: r.rate_date,
    }
  } catch (err) {
    logger.warn({ companyId, F, T, date, err }, 'No exchange rate — returning original amount')
    return {
      original_amount: amount,
      original_currency: F,
      converted_amount: amount,
      target_currency: T,
      rate: 1,
      rate_date: date,
    }
  }
}

/**
 * Batch-convert a list of (amount, currency, date) tuples to the reporting
 * currency. Returns results in the same order as inputs.
 */
export async function batchConvert(
  companyId: number,
  reportCurrency: 'CLP' | 'USD',
  items: Array<{ amount: number; currency: string; date: string }>,
): Promise<ConversionResult[]> {
  return Promise.all(items.map(i =>
    convertToReportCurrency(companyId, i.amount, i.currency, reportCurrency, i.date),
  ))
}
