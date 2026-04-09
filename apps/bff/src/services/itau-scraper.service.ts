/**
 * CUENTAX — Itaú Chile Bank Scraper
 * ==================================
 * Scrapes Itaú Empresas portal via Playwright to fetch:
 * 1. Account balances (from dashboard)
 * 2. Transactions from "Cartola histórica" (by month)
 *
 * Flow:
 *   Login (RUT + clave) → Select company (by RUT) → Dashboard (accounts + saldos)
 *   → Mi Banco > Cartola histórica → Select period → Parse transaction table
 *
 * Portal: https://banco.itau.cl/wps/portal/newiol/web/login
 * Auth: RUT personal + clave internet (no 2FA/coordinates)
 */

import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
import { logger } from '@/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ItauAccount {
  tipo: 'corriente' | 'vista'
  numero: string
  moneda: string
  saldoContable: number
  saldoDisponible: number
}

export interface ItauTransaction {
  fecha: string        // YYYY-MM-DD (converted from dd/mm)
  nOperacion: string   // bank reference number
  sucursal: string
  descripcion: string
  deposito: number     // credit (abono)
  giro: number         // debit (cargo)
  saldoDiario: number
}

export interface ItauSession {
  browser: Browser
  context: BrowserContext
  page: Page
}

export interface ItauSyncResult {
  success: boolean
  accounts: ItauAccount[]
  transactions: ItauTransaction[]
  resumen?: {
    saldoInicial: number
    totalDepositos: number
    totalCargos: number
  }
  error?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ITAU_LOGIN_URL = 'https://banco.itau.cl/wps/portal/newiol/web/login'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse CLP amount string like "$4.812.626" or "-$ 86.555" to number */
function parseCLP(text: string): number {
  if (!text) return 0
  const clean = text.replace(/[$.]/g, '').replace(/,/g, '.').replace(/\s/g, '').trim()
  const num = parseInt(clean, 10)
  return isNaN(num) ? 0 : num
}

/** Convert dd/mm or dd/mm/yyyy to YYYY-MM-DD */
function toISO(dateStr: string, year?: number): string {
  if (!dateStr) return ''
  const parts = dateStr.trim().split('/')
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }
  if (parts.length === 2 && year) {
    return `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }
  return dateStr
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function createItauSession(
  rutPersonal: string,
  claveInternet: string,
  rutEmpresa?: string,
): Promise<ItauSession> {
  logger.info({ rutPersonal: rutPersonal.substring(0, 4) + '...' }, 'Itaú: authenticating')

  // Use Chilean proxy if configured (Itaú blocks non-Chilean IPs)
  const proxyServer = process.env['BANK_PROXY_URL'] ?? undefined
  const launchOpts: Record<string, unknown> = { headless: true }
  if (proxyServer) {
    launchOpts.proxy = { server: proxyServer }
    logger.info({ proxy: proxyServer }, 'Itaú: using proxy')
  }
  const browser = await chromium.launch(launchOpts as Parameters<typeof chromium.launch>[0])
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'es-CL',
  })
  const page = await context.newPage()

  try {
    await page.goto(ITAU_LOGIN_URL, { waitUntil: 'load', timeout: 60_000 })
    // Wait extra for Itaú's JS to render the login form
    await page.waitForTimeout(5000)
    logger.info({ url: page.url(), title: await page.title() }, 'Itaú: login page loaded')

    // Log page content for debugging if fields not found
    const hasRutField = await page.locator('#rut_usuarioID').isVisible().catch(() => false)
    if (!hasRutField) {
      const bodyText = await page.evaluate(`(() => document.body.innerText.substring(0, 500))()`)
      logger.warn({ bodyText }, 'Itaú: RUT field not found, page content sample')
      // Try waiting longer
      await page.waitForTimeout(10_000)
    }

    // Wait for the RUT field
    await page.waitForSelector('#rut_usuarioID', { timeout: 30_000 })

    // Fill RUT — click field first, clear, then type slowly to trigger Itaú's JS handlers
    await page.click('#rut_usuarioID')
    await page.fill('#rut_usuarioID', '')
    await page.type('#rut_usuarioID', rutPersonal, { delay: 50 })

    // Fill password
    await page.click('#claveId')
    await page.fill('#claveId', '')
    await page.type('#claveId', claveInternet, { delay: 50 })

    // Click Ingresar
    await Promise.all([
      page.waitForNavigation({ timeout: 30_000, waitUntil: 'networkidle' }).catch(() => {}),
      page.click('#btnLoginPortalEmpresas'),
    ])

    await page.waitForTimeout(3000)

    // Check for login failure
    const currentUrl = page.url()
    const content = await page.content()
    if (currentUrl.includes('login') || content.includes('incorrecta') || content.includes('Clave bloqueada')) {
      throw new Error('Itaú authentication failed: invalid credentials')
    }

    // Switch company if needed
    if (rutEmpresa) {
      await switchCompany(page, rutEmpresa)
    }

    logger.info('Itaú: authenticated successfully')
    return { browser, context, page }
  } catch (err) {
    await browser.close()
    throw err
  }
}

async function switchCompany(page: Page, rutEmpresa: string): Promise<void> {
  try {
    // Click "Cambiar empresa" link
    await page.evaluate(`(() => {
      const links = document.querySelectorAll('a');
      for (const a of links) {
        if (a.textContent.trim().includes('Cambiar empresa')) { a.click(); return; }
      }
    })()`)
    await page.waitForTimeout(2000)

    // Select the company radio button by RUT (format: rd_RUTWITHOUTDASH)
    const rutClean = rutEmpresa.replace(/[.\-]/g, '')
    await page.evaluate(`(() => {
      const radio = document.getElementById('rd_${rutClean}');
      if (radio) radio.click();
    })()`)
    await page.waitForTimeout(500)

    // Click "Cambiar empresa" confirm button
    await page.evaluate(`(() => {
      const btn = document.getElementById('btnCambiarEmpresa');
      if (btn) btn.click();
    })()`)

    // Wait for re-authentication redirect and re-login
    await page.waitForTimeout(5000)
    await page.waitForLoadState('networkidle').catch(() => {})

    logger.info({ rutEmpresa }, 'Itaú: switched company')
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Itaú: could not switch company, continuing with current')
  }
}

// ---------------------------------------------------------------------------
// Scrape accounts from dashboard
// ---------------------------------------------------------------------------

export async function scrapeAccounts(page: Page): Promise<ItauAccount[]> {

  const accounts: Array<{
    tipo: string; numero: string; moneda: string;
    saldoContable: string; saldoDisponible: string
  }> = await page.evaluate(`(() => {
    const results = [];
    const links = document.querySelectorAll('a[href*="Corriente"], a[href*="corriente"], a[href*="Vista"], a[href*="vista"]');
    links.forEach(link => {
      const text = link.textContent?.trim() ?? '';
      const row = link.closest('tr') ?? link.closest('div');
      if (!row) return;
      const cells = row.querySelectorAll('td');
      const tipo = text.toLowerCase().includes('vista') ? 'vista' : 'corriente';
      const numero = text.replace(/[^0-9]/g, '');
      if (cells.length >= 3) {
        results.push({
          tipo, numero,
          moneda: cells[1]?.textContent?.trim() ?? 'CLP',
          saldoContable: cells[2]?.textContent?.trim() ?? '0',
          saldoDisponible: cells[3]?.textContent?.trim() ?? '0',
        });
      }
    });
    return results;
  })()`)

  return accounts.map(a => ({
    tipo: a.tipo as 'corriente' | 'vista',
    numero: a.numero,
    moneda: a.moneda,
    saldoContable: parseCLP(a.saldoContable),
    saldoDisponible: parseCLP(a.saldoDisponible),
  }))
}

// ---------------------------------------------------------------------------
// Scrape cartola histórica
// ---------------------------------------------------------------------------

export async function scrapeCartolaHistorica(
  page: Page,
  numeroCuenta: string,
  mes: number,
  year: number,
): Promise<{ transactions: ItauTransaction[]; resumen: ItauSyncResult['resumen'] }> {
  logger.info({ numeroCuenta, mes, year }, 'Itaú: scraping cartola histórica')

  // Navigate directly to cartola histórica URL
  await page.goto('https://banco.itau.cl/wps/myportal/newiol/web/mi-banco/cuenta-corriente/cartola-historica', {
    waitUntil: 'networkidle', timeout: 30_000,
  })
  await page.waitForTimeout(3000)

  // Extract resumen
  const resumen: { saldoInicial: string; totalDepositos: string; totalCargos: string } = await page.evaluate(`(() => {
    const texts = document.body.innerText;
    const saldoInicial = texts.match(/Saldo inicial[:\\s]*([\\d$.]+)/i)?.[1] ?? '0';
    const totalDep = texts.match(/Total dep[oó]sitos[:\\s]*([\\d$.]+)/i)?.[1] ?? '0';
    const totalCar = texts.match(/Total cargos[:\\s]*([\\d$.]+)/i)?.[1] ?? '0';
    return { saldoInicial, totalDepositos: totalDep, totalCargos: totalCar };
  })()`)

  // Extract all transaction rows from the cartola table
  // Skip first row (contains JS garbage in header), only take rows with valid date pattern
  const rawTransactions: Array<{
    fecha: string; nOperacion: string; sucursal: string
    descripcion: string; deposito: string; giro: string; saldo: string
  }> = await page.evaluate(`(() => {
    const rows = [];
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      const headers = table.querySelectorAll('th');
      const headerTexts = Array.from(headers).map(h => h.textContent?.trim().toLowerCase() ?? '');
      if (headerTexts.some(h => h.includes('operaci')) && headerTexts.some(h => h.includes('descripci'))) {
        const bodyRows = table.querySelectorAll('tbody tr');
        for (const tr of bodyRows) {
          const cells = tr.querySelectorAll('td');
          if (cells.length === 7) {
            const fecha = cells[0]?.textContent?.trim() ?? '';
            // Only include rows with valid date (dd/mm format)
            if (/^\\d{2}\\/\\d{2}$/.test(fecha)) {
              rows.push({
                fecha,
                nOperacion: cells[1]?.textContent?.trim() ?? '',
                sucursal: cells[2]?.textContent?.trim() ?? '',
                descripcion: cells[3]?.textContent?.trim() ?? '',
                deposito: cells[4]?.textContent?.trim() ?? '0',
                giro: cells[5]?.textContent?.trim() ?? '0',
                saldo: cells[6]?.textContent?.trim() ?? '0',
              });
            }
          }
        }
        break;
      }
    }
    return rows;
  })()`)

  const transactions: ItauTransaction[] = rawTransactions.map(r => ({
    fecha: toISO(r.fecha, year),
    nOperacion: r.nOperacion,
    sucursal: r.sucursal,
    descripcion: r.descripcion,
    deposito: parseCLP(r.deposito),
    giro: parseCLP(r.giro),
    saldoDiario: parseCLP(r.saldo),
  }))

  logger.info({ numeroCuenta, mes, year, count: transactions.length }, 'Itaú: cartola parsed')

  return {
    transactions,
    resumen: {
      saldoInicial: parseCLP(resumen.saldoInicial),
      totalDepositos: parseCLP(resumen.totalDepositos),
      totalCargos: parseCLP(resumen.totalCargos),
    },
  }
}

// ---------------------------------------------------------------------------
// Full sync flow
// ---------------------------------------------------------------------------

export async function syncItauAccount(
  rutPersonal: string,
  claveInternet: string,
  rutEmpresa: string | undefined,
  numeroCuenta: string,
  mes: number,
  year: number,
): Promise<ItauSyncResult> {
  let session: ItauSession | null = null

  try {
    session = await createItauSession(rutPersonal, claveInternet, rutEmpresa)

    // 1. Scrape accounts from dashboard
    const accounts = await scrapeAccounts(session.page)
    logger.info({ accountCount: accounts.length }, 'Itaú: accounts scraped')

    // 2. Scrape cartola histórica for the specified account
    const { transactions, resumen } = await scrapeCartolaHistorica(
      session.page, numeroCuenta, mes, year,
    )

    return {
      success: true,
      accounts,
      transactions,
      resumen,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error({ err: message }, 'Itaú sync failed')
    return {
      success: false,
      accounts: [],
      transactions: [],
      error: message,
    }
  } finally {
    if (session) {
      await session.browser.close().catch(() => {})
    }
  }
}

export async function closeItauSession(session: ItauSession): Promise<void> {
  try {
    await session.browser.close()
  } catch { /* ignore */ }
}
