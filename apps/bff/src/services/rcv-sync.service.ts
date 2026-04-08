/**
 * CUENTAX — RCV Sync Service
 * ============================
 * Logs into SII web portal, fetches the Registro de Compras y Ventas (RCV)
 * for a given period, and stores the results in the local database.
 *
 * SII RCV flow:
 * 1. POST to SII auth endpoint → get session cookie
 * 2. GET RCV data via the consulta DCV API (JSON)
 * 3. Parse and store in rcv_registros + rcv_detalles
 * 4. Match RCV detalles with existing DTEs (by company_id + tipo_dte + folio)
 * 5. Create missing DTEs from RCV data (estado = 'aceptado' since SII confirmed them)
 *
 * The SII RCV Angular app at https://www4.sii.cl/consdcvinternetui/
 * calls backend APIs that return JSON. We call those APIs directly.
 */

import crypto from 'node:crypto'
import { chromium } from 'playwright'
import type { Browser, BrowserContext } from 'playwright'
import { eq, and, inArray } from 'drizzle-orm'
import { db } from '@/db/client'
import { companies, rcvRegistros, rcvDetalles, dteDocuments } from '@/db/schema'
import { decrypt } from '@/core/crypto'
import { logger } from '@/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RCVSyncOptions {
  companyId: number
  mes: number
  year: number
  tipo: 'compras' | 'ventas'
}

export interface RCVSyncResult {
  success: boolean
  registroId?: number
  totalRegistros: number
  totalNeto: number
  totalIva: number
  totalExento: number
  dtesMatched: number
  dtesCreated: number
  error?: string
}

interface SIIDocumento {
  detTipoDoc?: number
  detNroDoc?: number
  detFchDoc?: string
  detRutDoc?: string
  detRznSoc?: string
  detMntNeto?: number
  detMntExe?: number
  detMntIVA?: number
  detMntTotal?: number
  detMntIVANoRec?: number
  detTipoDocRef?: number
  detFolioDocRef?: number
  estado?: string
  // Additional fields from SII
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// SII Auth + API via Playwright (headless browser)
// ---------------------------------------------------------------------------
// The SII uses Queue-it, session cookies (TOKEN, CSESSIONID), and complex
// redirect chains that block simple HTTP requests. We use a headless browser
// to authenticate through the real login form, then extract data from the
// Angular RCV app's internal API.
// ---------------------------------------------------------------------------

const SII_LOGIN_URL = 'https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?https://www4.sii.cl/consdcvinternetui/'
const SII_RCV_API = 'https://www4.sii.cl/consdcvinternetui/services/data/facadeService'

export interface SIISession {
  context: BrowserContext
  browser: Browser
  token: string
  cookies: string
}

/**
 * Create an authenticated SII session using headless Playwright.
 * Logs in through the real SII web form to get proper session cookies.
 */
export async function createSIISession(rutEmpresa: string, siiUser: string, siiPassword: string): Promise<SIISession> {
  logger.info({ siiUser, rutEmpresa }, 'Authenticating with SII via headless browser')

  let browser: Browser
  try {
    browser = await chromium.launch({ headless: true })
  } catch (launchErr) {
    const msg = launchErr instanceof Error ? launchErr.message : String(launchErr)
    logger.error({ err: msg }, 'Failed to launch Chromium — is Playwright browser installed?')
    throw new Error(`Chromium not available: ${msg}. Run "npx playwright install chromium" on the server.`)
  }
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'es-CL',
  })
  const page = await context.newPage()

  try {
    // Navigate to login page
    await page.goto(SII_LOGIN_URL, { waitUntil: 'networkidle', timeout: 60_000 })

    // Fill in RUT and password
    const rutClean = siiUser.replace(/\./g, '')
    await page.locator('#rutcntr').fill(rutClean)
    await page.locator('#clave').fill(siiPassword)

    // Click login button and wait for navigation
    await Promise.all([
      page.waitForNavigation({ timeout: 30_000, waitUntil: 'networkidle' }).catch(() => {}),
      page.locator('#bt_ingresar').click(),
    ])

    // Wait a bit for any Queue-it redirects
    await page.waitForTimeout(3000)

    // Check if login failed
    const pageContent = await page.content()
    if (pageContent.includes('Transaccion Rechazada') || pageContent.includes('Clave Tributaria incorrecta')) {
      throw new Error('SII authentication failed: invalid credentials')
    }

    // Extract TOKEN cookie
    const cookies = await context.cookies()
    const tokenCookie = cookies.find(c => c.name === 'TOKEN')
    if (!tokenCookie) {
      throw new Error('SII authentication failed: no TOKEN cookie received')
    }

    logger.info({ token: tokenCookie.value.substring(0, 8) + '...' }, 'SII authentication successful')

    await page.close()

    return {
      context,
      browser,
      token: tokenCookie.value,
      cookies: cookies.map(c => `${c.name}=${c.value}`).join('; '),
    }
  } catch (err) {
    await browser.close()
    throw err
  }
}

