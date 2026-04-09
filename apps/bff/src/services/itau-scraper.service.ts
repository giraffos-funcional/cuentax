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

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'es-CL',
  })
  const page = await context.newPage()

  try {
    await page.goto(ITAU_LOGIN_URL, { waitUntil: 'networkidle', timeout: 60_000 })

    // Fill RUT
    const rutInput = page.locator('input[type="text"]').first()
    await rutInput.fill(rutPersonal)

    // Fill password
    const passInput = page.locator('input[type="password"]').first()
    await passInput.fill(claveInternet)

    // Click Ingresar
    await Promise.all([
      page.waitForNavigation({ timeout: 30_000, waitUntil: 'networkidle' }).catch(() => {}),
      page.locator('button:has-text("Ingresar"), input[type="submit"]').first().click(),
    ])

    await page.waitForTimeout(3000)

    // Check for login failure
    const content = await page.content()
    if (content.includes('incorrecta') || content.includes('error') && content.includes('clave')) {
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
    // Click "Cambiar empresa"
    const cambiarBtn = page.locator('text=Cambiar empresa').first()
    if (await cambiarBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cambiarBtn.click()
      await page.waitForTimeout(1500)

      // Find and click the radio button for the target RUT
      const rutOption = page.locator(`text=${rutEmpresa}`).first()
      if (await rutOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await rutOption.click()
        await page.waitForTimeout(500)

        // Click "Cambiar empresa" button
        const confirmBtn = page.locator('button:has-text("Cambiar empresa")').first()
        await confirmBtn.click()
        await page.waitForTimeout(3000)
        await page.waitForLoadState('networkidle').catch(() => {})

        logger.info({ rutEmpresa }, 'Itaú: switched company')
      }
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Itaú: could not switch company, continuing with current')
  }
}

// ---------------------------------------------------------------------------
// Scrape accounts from dashboard
// ---------------------------------------------------------------------------

export async function scrapeAccounts(page: Page): Promise<ItauAccount[]> {
  // Navigate to home/dashboard
  const inicioLink = page.locator('a:has-text("Inicio"), a[href*="inicio"]').first()
  if (await inicioLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await inicioLink.click()
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(2000)
  }

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

  // Navigate to Cartola histórica via Mi Banco menu
  try {
    // Try clicking "Mi Banco" tab first
    const miBancoTab = page.locator('a:has-text("Mi Banco")').first()
    if (await miBancoTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await miBancoTab.click()
      await page.waitForTimeout(2000)
    }

    // Look for "Cartola histórica" link
    const cartolaLink = page.locator('a:has-text("Cartola histórica"), a:has-text("cartola histórica")').first()
    if (await cartolaLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await cartolaLink.click()
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForTimeout(3000)
    } else {
      // Try clicking account first, then cartola link
      const accountLink = page.locator(`a:has-text("${numeroCuenta}")`).first()
      if (await accountLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await accountLink.click()
        await page.waitForTimeout(2000)
      }
      const cartolaLink2 = page.locator('a:has-text("cartola histórica")').first()
      if (await cartolaLink2.isVisible({ timeout: 5000 }).catch(() => false)) {
        await cartolaLink2.click()
        await page.waitForLoadState('networkidle').catch(() => {})
        await page.waitForTimeout(3000)
      }
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Itaú: navigation to cartola failed')
  }

  // Set the period (MM/YYYY)
  try {
    const periodoInput = page.locator('input[type="text"][value*="/"]').first()
    if (await periodoInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await periodoInput.click({ clickCount: 3 })
      await periodoInput.fill(`${String(mes).padStart(2, '0')} / ${year}`)
      await periodoInput.press('Enter')
      await page.waitForTimeout(3000)
      await page.waitForLoadState('networkidle').catch(() => {})
    }
  } catch {
    logger.warn('Itaú: could not set period, using current')
  }

  // Extract resumen
  const resumen: { saldoInicial: string; totalDepositos: string; totalCargos: string } = await page.evaluate(`(() => {
    const texts = document.body.innerText;
    const saldoInicial = texts.match(/Saldo inicial[:\\s]*([\\d$.]+)/i)?.[1] ?? '0';
    const totalDep = texts.match(/Total dep[oó]sitos[:\\s]*([\\d$.]+)/i)?.[1] ?? '0';
    const totalCar = texts.match(/Total cargos[:\\s]*([\\d$.]+)/i)?.[1] ?? '0';
    return { saldoInicial, totalDepositos: totalDep, totalCargos: totalCar };
  })()`)

  // Extract all transaction rows from the cartola table
  const rawTransactions: Array<{
    fecha: string; nOperacion: string; sucursal: string
    descripcion: string; deposito: string; giro: string; saldo: string
  }> = await page.evaluate(`(() => {
    const rows = [];
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      const headers = table.querySelectorAll('th');
      const headerTexts = Array.from(headers).map(h => h.textContent?.trim().toLowerCase() ?? '');
      if (headerTexts.some(h => h.includes('fecha')) && headerTexts.some(h => h.includes('descripci'))) {
        const bodyRows = table.querySelectorAll('tbody tr');
        for (const tr of bodyRows) {
          const cells = tr.querySelectorAll('td');
          if (cells.length >= 6) {
            rows.push({
              fecha: cells[0]?.textContent?.trim() ?? '',
              nOperacion: cells[1]?.textContent?.trim() ?? '',
              sucursal: cells[2]?.textContent?.trim() ?? '',
              descripcion: cells[3]?.textContent?.trim() ?? '',
              deposito: cells[4]?.textContent?.trim() ?? '0',
              giro: cells[5]?.textContent?.trim() ?? '0',
              saldo: cells[6]?.textContent?.trim() ?? '0',
            });
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
