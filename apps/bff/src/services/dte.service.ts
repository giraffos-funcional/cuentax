/**
 * CUENTAX — DTE Service (BFF)
 * ============================
 * Orquesta la emisión de DTEs desde el BFF:
 * 1. Enriquece con datos del emisor (desde Odoo/DB)
 * 2. Llama al SII Bridge para generar + firmar + enviar
 * 3. Persiste el resultado en DB (estado, track_id, folio)
 * 4. Dispara webhook si corresponde
 */

import { siiBridgeAdapter, type DTEPayload, type DTEResult } from '@/adapters/sii-bridge.adapter'
import { odooAuthAdapter } from '@/adapters/odoo-auth.adapter'
import { odooSyncService } from '@/services/odoo-sync.service'
import { logger } from '@/core/logger'
import { dteRepository } from '@/repositories/dte.repository'
import { db } from '@/db/client'
import { companies } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

// ── Validation Schemas ─────────────────────────────────────────
export const emitirDTESchema = z.object({
  tipo_dte: z.number().int().refine(n => [33,39,41,56,61,110,111,112,113].includes(n), {
    message: 'Tipo DTE no soportado. Válidos: 33,39,41,56,61,110-113',
  }),
  rut_receptor: z.string().min(9, 'RUT receptor inválido'),
  razon_social_receptor: z.string().min(3),
  giro_receptor: z.string().min(3),
  direccion_receptor: z.string().optional(),
  email_receptor: z.string().email().optional().or(z.literal('')),
  items: z.array(z.object({
    nombre: z.string().min(1),
    cantidad: z.number().positive(),
    precio_unitario: z.number().positive(),
    descuento_pct: z.number().min(0).max(100).default(0),
    exento: z.boolean().default(false),
    codigo: z.string().optional(),
    unidad: z.string().default('UN'),
  })).min(1, 'Debe tener al menos un ítem'),
  forma_pago: z.number().int().default(1),
  fecha_vencimiento: z.string().optional(),
  observaciones: z.string().max(256).optional(),
  // Para NC/ND — referencia al DTE original
  ref_tipo_doc: z.number().int().optional(),
  ref_folio: z.number().int().optional(),
  ref_fecha: z.string().optional(),
  ref_motivo: z.string().optional(),
})

export type EmitirDTEInput = z.infer<typeof emitirDTESchema>

export class DTEService {
  /**
   * Emite un DTE completo.
   * Recibe solo los datos del receptor + ítems.
   * Los datos del emisor se leen de la empresa activa.
   */
  async emitir(
    input: EmitirDTEInput,
    companyContext: { company_id: number, odoo_company_id?: number, company_rut: string, company_name: string },
  ): Promise<DTEResult & { db_id?: string }> {
    const odooCompanyId = companyContext.odoo_company_id ?? companyContext.company_id
    logger.info({ tipo_dte: input.tipo_dte, company_id: companyContext.company_id, odoo_company_id: odooCompanyId }, 'Iniciando emisión DTE')

    // 1. Obtener datos completos de la empresa emisora desde Odoo (uses Odoo ID)
    const emisorData = await this._getEmisorData(odooCompanyId)

    // 2. Construir payload para el SII Bridge
    const payload: DTEPayload = {
      tipo_dte: input.tipo_dte,
      // Emisor
      rut_emisor: companyContext.company_rut,
      razon_social_emisor: emisorData.razon_social,
      giro_emisor: emisorData.giro,
      direccion_emisor: emisorData.direccion,
      comuna_emisor: emisorData.comuna,
      actividad_economica: emisorData.actividad_economica,
      // Receptor
      rut_receptor: input.rut_receptor,
      razon_social_receptor: input.razon_social_receptor,
      giro_receptor: input.giro_receptor,
      direccion_receptor: input.direccion_receptor,
      email_receptor: input.email_receptor,
      // Documento
      items: input.items,
      forma_pago: input.forma_pago,
      fecha_vencimiento: input.fecha_vencimiento,
      observaciones: input.observaciones,
      // Referencia (NC/ND)
      ref_tipo_doc: input.ref_tipo_doc,
      ref_folio: input.ref_folio,
      ref_fecha: input.ref_fecha,
      ref_motivo: input.ref_motivo,
    }

    // 3. Llamar al SII Bridge
    const result = await siiBridgeAdapter.emitDTE(payload)

    // 4. Persistir en DB
    let dbId: string | undefined
    try {
      dbId = await dteRepository.save({
        company_id: companyContext.company_id,
        tipo_dte: input.tipo_dte,
        folio: result.folio,
        track_id: result.track_id,
        estado: result.estado,
        rut_receptor: input.rut_receptor,
        razon_social_receptor: input.razon_social_receptor,
        monto_total: this._calcTotal(input.items, input.tipo_dte),
        xml_firmado_b64: result.xml_firmado_b64,
      })
    } catch (dbErr) {
      logger.error({ dbErr }, 'Error persistiendo DTE — el DTE fue emitido pero no guardado en DB')
    }

    logger.info({
      folio: result.folio,
      track_id: result.track_id,
      estado: result.estado,
    }, 'DTE emitido')

    // 5. Sync to Odoo accounting (non-blocking) — uses Odoo company ID
    if (dbId && result.folio) {
      odooSyncService.syncDTEToOdoo({
        id: dbId,
        company_id: odooCompanyId,
        tipo_dte: input.tipo_dte,
        folio: result.folio,
        rut_receptor: input.rut_receptor,
        razon_social_receptor: input.razon_social_receptor,
        giro_receptor: input.giro_receptor,
        email_receptor: input.email_receptor,
        items_json: input.items,
        monto_total: this._calcTotal(input.items, input.tipo_dte),
        fecha_emision: input.items ? new Date().toISOString().slice(0, 10) : '',
        observaciones: input.observaciones,
      }, { company_id: odooCompanyId, company_rut: companyContext.company_rut }).catch(err => {
        logger.warn({ err, folio: result.folio }, 'Odoo sync failed — DTE was emitted successfully')
      })
    }

    return { ...result, db_id: dbId }
  }

