/**
 * CUENTAX — Previred Indicators Scraper
 * ======================================
 * Fetches Chilean labor/pension indicators from Previred's website
 * and syncs them to Odoo's l10n_cl.indicators model.
 *
 * Indicators scraped:
 * - UF (Unidad de Fomento)
 * - UTM (Unidad Tributaria Mensual)
 * - UTA (Unidad Tributaria Anual)
 * - Tope Imponible AFP (in UF and CLP)
 * - Tope Imponible IPS/Seguro Cesantia (in UF and CLP)
 * - Renta Minima Imponible (IMM / sueldo minimo)
 * - Asignacion Familiar tramos
 * - AFP commission rates per AFP
 *
 * Can be triggered manually via POST /api/v1/indicators/sync
 * or scheduled daily at 8am CLT.
 */

import axios from 'axios'
import * as cheerio from 'cheerio'
import { odooAccountingAdapter } from '@/adapters/odoo-accounting.adapter'
import { logger } from '@/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreviredIndicators {
  month: number
  year: number
  uf: number
  utm: number
  uta: number
  imm: number                       // Ingreso Minimo Mensual (sueldo minimo)
  tope_imponible_afp: number        // In CLP
  tope_imponible_afp_uf: number     // In UF
  tope_imponible_ips: number        // In CLP
  tope_imponible_ips_uf: number     // In UF
  tope_seg_cesantia: number         // In CLP
  tope_seg_cesantia_uf: number      // In UF
  renta_min_menor18_mayor65: number
  renta_min_casa_particular: number
  renta_min_no_remuneracional: number
  afp_rates: AFPRate[]
  asignacion_familiar: AsignacionFamiliarTramo[]
}

export interface AFPRate {
  name: string
  tasa_dependiente: number    // Total percentage for dependent workers
  tasa_independiente: number  // Total percentage for independent workers
  comision_dependiente: number // Commission portion (worker charge)
  sis: number                 // SIS employer charge
}

