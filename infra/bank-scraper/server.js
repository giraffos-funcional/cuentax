/**
 * CUENTAX — Bank Scraper Microservice (Chile Server)
 * ===================================================
 * Runs on a Chilean server to bypass geo-blocking by banks.
 * Exposes a single POST /scrape endpoint that:
 * 1. Logs into Itaú Empresas via Playwright
 * 2. Navigates to Cartola histórica
 * 3. Extracts transactions
 * 4. Returns JSON
 *
 * Deploy: node server.js (port 3333)
 * Auth: Bearer token via SCRAPER_SECRET env var
 */

const http = require('http')
const { chromium } = require('playwright')

const PORT = process.env.PORT || 3333
const SECRET = process.env.SCRAPER_SECRET || 'cuentax-bank-scraper-2026'

// ── Helpers ──────────────────────────────────────────────────

function parseCLP(text) {
  if (!text) return 0
  const clean = text.replace(/[$.]/g, '').replace(/,/g, '.').replace(/\s/g, '').trim()
  const num = parseInt(clean, 10)
  return isNaN(num) ? 0 : num
}

function toISO(dateStr, year) {
  if (!dateStr) return ''
  const parts = dateStr.trim().split('/')
  if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  if (parts.length === 2 && year) return `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  return dateStr
}

// ── Scraper ──────────────────────────────────────────────────

async function scrapeItau({ rutPersonal, claveInternet, rutEmpresa, numeroCuenta, mes, year }) {
  console.log(`[scrape] Starting: rut=${rutPersonal.substring(0,4)}... cuenta=${numeroCuenta} periodo=${mes}/${year}`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'es-CL',
  })
  const page = await context.newPage()

  try {
    // 1. Login
    await page.goto('https://banco.itau.cl/wps/portal/newiol/web/login', { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForSelector('#rut_usuarioID', { timeout: 15000 })

    await page.click('#rut_usuarioID')
    await page.type('#rut_usuarioID', rutPersonal, { delay: 50 })
    await page.click('#claveId')
    await page.type('#claveId', claveInternet, { delay: 50 })

    await Promise.all([
      page.waitForNavigation({ timeout: 30000, waitUntil: 'networkidle' }).catch(() => {}),
      page.click('#btnLoginPortalEmpresas'),
    ])
    await page.waitForTimeout(3000)

    const loginUrl = page.url()
    if (loginUrl.includes('login')) {
      throw new Error('Login failed - still on login page')
    }
    console.log('[scrape] Login successful')

    // 2. Switch company if needed
    if (rutEmpresa) {
      try {
        await page.evaluate(() => {
          const links = document.querySelectorAll('a')
          for (const a of links) {
            if (a.textContent.trim().includes('Cambiar empresa')) { a.click(); return }
          }
        })
        await page.waitForTimeout(2000)

        const rutClean = rutEmpresa.replace(/[.\-]/g, '')
        await page.evaluate((id) => {
          const radio = document.getElementById(id)
          if (radio) radio.click()
        }, `rd_${rutClean}`)
        await page.waitForTimeout(500)

        await page.evaluate(() => {
          const btn = document.getElementById('btnCambiarEmpresa')
          if (btn) btn.click()
        })
        await page.waitForTimeout(5000)
        await page.waitForLoadState('networkidle').catch(() => {})
        console.log(`[scrape] Switched to company ${rutEmpresa}`)
      } catch (err) {
        console.log(`[scrape] Company switch failed: ${err.message}, continuing`)
      }
    }

    // 3. Scrape accounts from dashboard
    const accounts = await page.evaluate(() => {
      const results = []
      const links = document.querySelectorAll('a')
      links.forEach(link => {
        const text = link.textContent?.trim() ?? ''
        if (text.includes('Cuenta Corriente') || text.includes('Cuenta Vista')) {
          const row = link.closest('tr')
          if (!row) return
          const cells = row.querySelectorAll('td')
          if (cells.length >= 3) {
            results.push({
              tipo: text.toLowerCase().includes('vista') ? 'vista' : 'corriente',
              numero: text.replace(/[^0-9]/g, ''),
              moneda: cells[1]?.textContent?.trim() ?? 'CLP',
              saldoContable: cells[2]?.textContent?.trim() ?? '0',
              saldoDisponible: cells[3]?.textContent?.trim() ?? '0',
            })
          }
        }
      })
      return results
    })
    console.log(`[scrape] Found ${accounts.length} accounts`)

    // 4. Navigate to Cartola histórica
    await page.goto('https://banco.itau.cl/wps/myportal/newiol/web/mi-banco/cuenta-corriente/cartola-historica', {
      waitUntil: 'networkidle', timeout: 30000,
    })
    await page.waitForTimeout(3000)

    // 5. Extract resumen
    const resumen = await page.evaluate(() => {
      const texts = document.body.innerText
      return {
        saldoInicial: texts.match(/Saldo inicial[:\s]*([\d$.]+)/i)?.[1] ?? '0',
        totalDepositos: texts.match(/Total dep[oó]sitos[:\s]*([\d$.]+)/i)?.[1] ?? '0',
        totalCargos: texts.match(/Total cargos[:\s]*([\d$.]+)/i)?.[1] ?? '0',
      }
    })

    // 6. Extract transactions
    const rawTx = await page.evaluate(() => {
      const rows = []
      const tables = document.querySelectorAll('table')
      for (const table of tables) {
        const headers = table.querySelectorAll('th')
        const headerTexts = Array.from(headers).map(h => h.textContent?.trim().toLowerCase() ?? '')
        if (headerTexts.some(h => h.includes('operaci')) && headerTexts.some(h => h.includes('descripci'))) {
          const bodyRows = table.querySelectorAll('tbody tr')
          for (const tr of bodyRows) {
            const cells = tr.querySelectorAll('td')
            if (cells.length === 7) {
              const fecha = cells[0]?.textContent?.trim() ?? ''
              if (/^\d{2}\/\d{2}$/.test(fecha)) {
                rows.push({
                  fecha,
                  nOperacion: cells[1]?.textContent?.trim() ?? '',
                  sucursal: cells[2]?.textContent?.trim() ?? '',
                  descripcion: cells[3]?.textContent?.trim() ?? '',
                  deposito: cells[4]?.textContent?.trim() ?? '0',
                  giro: cells[5]?.textContent?.trim() ?? '0',
                  saldo: cells[6]?.textContent?.trim() ?? '0',
                })
              }
            }
          }
          break
        }
      }
      return rows
    })

    const transactions = rawTx.map(r => ({
      fecha: toISO(r.fecha, year),
      nOperacion: r.nOperacion,
      sucursal: r.sucursal,
      descripcion: r.descripcion,
      deposito: parseCLP(r.deposito),
      giro: parseCLP(r.giro),
      saldoDiario: parseCLP(r.saldo),
    }))

    console.log(`[scrape] Parsed ${transactions.length} transactions`)

    return {
      success: true,
      accounts: accounts.map(a => ({
        ...a,
        saldoContable: parseCLP(a.saldoContable),
        saldoDisponible: parseCLP(a.saldoDisponible),
      })),
      transactions,
      resumen: {
        saldoInicial: parseCLP(resumen.saldoInicial),
        totalDepositos: parseCLP(resumen.totalDepositos),
        totalCargos: parseCLP(resumen.totalCargos),
      },
    }
  } catch (err) {
    console.error(`[scrape] Error: ${err.message}`)
    return { success: false, accounts: [], transactions: [], error: err.message }
  } finally {
    await browser.close()
  }
}

// ── HTTP Server ──────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', service: 'bank-scraper' }))
    return
  }

  // Scrape endpoint
  if (req.method === 'POST' && req.url === '/scrape') {
    // Auth check
    const auth = req.headers.authorization
    if (auth !== `Bearer ${SECRET}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }

    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const params = JSON.parse(body)
        const result = await scrapeItau(params)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: err.message }))
      }
    })
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(PORT, () => {
  console.log(`Bank scraper listening on port ${PORT}`)
})
