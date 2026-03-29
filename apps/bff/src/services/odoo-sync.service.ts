/**
 * CUENTAX — Odoo Sync Service
 * ============================
 * Orchestrates synchronization between Cuentax and Odoo 18.
 * Keeps Odoo accounting data (account.move, res.partner, product.product)
 * in sync with DTE documents, contacts, and products managed in Cuentax.
 *
 * Design contract:
 * - syncDTEToOdoo is non-blocking: errors are logged but never thrown,
 *   because the DTE is already emitted and must not be rolled back.
 * - syncContactToOdoo and syncProductToOdoo return null on failure.
 */

import { odooAccountingAdapter } from '@/adapters/odoo-accounting.adapter'
import { dteRepository } from '@/repositories/dte.repository'
import { logger } from '@/core/logger'

// ── Types ──────────────────────────────────────────────────────

interface DTESyncInput {
  id: string
  company_id: number
  tipo_dte: number
  folio: number
  rut_receptor: string
  razon_social_receptor: string
  giro_receptor?: string
  email_receptor?: string
  items_json: unknown
  monto_neto?: number
  monto_iva?: number
  monto_total: number
  fecha_emision: string
  observaciones?: string
}

interface ContactSyncInput {
  rut: string
  razon_social: string
  giro?: string
  email?: string
  telefono?: string
  direccion?: string
  es_cliente?: boolean
  es_proveedor?: boolean
}

interface ProductSyncInput {
  codigo?: string
  nombre: string
  precio: number
  exento?: boolean
}

interface CompanyContext {
  company_id: number
  company_rut: string
}

// ── DTE item shape expected inside items_json ──────────────────

interface DTEItem {
  nombre: string
  cantidad: number
  precio_unitario: number
  [key: string]: unknown
}

// ── Service ────────────────────────────────────────────────────

class OdooSyncService {
  /**
   * Sync a DTE to Odoo as account.move after emission.
   * Called by dte.service.ts after a successful SII Bridge call.
   * Non-blocking: logs errors but never throws (DTE is already emitted).
   */
  async syncDTEToOdoo(dte: DTESyncInput, companyContext: CompanyContext): Promise<void> {
    try {
      logger.info(
        { dte_id: dte.id, folio: dte.folio, tipo_dte: dte.tipo_dte },
        'Starting Odoo DTE sync',
      )

      // 1. Ensure the partner exists (find or create by RUT)
      const partnerId = await odooAccountingAdapter.findOrCreatePartner(
        companyContext.company_id,
        dte.rut_receptor,
        {
          name: dte.razon_social_receptor,
          vat: dte.rut_receptor,
          street: '',
          email: dte.email_receptor ?? '',
          phone: '',
          is_company: true,
          customer_rank: 1,
          supplier_rank: 0,
        },
      )

      if (!partnerId) {
        logger.warn(
          { dte_id: dte.id, rut_receptor: dte.rut_receptor },
          'Odoo sync — could not resolve partner, aborting move creation',
        )
        return
      }

      // 2. Map tipo_dte to Odoo move_type
      const moveType = this.mapDTETipoToMoveType(dte.tipo_dte)

      // 3. Map items_json to Odoo invoice_line_ids format
      const invoiceLines = this.mapItemsToOdooLines(dte.items_json)

      // 4. Create the invoice (account.move in draft state)
      const moveId = await odooAccountingAdapter.createInvoice({
        move_type: moveType as 'out_invoice' | 'out_refund',
        partner_id: partnerId,
        invoice_date: dte.fecha_emision,
        company_id: companyContext.company_id,
        l10n_latam_document_number: String(dte.folio),
        observaciones: dte.observaciones,
        items: invoiceLines.map((line: any) => ({
          product_id: 0,
          name: line[2]?.name ?? '',
          quantity: line[2]?.quantity ?? 1,
          price_unit: line[2]?.price_unit ?? 0,
          tax_ids: [],
        })),
      })

      if (!moveId) {
        logger.warn({ dte_id: dte.id }, 'Odoo sync — createInvoice returned no move_id')
        return
      }

      // 5. Post (confirm) the invoice
      await odooAccountingAdapter.postInvoice(moveId)

      // 6. Persist odoo_move_id back to dte_documents
      await dteRepository.updateOdooMoveId(dte.id, moveId)

      logger.info(
        { dte_id: dte.id, folio: dte.folio, odoo_move_id: moveId },
        'Odoo DTE sync completed',
      )
    } catch (error) {
      // Non-blocking: DTE is already emitted — only log, never rethrow
      logger.error(
        { error, dte_id: dte.id, folio: dte.folio, tipo_dte: dte.tipo_dte },
        'Odoo DTE sync failed — DTE remains valid',
      )
    }
  }