export interface AsignacionFamiliarTramo {
  tramo: string
  monto: number
  renta_desde: number
  renta_hasta: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PREVIRED_URL = 'https://www.previred.com/indicadores-previsionales/'
const SCRAPE_TIMEOUT_MS = 30_000

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse a Chilean-format currency string to a number.
 * Handles formats like "$ 39.841,72" or "39.841" or "$539.000"
 */
function parseCLP(raw: string): number {
  if (!raw) return 0
  const cleaned = raw
    .replace(/\$/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')     // Remove thousands separator (dots in Chilean format)
    .replace(/,/g, '.')     // Convert decimal comma to period
    .trim()
  const value = parseFloat(cleaned)
  return isNaN(value) ? 0 : value
}

/**
 * Parse a Chilean-format percentage string to a number.
 * Handles formats like "11,44%" or "11.44%"
 */
function parsePercentage(raw: string): number {
  if (!raw) return 0
  const cleaned = raw
    .replace(/%/g, '')
    .replace(/\s/g, '')
    .replace(/,/g, '.')
    .trim()
  const value = parseFloat(cleaned)
  return isNaN(value) ? 0 : value
}

/**
 * Extract first currency value from a text string.
 * Looks for patterns like "$ 39.841,72" or "$539.000"
 */
function extractCurrencyValue(text: string): number {
  const match = text.match(/\$\s*[\d.,]+/)
  return match ? parseCLP(match[0]) : 0
}

/**
 * Extract first percentage value from a text string.
 */
function extractPercentage(text: string): number {
  const match = text.match(/[\d,]+\s*%/)
  return match ? parsePercentage(match[0]) : 0
}

// ---------------------------------------------------------------------------
// Scraper
// ---------------------------------------------------------------------------

/**
 * Fetch and parse the Previred indicators page.
 * Resilient: if parsing fails for one field, still returns the others with defaults.
 */
async function fetchAndParsePrevired(): Promise<PreviredIndicators | null> {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  logger.info({ month, year }, 'Fetching Previred indicators')

  let html: string
  try {
    const response = await axios.get(PREVIRED_URL, {
      timeout: SCRAPE_TIMEOUT_MS,
      headers: {
        'User-Agent': 'CuentaX-BFF/1.0 (Previred Indicator Sync)',
        'Accept': 'text/html',
        'Accept-Language': 'es-CL,es;q=0.9',
      },
    })
    html = response.data
  } catch (error) {
    logger.error({ error }, 'Failed to fetch Previred page')
    return null
  }

  const $ = cheerio.load(html)
  const fullText = $('body').text()

  const indicators: PreviredIndicators = {
    month,
    year,
    uf: 0,
    utm: 0,
    uta: 0,
    imm: 0,
    tope_imponible_afp: 0,
    tope_imponible_afp_uf: 0,
    tope_imponible_ips: 0,
    tope_imponible_ips_uf: 0,
    tope_seg_cesantia: 0,
    tope_seg_cesantia_uf: 0,
    renta_min_menor18_mayor65: 0,
    renta_min_casa_particular: 0,
    renta_min_no_remuneracional: 0,
    afp_rates: [],
    asignacion_familiar: [],
  }

  // ── UF ──────────────────────────────────────────────────────
  try {
    // Look for UF value - typically the first currency value after "UF" heading
    // The page shows UF with date, e.g., "Al 31 de Marzo del 2026: $ 39.841,72"
    const ufMatch = fullText.match(/(?:valor\s+)?uf[^$]*?\$\s*([\d.,]+)/i)
    if (ufMatch) {
      indicators.uf = parseCLP(ufMatch[1])
    }

    // Alternative: look for the specific end-of-month UF value
    if (indicators.uf === 0) {
      const ufAltMatch = fullText.match(/Al\s+\d+\s+de\s+\w+\s+del\s+\d{4}\s*:\s*\$\s*([\d.,]+)/i)
      if (ufAltMatch) {
        indicators.uf = parseCLP(ufAltMatch[1])
      }
    }

    if (indicators.uf === 0) {
      logger.warn('Could not parse UF value from Previred page')
    } else {
      logger.debug({ uf: indicators.uf }, 'Parsed UF')
    }
  } catch (err) {
    logger.warn({ err }, 'Error parsing UF value')
  }

  // ── UTM ─────────────────────────────────────────────────────
  try {
    const utmMatch = fullText.match(/utm[^$]*?\$\s*([\d.,]+)/i)
    if (utmMatch) {
      indicators.utm = parseCLP(utmMatch[1])
    }
    if (indicators.utm === 0) {
      logger.warn('Could not parse UTM value from Previred page')
    } else {
      logger.debug({ utm: indicators.utm }, 'Parsed UTM')
    }
  } catch (err) {
    logger.warn({ err }, 'Error parsing UTM value')
  }

  // ── UTA ─────────────────────────────────────────────────────
  try {
    const utaMatch = fullText.match(/uta[^$]*?\$\s*([\d.,]+)/i)
    if (utaMatch) {
      indicators.uta = parseCLP(utaMatch[1])
    }
    if (indicators.uta === 0) {
      logger.warn('Could not parse UTA value from Previred page')
    } else {
      logger.debug({ uta: indicators.uta }, 'Parsed UTA')
    }
  } catch (err) {
    logger.warn({ err }, 'Error parsing UTA value')
  }

  // ── Topes Imponibles ────────────────────────────────────────
  try {
    // AFP tope - usually "AFP" followed by "(90 UF)" or "90 UF" then the CLP value
    const afpTopeMatch = fullText.match(/(?:tope|rentas?\s+topes?\s+imponibles?)[^]*?afp[^]*?\(?\s*(\d+(?:,\d+)?)\s*uf\s*\)?\s*[:\-]?\s*\$\s*([\d.,]+)/i)
    if (afpTopeMatch) {
      indicators.tope_imponible_afp_uf = parseFloat(afpTopeMatch[1].replace(',', '.'))
      indicators.tope_imponible_afp = parseCLP(afpTopeMatch[2])
    } else {
      // Fallback: look for "90 UF" pattern near AFP context
      const afpUfMatch = fullText.match(/afp\s*\(?\s*(\d+(?:,\d+)?)\s*uf/i)
      if (afpUfMatch) {
        indicators.tope_imponible_afp_uf = parseFloat(afpUfMatch[1].replace(',', '.'))
      }
      // Try to find the CLP value after
      const afpClpMatch = fullText.match(/afp[^$]*?\$\s*([\d.,]+)/i)
      if (afpClpMatch) {
        indicators.tope_imponible_afp = parseCLP(afpClpMatch[1])
      }
    }

    if (indicators.tope_imponible_afp === 0 && indicators.uf > 0 && indicators.tope_imponible_afp_uf > 0) {
      indicators.tope_imponible_afp = Math.round(indicators.uf * indicators.tope_imponible_afp_uf)
    }

    // IPS/INP tope - usually "(60 UF)"
    const ipsTopeMatch = fullText.match(/(?:ips|inp)[^]*?\(?\s*(\d+(?:,\d+)?)\s*uf\s*\)?\s*[:\-]?\s*\$\s*([\d.,]+)/i)
    if (ipsTopeMatch) {
      indicators.tope_imponible_ips_uf = parseFloat(ipsTopeMatch[1].replace(',', '.'))
      indicators.tope_imponible_ips = parseCLP(ipsTopeMatch[2])
    }

    // Seguro Cesantia tope - usually "(135,2 UF)" or "135.2 UF"
    const cesantiaMatch = fullText.match(/(?:cesant[ií]a|seguro\s+de?\s+cesant[ií]a)[^]*?\(?\s*(\d+(?:[,.]?\d+)?)\s*uf\s*\)?\s*[:\-]?\s*\$\s*([\d.,]+)/i)
    if (cesantiaMatch) {
      indicators.tope_seg_cesantia_uf = parseFloat(cesantiaMatch[1].replace(',', '.'))
      indicators.tope_seg_cesantia = parseCLP(cesantiaMatch[2])
    }

    logger.debug({
      tope_afp: indicators.tope_imponible_afp,
      tope_ips: indicators.tope_imponible_ips,
      tope_cesantia: indicators.tope_seg_cesantia,
    }, 'Parsed topes imponibles')
  } catch (err) {
    logger.warn({ err }, 'Error parsing topes imponibles')
  }

  // ── Rentas Minimas Imponibles ───────────────────────────────
  try {
    // IMM / Sueldo minimo - "Dependientes e Independientes"
    const immMatch = fullText.match(/dependientes\s+e\s+independientes[^$]*?\$\s*([\d.,]+)/i)
    if (immMatch) {
      indicators.imm = parseCLP(immMatch[1])
    }

    // Menores 18 / Mayores 65
    const menor18Match = fullText.match(/menores?\s+(?:de\s+)?18[^$]*?\$\s*([\d.,]+)/i)
    if (menor18Match) {
      indicators.renta_min_menor18_mayor65 = parseCLP(menor18Match[1])
    }

    // Casa particular
    const casaMatch = fullText.match(/casa\s+particular[^$]*?\$\s*([\d.,]+)/i)
    if (casaMatch) {
      indicators.renta_min_casa_particular = parseCLP(casaMatch[1])
    }

    // No remuneracionales
    const noRemMatch = fullText.match(/no\s+remuneracion[ae]les?[^$]*?\$\s*([\d.,]+)/i)
    if (noRemMatch) {
      indicators.renta_min_no_remuneracional = parseCLP(noRemMatch[1])
    }

    if (indicators.imm === 0) {
      logger.warn('Could not parse IMM (sueldo minimo) from Previred page')
    } else {
      logger.debug({ imm: indicators.imm }, 'Parsed IMM')
    }
  } catch (err) {
    logger.warn({ err }, 'Error parsing rentas minimas')
  }

  // ── AFP Rates ───────────────────────────────────────────────
  try {
    const knownAFPs = ['Capital', 'Cuprum', 'Habitat', 'PlanVital', 'ProVida', 'Modelo', 'Uno']

    for (const afpName of knownAFPs) {
      // Look for the AFP name followed by percentage values
      // Pattern: AFP name ... percentage% ... percentage% ... percentage%
      const afpPattern = new RegExp(
        afpName + '[^\\n]*?([\\d,]+)\\s*%[^\\n]*?([\\d,]+)\\s*%[^\\n]*?([\\d,]+)\\s*%',
        'i',
      )
      const afpMatch = fullText.match(afpPattern)

      if (afpMatch) {
        const rate: AFPRate = {
          name: afpName,
          comision_dependiente: parsePercentage(afpMatch[1] + '%'),
          sis: parsePercentage(afpMatch[2] + '%'),
          tasa_dependiente: parsePercentage(afpMatch[3] + '%'),
          tasa_independiente: 0,
        }

        // Try to find the independent rate (usually a 4th percentage)
        const indepPattern = new RegExp(
          afpName + '[^\\n]*?(?:[\\d,]+\\s*%[^%]*?){3}([\\d,]+)\\s*%',
          'i',
        )
        const indepMatch = fullText.match(indepPattern)
        if (indepMatch) {
          rate.tasa_independiente = parsePercentage(indepMatch[1] + '%')
        }

        indicators.afp_rates.push(rate)
      }
    }

    if (indicators.afp_rates.length === 0) {
      logger.warn('Could not parse any AFP rates from Previred page')
    } else {
      logger.debug({ afp_count: indicators.afp_rates.length }, 'Parsed AFP rates')
    }
  } catch (err) {
    logger.warn({ err }, 'Error parsing AFP rates')
  }

  // ── Asignacion Familiar ─────────────────────────────────────
  try {
    // Look for "Tramo" rows with amounts and income thresholds
    const tramoPatterns = [
      { tramo: 'A', pattern: /tramo\s*[1a][^$]*?\$\s*([\d.,]+)[^$]*?\$\s*([\d.,]+)/i },
      { tramo: 'B', pattern: /tramo\s*[2b][^$]*?\$\s*([\d.,]+)[^$]*?\$\s*([\d.,]+)(?:[^$]*?\$\s*([\d.,]+))?/i },
      { tramo: 'C', pattern: /tramo\s*[3c][^$]*?\$\s*([\d.,]+)[^$]*?\$\s*([\d.,]+)(?:[^$]*?\$\s*([\d.,]+))?/i },
    ]

    // Alternative: parse asignacion familiar section as a whole
    const asigMatch = fullText.match(/asignaci[oó]n\s+familiar[^]*?tramo/i)
    if (asigMatch) {
      // Try to extract tramo data from the full text after "asignacion familiar"
      const asigSection = fullText.slice(fullText.search(/asignaci[oó]n\s+familiar/i))

      // Tramo A/1
      const tramoAMatch = asigSection.match(/(?:tramo\s*(?:1|a))[^$]*?\$\s*([\d.,]+)[^$]*?(?:renta[^$]*?)?\$\s*([\d.,]+)/i)
      if (tramoAMatch) {
        indicators.asignacion_familiar.push({
          tramo: 'A',
          monto: parseCLP(tramoAMatch[1]),
          renta_desde: 0,
          renta_hasta: parseCLP(tramoAMatch[2]),
        })
      }

      // Tramo B/2
      const tramoBMatch = asigSection.match(/(?:tramo\s*(?:2|b))[^$]*?\$\s*([\d.,]+)[^$]*?\$\s*([\d.,]+)(?:[^$]*?\$\s*([\d.,]+))?/i)
      if (tramoBMatch) {
        indicators.asignacion_familiar.push({
          tramo: 'B',
          monto: parseCLP(tramoBMatch[1]),
          renta_desde: indicators.asignacion_familiar[0]?.renta_hasta ?? 0,
          renta_hasta: parseCLP(tramoBMatch[3] ?? tramoBMatch[2]),
        })
      }

      // Tramo C/3
      const tramoCMatch = asigSection.match(/(?:tramo\s*(?:3|c))[^$]*?\$\s*([\d.,]+)[^$]*?\$\s*([\d.,]+)(?:[^$]*?\$\s*([\d.,]+))?/i)
      if (tramoCMatch) {
        indicators.asignacion_familiar.push({
          tramo: 'C',
          monto: parseCLP(tramoCMatch[1]),
          renta_desde: indicators.asignacion_familiar[1]?.renta_hasta ?? 0,
          renta_hasta: parseCLP(tramoCMatch[3] ?? tramoCMatch[2]),
        })
      }

      // Tramo D/4 - always 0 monto
      const tramoDMatch = asigSection.match(/(?:tramo\s*(?:4|d))[^$]*?\$\s*([\d.,]+)/i)
      if (tramoDMatch) {
        indicators.asignacion_familiar.push({
          tramo: 'D',
          monto: 0,
          renta_desde: indicators.asignacion_familiar[2]?.renta_hasta ?? 0,
          renta_hasta: 999_999_999,
        })
      }
    }

    if (indicators.asignacion_familiar.length === 0) {
      logger.warn('Could not parse asignacion familiar tramos from Previred page')
    } else {
      logger.debug({ tramos: indicators.asignacion_familiar.length }, 'Parsed asignacion familiar')
    }
  } catch (err) {
    logger.warn({ err }, 'Error parsing asignacion familiar')
  }

  // ── Summary log ─────────────────────────────────────────────
  const parsed = {
    uf: indicators.uf > 0,
    utm: indicators.utm > 0,
    uta: indicators.uta > 0,
    imm: indicators.imm > 0,
    tope_afp: indicators.tope_imponible_afp > 0,
    tope_ips: indicators.tope_imponible_ips > 0,
    tope_cesantia: indicators.tope_seg_cesantia > 0,
    afp_rates: indicators.afp_rates.length,
    asig_familiar: indicators.asignacion_familiar.length,
  }

  logger.info({ month, year, parsed }, 'Previred indicators parsed')
  return indicators
}

// ---------------------------------------------------------------------------
// Odoo sync
// ---------------------------------------------------------------------------

/**
 * Upsert indicators into Odoo's l10n_cl.indicators model for the given company.
 * If a record for the current month/year already exists, it updates it.
 * Otherwise, it creates a new one.
 */
async function syncToOdoo(
  indicators: PreviredIndicators,
  companyId: number,
): Promise<boolean> {
  try {
    // Check if a record already exists for this month/year/company
    const existing = await odooAccountingAdapter.searchRead(
      'l10n_cl.indicators',
      [
        ['month', '=', indicators.month],
        ['year', '=', indicators.year],
        ['company_id', '=', companyId],
      ],
      ['id'],
      { limit: 1 },
    )

    const values: Record<string, unknown> = {
      month: indicators.month,
      year: indicators.year,
      uf: indicators.uf,
      utm: indicators.utm,
      uta: indicators.uta,
      imm: indicators.imm,
      tope_imponible_afp: indicators.tope_imponible_afp_uf,
      tope_imponible_salud: indicators.tope_imponible_afp_uf, // Same as AFP cap (90 UF), NOT IPS (60 UF)
      tope_seg_cesantia: indicators.tope_seg_cesantia_uf,
      company_id: companyId,
    }

    if (existing.length > 0) {
      const record = existing[0] as Record<string, unknown>
      const recordId = record['id'] as number
      const ok = await odooAccountingAdapter.write('l10n_cl.indicators', [recordId], values)
      if (ok) {
        logger.info({ recordId, month: indicators.month, year: indicators.year, companyId }, 'Updated l10n_cl.indicators in Odoo')
      } else {
        logger.error({ recordId, companyId }, 'Failed to update l10n_cl.indicators in Odoo')
        return false
      }
    } else {
      const newId = await odooAccountingAdapter.create('l10n_cl.indicators', values)
      if (newId) {
        logger.info({ newId, month: indicators.month, year: indicators.year, companyId }, 'Created l10n_cl.indicators in Odoo')
      } else {
        logger.error({ companyId }, 'Failed to create l10n_cl.indicators in Odoo')
        return false
      }
    }

    return true
  } catch (error) {
    logger.error({ error, companyId }, 'Error syncing indicators to Odoo')
    return false
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ScrapeResult {
  success: boolean
  indicators: PreviredIndicators | null
  odooSynced: boolean
  error?: string
}

/**
 * Main entry point: scrape Previred, parse indicators, sync to Odoo.
 * This function never throws — it returns a result object.
 *
 * @param companyId - The Odoo company ID to associate the indicators with.
 *                    If not provided, syncs for all companies.
 */
export async function scrapePreviredIndicators(
  companyId?: number,
): Promise<ScrapeResult> {
  try {
    const indicators = await fetchAndParsePrevired()

    if (!indicators) {
      return {
        success: false,
        indicators: null,
        odooSynced: false,
        error: 'Failed to fetch or parse Previred indicators page',
      }
    }

    // Validate scraped data is not all zeros (page might be broken or empty)
    if (indicators.uf === 0 && indicators.utm === 0 && indicators.imm === 0) {
      logger.warn('Previred scrape returned all zeros - skipping sync')
      return {
        success: false,
        indicators,
        odooSynced: false,
        error: 'all_zeros',
      }
    }

    // If no company ID provided, try to sync for all companies
    let odooSynced = false
    if (companyId) {
      odooSynced = await syncToOdoo(indicators, companyId)
    } else {
      // Fetch all active companies from Odoo and sync each
      const companies = await odooAccountingAdapter.searchRead(
        'res.company',
        [],
        ['id'],
        { limit: 100 },
      )

      if (companies.length === 0) {
        logger.warn('No companies found in Odoo — skipping sync')
      }

      let syncedCount = 0
      for (const c of companies) {
        const comp = c as Record<string, unknown>
        const cId = comp['id'] as number
        const ok = await syncToOdoo(indicators, cId)
        if (ok) syncedCount++
      }

      odooSynced = syncedCount > 0
      logger.info({ syncedCount, totalCompanies: companies.length }, 'Previred sync complete for all companies')
    }

    return {
      success: true,
      indicators,
      odooSynced,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error({ error }, 'Unhandled error in Previred scraper')
    return {
      success: false,
      indicators: null,
      odooSynced: false,
      error: message,
    }
  }
}

// ---------------------------------------------------------------------------
// Cron scheduler
// ---------------------------------------------------------------------------

const DAILY_8AM_CLT_MS = 60 * 60 * 1000 // Check every hour

/**
 * Simple daily scheduler that runs at ~8am Chile time (CLT/CLST).
 * Uses setInterval to check hourly and fires at the right hour.
 */
class PreviredScheduler {
  private timer: ReturnType<typeof setInterval> | null = null
  private lastRunDate: string | null = null

  start() {
    if (this.timer) return
    logger.info('Previred daily scraper scheduler started (target: 8am CLT)')
    this.timer = setInterval(() => this.checkAndRun(), DAILY_8AM_CLT_MS)
    // Run immediately on startup if it hasn't run today
    setTimeout(() => this.checkAndRun(), 10_000)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      logger.info('Previred daily scraper scheduler stopped')
    }
  }

  private async checkAndRun() {
    // Get current time in Chile timezone
    const nowCLT = new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' })
    const clDate = new Date(nowCLT)
    const hour = clDate.getHours()
    const dateKey = `${clDate.getFullYear()}-${clDate.getMonth() + 1}-${clDate.getDate()}`

    // Only run between 8am-9am CLT and only once per day
    if (hour >= 8 && hour < 9 && this.lastRunDate !== dateKey) {
      this.lastRunDate = dateKey
      logger.info({ dateKey, hour }, 'Running scheduled Previred scrape')
      await scrapePreviredIndicators()
    }
  }
}

export const previredScheduler = new PreviredScheduler()