  /** Consulta el estado de un DTE en el SII */
  async consultarEstado(trackId: string, companyRut: string) {
    const status = await siiBridgeAdapter.getDTEStatus(trackId, companyRut)

    // Actualizar en DB
    await dteRepository.updateEstado(trackId, status.estado)

    return status
  }

  /** Lista DTEs de una empresa con filtros */
  async listar(companyId: number, filters: {
    status?: string
    tipo_dte?: number
    desde?: string
    hasta?: string
    page?: number
    limit?: number
  }) {
    return dteRepository.findMany({ company_id: companyId, ...filters })
  }

  // ── Private helpers ────────────────────────────────────────
  /**
   * Reads emisor (issuer) data from the local companies table.
   * Looks up by odoo_company_id first, then falls back to local id.
   */
  private async _getEmisorData(companyId: number) {
    try {
      // Try by odoo_company_id first
      let [company] = await db.select().from(companies)
        .where(eq(companies.odoo_company_id, companyId)).limit(1)

      // Fallback: try by local id
      if (!company) {
        [company] = await db.select().from(companies)
          .where(eq(companies.id, companyId)).limit(1)
      }

      if (company) {
        logger.info({ companyId, razon_social: company.razon_social }, 'Emisor data loaded from DB')
        return {
          razon_social: company.razon_social,
          giro: company.giro ?? 'Servicios',
          direccion: company.direccion ?? '',
          comuna: company.comuna ?? '',
          ciudad: company.ciudad ?? 'Santiago',
          actividad_economica: company.actividad_economica ?? 620200,
        }
      }

      logger.warn({ companyId }, 'Company not found in DB for emisor data, using defaults')
      return {
        razon_social: 'Empresa sin configurar',
        giro: 'Servicios',
        direccion: '',
        comuna: '',
        ciudad: 'Santiago',
        actividad_economica: 620200,
      }
    } catch (err) {
      logger.error({ companyId, err }, 'Error reading emisor data from DB')
      return {
        razon_social: 'Empresa sin configurar',
        giro: 'Servicios',
        direccion: '',
        comuna: '',
        ciudad: 'Santiago',
        actividad_economica: 620200,
      }
    }
  }

  private _calcTotal(items: EmitirDTEInput['items'], tipo_dte: number): number {
    return items.reduce((sum, it) => {
      const bruto = it.cantidad * it.precio_unitario
      const desc  = bruto * ((it.descuento_pct ?? 0) / 100)
      const neto  = Math.round(bruto - desc)
      // Boleta (39): IVA incluido en precio
      if (it.exento || tipo_dte === 41) return sum + neto
      return tipo_dte === 39 ? sum + neto : sum + neto + Math.round(neto * 0.19)
    }, 0)
  }
}

export const dteService = new DTEService()
