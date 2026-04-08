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

import axios from 'axios'
import type { AxiosInstance } from 'axios'
import { wrapper } from 'axios-cookiejar-support'
import { CookieJar } from 'tough-cookie'
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
export async function syncRCV(opts: RCVSyncOptions): Promise<RCVSyncResult> {
  const { companyId, mes, year, tipo } = opts

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