/**
 * Close the SII session and browser.
 */
export async function closeSIISession(session: SIISession): Promise<void> {
  try {
    await session.browser.close()
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Call the SII RCV facadeService API directly (for endpoints that don't need reCAPTCHA).
 */
async function callSIIApi(session: SIISession, endpoint: string, data: Record<string, unknown>): Promise<unknown> {
  const namespace = `cl.sii.sdi.lob.diii.consdcv.data.api.interfaces.FacadeService/${endpoint}`
  const url = `${SII_RCV_API}/${endpoint}`
  const transactionId = crypto.randomUUID()

  const page = await session.context.newPage()
  try {
    await page.goto('https://www4.sii.cl/consdcvinternetui/#/index', { waitUntil: 'networkidle', timeout: 30_000 })

    const result = await page.evaluate(async ({ url, namespace, token, transactionId, data }) => {
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
        },
        body: JSON.stringify({
          metaData: { namespace, conversationId: token, transactionId, page: null },
          data,
        }),
      })
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`SII API ${response.status}: ${body.substring(0, 500)}`)
      }
      return response.json()
    }, { url, namespace, token: session.token, transactionId, data })

    return result
  } finally {
    await page.close()
  }
}

/**
 * Fetch RCV detalles by driving the Angular UI with Playwright.
 * The SII requires a valid reCAPTCHA v3 token for getDetalleCompra/Venta,
 * which only the Angular app can generate. We navigate the UI, trigger the
 * Angular app's own API call, and intercept the network response.
 */