  /**
   * Sync a contact to Odoo as res.partner.
   * Returns the odoo_partner_id, or null if the sync fails.
   */
  async syncContactToOdoo(contact: ContactSyncInput, companyId: number): Promise<number | null> {
    try {
      logger.info({ rut: contact.rut, companyId }, 'Syncing contact to Odoo')

      const partnerId = await odooAccountingAdapter.findOrCreatePartner(
        companyId,
        contact.rut,
        {
          name: contact.razon_social,
          vat: contact.rut,
          street: contact.direccion ?? '',
          email: contact.email ?? '',
          phone: contact.telefono ?? '',
          is_company: true,
          customer_rank: contact.es_cliente ? 1 : 0,
          supplier_rank: contact.es_proveedor ? 1 : 0,
        },
      )

      logger.info({ rut: contact.rut, partnerId }, 'Contact synced to Odoo')
      return partnerId
    } catch (error) {
      logger.error({ error, rut: contact.rut, companyId }, 'Odoo contact sync failed')
      return null
    }
  }

  /**
   * Sync a product to Odoo as product.product.
   * Returns the odoo_product_id, or null if the sync fails.
   */
  async syncProductToOdoo(product: ProductSyncInput, companyId: number): Promise<number | null> {
    try {
      logger.info({ nombre: product.nombre, companyId }, 'Syncing product to Odoo')

      // Resolve IVA 19% tax ID for non-exempt products
      let taxIds: number[] = []
      if (!product.exento) {
        try {
          const taxes = await odooAccountingAdapter.searchRead(
            'account.tax',
            [
              ['type_tax_use', '=', 'sale'],
              ['amount', '=', 19],
              ['company_id', 'in', [companyId, false]],
            ],
            ['id'],
            { limit: 1 },
          )
          if (taxes.length > 0) {
            taxIds = [(taxes[0] as any).id]
          }
        } catch (taxErr) {
          logger.warn({ taxErr }, 'Could not resolve IVA tax ID from Odoo')
        }
      }

      const productId = await odooAccountingAdapter.findOrCreateProduct(
        companyId,
        product.codigo ?? product.nombre,
        {
          name: product.nombre,
          default_code: product.codigo ?? '',
          list_price: product.precio,
          taxes_id: taxIds,
        },
      )

      logger.info({ nombre: product.nombre, productId }, 'Product synced to Odoo')
      return productId
    } catch (error) {
      logger.error({ error, nombre: product.nombre, companyId }, 'Odoo product sync failed')
      return null
    }
  }

  // ── Private helpers ────────────────────────────────────────

  /**
   * Maps a Chilean DTE tipo_dte code to the corresponding Odoo move_type.
   *
   * 33  Factura Afecta       → out_invoice
   * 39  Boleta Afecta        → out_invoice
   * 41  Boleta No Afecta     → out_invoice
   * 56  Nota Débito          → out_invoice
   * 61  Nota Crédito         → out_refund
   * 110 Factura Exportación  → out_invoice
   * 111 Nota Débito Export.  → out_invoice
   * 112 Nota Crédito Export. → out_refund
   * 113 Liquidación Export.  → out_invoice
   */
  private mapDTETipoToMoveType(tipoDte: number): string {
    const REFUND_TYPES = new Set([61, 112])
    return REFUND_TYPES.has(tipoDte) ? 'out_refund' : 'out_invoice'
  }

  /**
   * Parses items_json and maps each item to the Odoo invoice line command format:
   * [0, 0, { name, quantity, price_unit }]
   */
  private mapItemsToOdooLines(items: unknown): unknown[][] {
    if (!Array.isArray(items)) {
      logger.warn({ items }, 'mapItemsToOdooLines — items_json is not an array, returning empty')
      return []
    }

    return (items as DTEItem[]).map((item) => [
      0,
      0,
      {
        name: item.nombre ?? 'Producto sin nombre',
        quantity: item.cantidad ?? 1,
        price_unit: item.precio_unitario ?? 0,
      },
    ])
  }
}

export const odooSyncService = new OdooSyncService()
