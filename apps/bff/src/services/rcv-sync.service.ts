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
 *
 * The SII RCV Angular app at https://www4.sii.cl/consdcvinternetui/
 * calls backend APIs that return JSON. We call those APIs directly.
 */

import axios from 'axios'
import type { AxiosInstance } from 'axios'
import { wrapper } from 'axios-cookiejar-support'
import { CookieJar } from 'tough-cookie'
import { eq, and } from 'drizzle-orm'
import { db } from '@/db/client'
import { companies, rcvRegistros, rcvDetalles } from '@/db/schema'
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
// SII Auth + API Client
// ---------------------------------------------------------------------------

const SII_AUTH_URL = 'https://zeusr.sii.cl/cgi_AUT2000/CAutInClient.cgi'
const SII_RCV_BASE = 'https://www4.sii.cl/consdcvinternetui/services'

/**
 * Create an authenticated SII session.
 * Returns an axios instance with SII session cookies.
 */
async function createSIISession(rutEmpresa: string, siiUser: string, siiPassword: string): Promise<AxiosInstance> {
  const jar = new CookieJar()
  const wrappedAxios = wrapper(axios as any)
  const client: AxiosInstance = wrappedAxios.create({
    withCredentials: true,
    timeout: 30_000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json, text/html, */*',
      'Accept-Language': 'es-CL,es;q=0.9',
    },
    maxRedirects: 10,
    jar,
  } as any)

  // Step 1: Authenticate with SII
  const loginParams = new URLSearchParams({
    rut: siiUser.split('-')[0].replace(/\./g, ''),
    dv: siiUser.split('-')[1] || '',
    referencia: 'https://www4.sii.cl/consdcvinternetui/',
    411: '',
    rutcntr: siiUser.split('-')[0].replace(/\./g, ''),
    dvcntr: siiUser.split('-')[1] || '',
    cession: siiPassword,
  })

  logger.info({ siiUser, rutEmpresa }, 'Authenticating with SII for RCV sync')

  const authResponse = await client.post(SII_AUTH_URL, loginParams.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    maxRedirects: 10,
    validateStatus: (s) => s < 500, // Accept redirects
  })

  // Check if login was successful by looking for error indicators
  const responseText = typeof authResponse.data === 'string' ? authResponse.data : ''
  if (responseText.includes('Clave Tributaria incorrecta') || responseText.includes('ERR_AUTENTICACION')) {
    throw new Error('SII authentication failed: invalid credentials')
  }

  logger.info('SII authentication successful')
  return client as AxiosInstance
}

export { createSIISession }

/**
 * Fetch RCV data from the SII API.
 * The SII RCV API returns JSON with purchase/sale documents.
 */
async function fetchRCVData(
  client: AxiosInstance,
  rutEmpresa: string,
  mes: number,
  year: number,
  tipo: 'compras' | 'ventas',
): Promise<SIIDocumento[]> {
  // Clean RUT for API: "76673985-7" → "76673985" and "7"
  const rutParts = rutEmpresa.replace(/\./g, '').split('-')
  const rut = rutParts[0]
  const dv = rutParts[1]

  // SII RCV API endpoint
  // operacion: COMPRA or VENTA
  // estado: REGISTRO (registered), PENDIENTE, RECLAMADO, etc.
  const operacion = tipo === 'compras' ? 'COMPRA' : 'VENTA'
  const periodo = `${year}${String(mes).padStart(2, '0')}`

  const allDocuments: SIIDocumento[] = []

  // Fetch from the RCV consultation API
  // The SII API returns paginated results for different DTE types
  const dteTypes = tipo === 'compras'
    ? [30, 33, 34, 43, 46, 56, 61] // Facturas compra, factura, exenta, etc.
    : [33, 34, 39, 41, 56, 61, 110] // Facturas venta, boletas, NC, ND, etc.

  for (const tipoDoc of dteTypes) {
    try {
      const url = `${SII_RCV_BASE}/data/facadeService/getDetalleRegistroCompraVenta`
      const response = await client.get(url, {
        params: {
          rut,
          dv,
          ptributario: periodo,
          operacion,
          codTipoDoc: tipoDoc,
          estado: 'REGISTRO',
          pagina: 1,
          tamanioPagina: 1000,
        },
        headers: {
          'Accept': 'application/json',
          'Referer': 'https://www4.sii.cl/consdcvinternetui/',
        },
      })

      if (response.data?.data) {
        const docs = Array.isArray(response.data.data)
          ? response.data.data
          : []
        allDocuments.push(...docs)
        logger.debug({ tipoDoc, count: docs.length, periodo }, 'Fetched RCV documents')
      }
    } catch (err) {
      // Some DTE types may not exist for the period — non-critical
      logger.debug({ tipoDoc, periodo, err: (err as Error).message }, 'No RCV data for DTE type')
    }
  }

  // Also try the resumen endpoint for totals validation
  try {
    const resumenUrl = `${SII_RCV_BASE}/data/facadeService/getResumenRegistroCompraVenta`
    const resumen = await client.get(resumenUrl, {
      params: { rut, dv, ptributario: periodo, operacion },
      headers: { 'Accept': 'application/json', 'Referer': 'https://www4.sii.cl/consdcvinternetui/' },
    })
    if (resumen.data) {
      logger.info({ periodo, operacion, resumen: resumen.data }, 'RCV resumen from SII')
    }
  } catch {
    // Non-critical
  }

  return allDocuments
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

/**
 * Sync RCV for a specific company + period + type.
 * This function never throws — returns a result object.
 */
export async function syncRCV(opts: RCVSyncOptions): Promise<RCVSyncResult> {
  const { companyId, mes, year, tipo } = opts

  try {
    // 1. Get company credentials
    const [company] = await db.select().from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)

    if (!company) {
      return { success: false, totalRegistros: 0, totalNeto: 0, totalIva: 0, totalExento: 0, error: 'Company not found' }
    }

    if (!company.sii_user || !company.sii_password_enc) {
      return { success: false, totalRegistros: 0, totalNeto: 0, totalIva: 0, totalExento: 0, error: 'SII credentials not configured' }
    }

    const siiPassword = decrypt(company.sii_password_enc)

    // 2. Authenticate with SII
    const siiClient = await createSIISession(company.rut, company.sii_user, siiPassword)

    // 3. Fetch RCV data
    const documents = await fetchRCVData(siiClient, company.rut, mes, year, tipo)

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

    // 6. Update company last sync timestamp
    await db.update(companies)
      .set({ sii_rcv_last_sync: new Date() })
      .where(eq(companies.id, companyId))

    logger.info({
      companyId, mes, year, tipo, registroId,
      totalRegistros: documents.length,
      totalNeto: totals.neto,
      totalIva: totals.iva,
    }, 'RCV sync completed')

    return {
      success: true,
      registroId,
      totalRegistros: documents.length,
      totalNeto: totals.neto,
      totalIva: totals.iva,
      totalExento: totals.exento,
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
      error: message,
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
  const compras = await syncRCV({ companyId, mes, year, tipo: 'compras' })
  const ventas = await syncRCV({ companyId, mes, year, tipo: 'ventas' })
  return { compras, ventas }
}