async function fetchDetalleViaUI(
  session: SIISession,
  rut: string,
  dv: string,
  periodo: string,
  operacion: 'COMPRA' | 'VENTA',
  tipoDoc: number,
): Promise<unknown[]> {
  const detalleEndpoint = operacion === 'COMPRA' ? 'getDetalleCompra' : 'getDetalleVenta'
  const page = await session.context.newPage()

  try {
    // Set up response interceptor BEFORE navigating
    let detalleResponse: unknown = null
    const responsePromise = new Promise<unknown>((resolve) => {
      page.on('response', async (response) => {
        if (response.url().includes(`facadeService/${detalleEndpoint}`)) {
          try {
            const json = await response.json()
            detalleResponse = json
            resolve(json)
          } catch { resolve(null) }
        }
      })
    })

    // Navigate to the RCV Angular app
    await page.goto('https://www4.sii.cl/consdcvinternetui/#/index', { waitUntil: 'networkidle', timeout: 30_000 })

    // Wait for Angular to be ready
    await page.waitForTimeout(2000)

    // Discover the Angular service name and use $http with Angular's reCAPTCHA interceptor.
    const triggered = await page.evaluate(async ({ rut, dv, periodo, operacion, tipoDoc, detalleEndpoint }) => {
      // @ts-expect-error: Angular global
      const ng = globalThis.angular
      if (!ng) return { method: 'none', error: 'angular not found' }

      const injector = ng.element('[ng-app]')?.injector?.() ?? ng.element('body')?.injector?.()
      if (!injector) return { method: 'none', error: 'injector not found' }

      // List available services that contain 'facade' or 'detalle' (for debugging)
      const services: string[] = []
      try {
        const providerCache = (injector as Record<string, unknown>)._providerCache || {}
        for (const key of Object.keys(providerCache)) {
          if (/facade|detalle|rcv|dcv|service/i.test(key)) services.push(key)
        }
      } catch { /* ignore */ }

      try {
        const $http = injector.get('$http')
        // Use $http.post — Angular's interceptors (including reCAPTCHA) are applied automatically
        const namespace = `cl.sii.sdi.lob.diii.consdcv.data.api.interfaces.FacadeService/${detalleEndpoint}`
        const resp = await new Promise((resolve, reject) => {
          $http.post(`/consdcvinternetui/services/data/facadeService/${detalleEndpoint}`, {
            metaData: { namespace, conversationId: '', transactionId: '0', page: null },
            data: {
              rutEmisor: rut, dvEmisor: dv, ptributario: periodo,
              estadoContab: 'REGISTRO', operacion, codTipoDoc: tipoDoc,
            },
          }).then((r: { data: unknown }) => resolve(r.data), (e: { data?: unknown; statusText?: string }) => reject(new Error(e.statusText ?? 'request failed')))
        })
        return { method: '$http', error: null, services, directData: resp }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return { method: '$http-failed', error: msg, services }
      }
    }, { rut, dv, periodo, operacion, tipoDoc, detalleEndpoint })

    logger.info({ tipoDoc, operacion, method: triggered.method, error: triggered.error, services: (triggered as any).services }, 'Angular UI trigger result')

    // If $http worked and returned data directly, use it
    if (triggered.method === '$http' && (triggered as any).directData) {
      const result = (triggered as any).directData
      const docs = Array.isArray(result?.data) ? result.data : []
      logger.info({ tipoDoc, operacion, count: docs.length, respEstado: result?.respEstado }, 'Detalle fetched via $http')
      return docs
    }

    // If Angular wasn't found, try clicking through the UI
    if (triggered.method === 'none') {
      return await fetchDetalleViaClicks(page, operacion, periodo, tipoDoc)
    }

    // Check if we caught anything via the response interceptor
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000))
    const result = await Promise.race([responsePromise, timeoutPromise]) as any

    if (result) {
      const docs = Array.isArray(result?.data) ? result.data : []
      logger.info({ tipoDoc, operacion, count: docs.length }, 'Detalle caught via response interceptor')
      return docs
    }

    logger.warn({ tipoDoc, operacion }, 'All detalle methods failed, falling back to UI clicks')
    return await fetchDetalleViaClicks(page, operacion, periodo, tipoDoc)
  } finally {
    await page.close()
  }
}

/**
 * Fallback: fetch detalles by clicking through the RCV UI.
 * Navigates to the correct section, selects period/document type, and
 * waits for the table data to load.
 */
async function fetchDetalleViaClicks(
  page: import('playwright').Page,
  operacion: 'COMPRA' | 'VENTA',
  periodo: string,
  tipoDoc: number,
): Promise<unknown[]> {
  logger.info({ operacion, periodo, tipoDoc }, 'Attempting detalle fetch via UI clicks')

  const detalleEndpoint = operacion === 'COMPRA' ? 'getDetalleCompra' : 'getDetalleVenta'

  // Set up response interceptor
  const captured: unknown[] = []
  page.on('response', async (response) => {
    if (response.url().includes(`facadeService/${detalleEndpoint}`)) {
      try {
        const json = await response.json()
        if (Array.isArray(json?.data)) captured.push(...json.data)
      } catch { /* ignore */ }
    }
  })

  try {
    // Click the compras or ventas tab
    const tabText = operacion === 'COMPRA' ? 'Compras' : 'Ventas'
    const tab = page.locator(`a:has-text("${tabText}"), button:has-text("${tabText}"), li:has-text("${tabText}")`).first()
    if (await tab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tab.click()
      await page.waitForTimeout(2000)
    }

    // Look for a document type row/link matching our tipoDoc and click it
    const tipoDocLink = page.locator(`tr:has-text("${tipoDoc}") a, td:has-text("${tipoDoc}")`).first()
    if (await tipoDocLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tipoDocLink.click()
      await page.waitForTimeout(5000) // Wait for data to load
    }

    logger.info({ operacion, tipoDoc, capturedCount: captured.length }, 'UI click detalle result')
    return captured
  } catch (err) {
    logger.warn({ err: (err as Error).message, operacion, tipoDoc }, 'UI click detalle failed')
    return []
  }
}

/**
 * Fetch RCV data (compras or ventas) for a specific period.
 * Uses direct API for resumen (no reCAPTCHA needed), then Angular UI
 * automation for detalles (requires valid reCAPTCHA token).
 */
async function fetchRCVData(
  session: SIISession,
  rutEmpresa: string,
  mes: number,
  year: number,
  tipo: 'compras' | 'ventas',
): Promise<SIIDocumento[]> {
  const rutParts = rutEmpresa.replace(/\./g, '').split('-')
  const rut = rutParts[0]
  const dv = rutParts[1]
  const operacion = tipo === 'compras' ? 'COMPRA' : 'VENTA'
  const periodo = `${year}${String(mes).padStart(2, '0')}`

  // Step 1: Get resumen via direct API (no reCAPTCHA needed)
  let resumen: any
  try {
    resumen = await callSIIApi(session, 'getResumen', {
      rutEmisor: rut,
      dvEmisor: dv,
      ptributario: periodo,
      estadoContab: 'REGISTRO',
      operacion,
      busquedaInicial: true,
    })
  } catch (err) {
    logger.warn({ err: (err as Error).message, periodo, operacion }, 'Failed to get RCV resumen')
    return []
  }

  const resumenData = Array.isArray(resumen?.data) ? resumen.data : []
  logger.info({ periodo, operacion, tiposDoc: resumenData.length, totalDocs: resumenData.reduce((s: number, r: any) => s + (r.rsmnTotDoc ?? 0), 0) }, 'RCV resumen fetched')

  if (resumenData.length === 0) return []

  // Step 2: For each document type, fetch detalles via Angular UI automation
  const allDocuments: SIIDocumento[] = []

  for (const rsm of resumenData) {
    const tipoDoc = rsm.rsmnTipoDocInteger
    const totalDocs = rsm.rsmnTotDoc ?? 0
    if (!tipoDoc || totalDocs === 0) continue

    try {
      const docs = await fetchDetalleViaUI(session, rut, dv, periodo, operacion, tipoDoc)

      for (const doc of docs) {
        const d = doc as Record<string, unknown>
        allDocuments.push({
          detTipoDoc: tipoDoc,
          detNroDoc: (d.detNroDoc ?? d.folio ?? 0) as number,
          detFchDoc: (d.detFchDoc ?? d.fechaEmision ?? '') as string,
          detRutDoc: d.detRutDoc ? `${d.detRutDoc}-${d.detDvDoc ?? ''}` : '',
          detRznSoc: (d.detRznSoc ?? d.razonSocial ?? '') as string,
          detMntNeto: (d.detMntNeto ?? 0) as number,
          detMntExe: (d.detMntExe ?? 0) as number,
          detMntIVA: (d.detMntIVA ?? 0) as number,
          detMntTotal: (d.detMntTotal ?? 0) as number,
          detMntIVANoRec: (d.detMntIVANoRec ?? 0) as number,
          estado: 'REGISTRO',
          ...d,
        })
      }

      logger.debug({ tipoDoc, count: docs.length, periodo }, 'Fetched RCV detalles')
    } catch (err) {
      logger.warn({ tipoDoc, periodo, err: (err as Error).message }, 'Failed to fetch RCV detalles for type')
    }
  }

  return allDocuments
}

// ---------------------------------------------------------------------------
// RCV → DTE matching & creation
// ---------------------------------------------------------------------------

/**
 * Match RCV detalles with existing DTEs and create missing ones.
 * - For ventas: matches documents WE emitted (already in dte_documents)
 * - For compras: creates DTEs for documents RECEIVED (usually missing)
 * DTEs created from RCV get estado='aceptado' since SII already confirmed them.
 */
async function matchAndCreateDTEs(
  companyId: number,
  registroId: number,
  documents: SIIDocumento[],
  tipo: 'compras' | 'ventas',
): Promise<{ matched: number; created: number }> {
  if (documents.length === 0) return { matched: 0, created: 0 }

  let matched = 0
  let created = 0

  // Get all detalles we just inserted for this registro
  const detalles = await db.select({ id: rcvDetalles.id, tipo_dte: rcvDetalles.tipo_dte, folio: rcvDetalles.folio })
    .from(rcvDetalles)
    .where(eq(rcvDetalles.rcv_id, registroId))

  // Build a lookup map: "tipoDte-folio" → detalleId
  const detalleMap = new Map<string, number>()
  for (const d of detalles) {
    detalleMap.set(`${d.tipo_dte}-${d.folio}`, d.id)
  }

  // Get existing DTEs for this company that could match (by tipo_dte + folio)
  const folios = documents.map(d => d.detNroDoc ?? 0).filter(f => f > 0)
  const tiposDte = [...new Set(documents.map(d => d.detTipoDoc ?? 0).filter(t => t > 0))]

  if (folios.length === 0 || tiposDte.length === 0) return { matched: 0, created: 0 }

  const existingDTEs = await db.select({
    id: dteDocuments.id,
    tipo_dte: dteDocuments.tipo_dte,
    folio: dteDocuments.folio,
  })
    .from(dteDocuments)
    .where(and(
      eq(dteDocuments.company_id, companyId),
      inArray(dteDocuments.tipo_dte, tiposDte),
    ))

  // Build lookup: "tipoDte-folio" → dteId
  const existingMap = new Map<string, number>()
  for (const dte of existingDTEs) {
    if (dte.folio) existingMap.set(`${dte.tipo_dte}-${dte.folio}`, dte.id)
  }

  // Process each document: match or create
  for (const doc of documents) {
    const tipoDte = doc.detTipoDoc ?? 0
    const folio = doc.detNroDoc ?? 0
    if (tipoDte === 0 || folio === 0) continue

    const key = `${tipoDte}-${folio}`
    const detalleId = detalleMap.get(key)
    const existingDteId = existingMap.get(key)

    if (existingDteId) {
      // Match: link rcv_detalle → existing DTE
      matched++
      if (detalleId) {
        await db.update(rcvDetalles)
          .set({ dte_document_id: existingDteId })
          .where(eq(rcvDetalles.id, detalleId))
      }
    } else {
      // Create missing DTE from RCV data
      try {
        const rutContraparte = doc.detRutDoc ?? ''
        const razonSocial = doc.detRznSoc ?? rutContraparte
        const neto = doc.detMntNeto ?? 0
        const exento = doc.detMntExe ?? 0
        const iva = doc.detMntIVA ?? 0
        const total = doc.detMntTotal ?? (neto + exento + iva)

        const [newDte] = await db.insert(dteDocuments).values({
          company_id: companyId,
          tipo_dte: tipoDte,
          folio,
          estado: 'aceptado', // SII already confirmed this document
          rut_receptor: rutContraparte,
          razon_social_receptor: razonSocial || 'Sin razon social',
          monto_neto: neto,
          monto_exento: exento,
          monto_iva: iva,
          monto_total: total,
          fecha_emision: doc.detFchDoc ?? '',
          observaciones: `Importado desde RCV SII (${tipo})`,
        }).onConflictDoNothing() // Skip if company_id+tipo_dte+folio already exists
          .returning({ id: dteDocuments.id })

        if (newDte) {
          created++
          // Link rcv_detalle → new DTE
          if (detalleId) {
            await db.update(rcvDetalles)
              .set({ dte_document_id: newDte.id })
              .where(eq(rcvDetalles.id, detalleId))
          }
          // Also add to existingMap to avoid duplicates within same batch
          existingMap.set(key, newDte.id)
        }
      } catch (err) {
        // Non-critical: log and continue with next document
        logger.warn({ tipoDte, folio, err: (err as Error).message }, 'Failed to create DTE from RCV')
      }
    }
  }

  logger.info({ companyId, registroId, tipo, matched, created }, 'RCV→DTE matching completed')
  return { matched, created }
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

/**
 * Sync RCV for a specific company + period + type.
 * This function never throws — returns a result object.
 */
export async function syncRCV(opts: RCVSyncOptions & { session?: SIISession }): Promise<RCVSyncResult> {
  const { companyId, mes, year, tipo, session: externalSession } = opts
  let session: SIISession | null = null
  const ownsSession = !externalSession // We only close sessions we create

  try {
    // 1. Get company credentials
    const [company] = await db.select().from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)

    if (!company) {
      return { success: false, totalRegistros: 0, totalNeto: 0, totalIva: 0, totalExento: 0, dtesMatched: 0, dtesCreated: 0, error: 'Company not found' }
    }

    if (!company.sii_user || !company.sii_password_enc) {
      return { success: false, totalRegistros: 0, totalNeto: 0, totalIva: 0, totalExento: 0, dtesMatched: 0, dtesCreated: 0, error: 'SII credentials not configured' }
    }

    // 2. Authenticate with SII (or reuse existing session)
    if (externalSession) {
      session = externalSession
    } else {
      const siiPassword = decrypt(company.sii_password_enc)
      session = await createSIISession(company.rut, company.sii_user, siiPassword)
    }

    // 3. Fetch RCV data
    const documents = await fetchRCVData(session, company.rut, mes, year, tipo)

    logger.info({ companyId, mes, year, tipo, documentCount: documents.length }, 'RCV data fetched from SII')

    // 4. Upsert rcv_registro
    const totals = documents.reduce<{ neto: number; iva: number; exento: number }>((acc, doc) => ({
      neto: acc.neto + (doc.detMntNeto ?? 0),
      iva: acc.iva + (doc.detMntIVA ?? 0),
      exento: acc.exento + (doc.detMntExe ?? 0),
    }), { neto: 0, iva: 0, exento: 0 })

    // Check if registro already exists
    const [existing] = await db.select().from(rcvRegistros)
      .where(and(
        eq(rcvRegistros.company_id, companyId),
        eq(rcvRegistros.tipo, tipo),
        eq(rcvRegistros.year, year),
        eq(rcvRegistros.mes, mes),
      ))
      .limit(1)

    let registroId: number

    if (existing) {
      // Update existing
      await db.update(rcvRegistros)
        .set({
          total_neto: totals.neto,
          total_iva: totals.iva,
          total_exento: totals.exento,
          total_registros: documents.length,
          sync_status: 'sincronizado',
          sync_date: new Date(),
          sync_error: null,
          updated_at: new Date(),
        })
        .where(eq(rcvRegistros.id, existing.id))

      // Delete old detalles and re-insert
      await db.delete(rcvDetalles).where(eq(rcvDetalles.rcv_id, existing.id))
      registroId = existing.id
    } else {
      // Insert new
      const [newReg] = await db.insert(rcvRegistros).values({
        company_id: companyId,
        tipo,
        mes,
        year,
        total_neto: totals.neto,
        total_iva: totals.iva,
        total_exento: totals.exento,
        total_registros: documents.length,
        sync_status: 'sincronizado',
        sync_date: new Date(),
      }).returning({ id: rcvRegistros.id })
      registroId = newReg.id
    }

    // 5. Insert detalles
    if (documents.length > 0) {
      const detailRows = documents.map((doc) => ({
        rcv_id: registroId,
        company_id: companyId,
        tipo_dte: doc.detTipoDoc ?? 0,
        folio: doc.detNroDoc ?? 0,
        fecha_emision: doc.detFchDoc ?? '',
        rut_contraparte: doc.detRutDoc ?? '',
        razon_social: doc.detRznSoc ?? null,
        neto: doc.detMntNeto ?? 0,
        exento: doc.detMntExe ?? 0,
        iva: doc.detMntIVA ?? 0,
        total: doc.detMntTotal ?? 0,
        iva_no_recuperable: doc.detMntIVANoRec ?? 0,
        estado_rcv: doc.estado ?? 'REGISTRO',
        detalle_json: doc as Record<string, unknown>,
      }))

      // Insert in batches of 100
      for (let i = 0; i < detailRows.length; i += 100) {
        const batch = detailRows.slice(i, i + 100)
        await db.insert(rcvDetalles).values(batch)
      }
    }

    // 6. Match RCV detalles with existing DTEs + create missing ones
    const { matched, created } = await matchAndCreateDTEs(companyId, registroId, documents, tipo)

    // 7. Update company last sync timestamp
    await db.update(companies)
      .set({ sii_rcv_last_sync: new Date() })
      .where(eq(companies.id, companyId))

    logger.info({
      companyId, mes, year, tipo, registroId,
      totalRegistros: documents.length,
      totalNeto: totals.neto,
      totalIva: totals.iva,
      dtesMatched: matched,
      dtesCreated: created,
    }, 'RCV sync completed')

    return {
      success: true,
      registroId,
      totalRegistros: documents.length,
      totalNeto: totals.neto,
      totalIva: totals.iva,
      totalExento: totals.exento,
      dtesMatched: matched,
      dtesCreated: created,
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error({ error, ...opts }, 'RCV sync failed')

    // Update registro with error status if it exists
    try {
      const [existing] = await db.select().from(rcvRegistros)
        .where(and(
          eq(rcvRegistros.company_id, companyId),
          eq(rcvRegistros.tipo, tipo),
          eq(rcvRegistros.year, year),
          eq(rcvRegistros.mes, mes),
        ))
        .limit(1)

      if (existing) {
        await db.update(rcvRegistros)
          .set({ sync_status: 'error', sync_error: message, updated_at: new Date() })
          .where(eq(rcvRegistros.id, existing.id))
      }
    } catch {
      // Ignore DB errors during error handling
    }

    return {
      success: false,
      totalRegistros: 0,
      totalNeto: 0,
      totalIva: 0,
      totalExento: 0,
      dtesMatched: 0,
      dtesCreated: 0,
      error: message,
    }
  } finally {
    // Always close the browser if we own the session
    if (session && ownsSession) {
      await closeSIISession(session)
    }
  }
}

/**
 * Sync both compras and ventas for a company + period.
 */
export async function syncRCVFull(companyId: number, mes: number, year: number): Promise<{
  compras: RCVSyncResult
  ventas: RCVSyncResult
}> {
  // Create a single browser session and reuse it for both compras + ventas
  const [company] = await db.select().from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)

  if (!company?.sii_user || !company?.sii_password_enc) {
    const errResult: RCVSyncResult = {
      success: false, totalRegistros: 0, totalNeto: 0, totalIva: 0,
      totalExento: 0, dtesMatched: 0, dtesCreated: 0,
      error: 'SII credentials not configured',
    }
    return { compras: errResult, ventas: errResult }
  }

  let session: SIISession | null = null
  try {
    const siiPassword = decrypt(company.sii_password_enc)
    session = await createSIISession(company.rut, company.sii_user, siiPassword)

    const compras = await syncRCV({ companyId, mes, year, tipo: 'compras', session })
    const ventas = await syncRCV({ companyId, mes, year, tipo: 'ventas', session })
    return { compras, ventas }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const errResult: RCVSyncResult = {
      success: false, totalRegistros: 0, totalNeto: 0, totalIva: 0,
      totalExento: 0, dtesMatched: 0, dtesCreated: 0, error: message,
    }
    return { compras: errResult, ventas: errResult }
  } finally {
    if (session) await closeSIISession(session)
  }
}
