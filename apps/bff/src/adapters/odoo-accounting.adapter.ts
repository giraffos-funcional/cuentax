/**
 * CUENTAX — Odoo Accounting Adapter
 * ===================================
 * Cliente JSON-RPC para Odoo 18 contabilidad.
 * Autentica con una service account (admin) de forma lazy y cachea el uid.
 * En caso de error, retorna arrays vacíos / valores por defecto — nunca lanza.
 */

import axios from 'axios'
import { config } from '@/core/config'
import { logger } from '@/core/logger'
import { getRequestId } from '@/core/request-context'
import { CircuitBreaker } from '@/core/circuit-breaker'

const odooAccountingCircuit = new CircuitBreaker({
  name: 'odoo-accounting',
  failureThreshold: 5,
  resetTimeout: 30_000,
})

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface CreateInvoiceData {
  move_type: 'out_invoice' | 'out_refund' | 'in_invoice' | 'in_refund'
  partner_id: number
  invoice_date: string // YYYY-MM-DD
  company_id: number
  l10n_latam_document_number: string // folio DTE
  observaciones?: string
  items: Array<{
    product_id: number
    name: string
    quantity: number
    price_unit: number
    tax_ids: number[]
  }>
}

export interface InvoiceFilters {
  desde: string        // YYYY-MM-DD
  hasta: string        // YYYY-MM-DD
  move_type?: string
  state?: string
  page?: number
  limit?: number
}

export interface OdooInvoice {
  id: number
  name: string
  move_type: string
  partner_id: { id: number; name: string }
  invoice_date: string
  amount_untaxed: number
  amount_tax: number
  amount_total: number
  state: string
  l10n_latam_document_number: string
}

export interface LCVRecord {
  folio: string
  tipo_dte: string
  fecha: string
  rut_receptor: string
  razon_social_receptor: string
  neto: number
  iva: number
  total: number
}

export interface F29Data {
  ventas_neto: number
  debito_fiscal: number
  credito_fiscal: number
  ppm: number
  total_a_pagar: number
}

export interface MonthlyStats {
  total_emitidos: number
  total_aceptados: number
  por_tipo: Record<string, { count: number; total: number }>
}

export interface PartnerData {
  name: string
  vat: string           // RUT
  street?: string
  city?: string
  email?: string
  phone?: string
  is_company?: boolean
  supplier_rank?: number
  customer_rank?: number
}

export interface ProductData {
  name: string
  default_code: string
  list_price: number
  taxes_id?: number[]
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface AuthSession {
  uid: number
  password: string
  db: string
}

interface RpcResponse<T = unknown> {
  jsonrpc: string
  id: number
  result?: T
  error?: { code: number; message: string; data?: unknown }
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class OdooAccountingAdapter {
  private readonly rpcUrl: string
  private readonly webUrl: string
  private readonly adminUser: string
  private readonly adminPassword: string
  private uid: number | null = null
  private webSessionId: string | null = null
  private password: string = ''

  constructor() {
    this.rpcUrl = `${config.ODOO_URL}/jsonrpc`
    this.webUrl = config.ODOO_URL
    // Service account credentials — sourced from env, not from config constants
    // (will be wired up in .env later; fall back to empty strings so startup never crashes)
    this.adminUser = process.env['ODOO_ADMIN_USER'] ?? ''
    this.adminPassword = process.env['ODOO_ADMIN_PASSWORD'] ?? ''
  }

  /** Build headers with correlation ID for distributed tracing */
  private get correlationHeaders(): Record<string, string> {
    const requestId = getRequestId()
    return requestId !== 'unknown' ? { 'X-Request-ID': requestId } : {}
  }

  // -------------------------------------------------------------------------
  // Auth — lazy, cached
  // -------------------------------------------------------------------------

  /**
   * Autentica como service account contra Odoo.
   * El uid se cachea; en caso de error retorna null en lugar de lanzar.
   */
  private async ensureAuth(): Promise<AuthSession | null> {
    if (this.uid !== null) {
      return { uid: this.uid, password: this.password, db: config.ODOO_DB }
    }

    try {
      const response = await axios.post<RpcResponse<number>>(
        this.rpcUrl,
        {
          jsonrpc: '2.0',
          method: 'call',
          id: 1,
          params: {
            service: 'common',
            method: 'authenticate',
            args: [config.ODOO_DB, this.adminUser, this.adminPassword, {}],
          },
        },
        { timeout: 15_000, headers: this.correlationHeaders },
      )

      const uid = response.data?.result
      if (!uid || typeof uid !== 'number') {
        logger.warn({ adminUser: this.adminUser }, 'Odoo service account auth failed')
        return null
      }

      this.uid = uid
      this.password = this.adminPassword
      logger.info({ uid }, 'Odoo service account authenticated')
      return { uid: this.uid, password: this.password, db: config.ODOO_DB }
    } catch (error) {
      logger.error({ error }, 'Odoo service account authentication error')
      return null
    }
  }

  // -------------------------------------------------------------------------
  // Web session auth — for endpoints that need context (ir.rule aware)
  // -------------------------------------------------------------------------

  private async ensureWebSession(): Promise<string | null> {
    if (this.webSessionId) return this.webSessionId

    try {
      const response = await axios.post<RpcResponse<{ session_id: string; uid: number }>>(
        `${this.webUrl}/web/session/authenticate`,
        {
          jsonrpc: '2.0',
          id: Date.now(),
          params: {
            db: config.ODOO_DB,
            login: this.adminUser,
            password: this.adminPassword,
          },
        },
        { timeout: 15_000, headers: this.correlationHeaders },
      )

      const result = response.data?.result
      const sessionCookie = response.headers['set-cookie']?.find((c: string) => c.startsWith('session_id='))
      const sessionId = sessionCookie?.split(';')[0]?.split('=')[1]

      if (!result?.uid || !sessionId) {
        logger.warn('Odoo web session auth failed')
        return null
      }

      this.webSessionId = sessionId
      logger.info({ uid: result.uid }, 'Odoo web session authenticated')
      return this.webSessionId
    } catch (error) {
      logger.error({ error }, 'Odoo web session auth error')
      return null
    }
  }

  /**
   * Call via /web/dataset/call_kw — processes context for ir.rules.
   * Use this for queries that need allowed_company_ids or other context.
   */
  private async webCallKw(
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {},
  ): Promise<unknown> {
    const sessionId = await this.ensureWebSession()
    if (!sessionId) {
      // Fall back to regular RPC without context
      const { context: _ctx, ...restKwargs } = kwargs
      return this.rpcCall(model, method, args, restKwargs)
    }

    try {
      const response = await axios.post<RpcResponse>(
        `${this.webUrl}/web/dataset/call_kw/${model}/${method}`,
        {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'call',
          params: {
            model,
            method,
            args,
            kwargs,
          },
        },
        {
          timeout: 15_000,
          headers: {
            ...this.correlationHeaders,
            Cookie: `session_id=${sessionId}`,
            'Content-Type': 'application/json',
          },
        },
      )

      if (response.data?.error) {
        logger.error(
          { model, method, rpcError: response.data.error, reqId: getRequestId() },
          'Odoo web call_kw returned error',
        )
        // Invalidate session on auth errors
        if (response.data.error.code === 100) this.webSessionId = null
        return null
      }

      return response.data?.result ?? null
    } catch (error) {
      logger.error({ error, model, method, reqId: getRequestId() }, 'Odoo web call_kw failed')
      this.webSessionId = null
      return null
    }
  }

  // -------------------------------------------------------------------------
  // Generic JSON-RPC helpers
  // -------------------------------------------------------------------------

  /**
   * Llama a execute_kw en Odoo.
   * Retorna el result o null si ocurre cualquier error.
   */
  private async rpcCall(
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {},
  ): Promise<unknown> {
    const session = await this.ensureAuth()
    if (!session) return null

    try {
      const response = await odooAccountingCircuit.execute(() =>
        axios.post<RpcResponse>(
          this.rpcUrl,
          {
            jsonrpc: '2.0',
            method: 'call',
            id: Date.now(),
            params: {
              service: 'object',
              method: 'execute_kw',
              args: [session.db, session.uid, session.password, model, method, args, kwargs],
            },
          },
          { timeout: 15_000, headers: this.correlationHeaders },
        ),
      )

      if (response.data?.error) {
        logger.error(
          { model, method, rpcError: response.data.error, reqId: getRequestId() },
          'Odoo RPC returned error',
        )
        return null
      }

      return response.data?.result ?? null
    } catch (error) {
      logger.error({ error, model, method, reqId: getRequestId() }, 'Odoo RPC call failed')
      // Invalidate cached uid so next call re-authenticates
      this.uid = null
      return null
    }
  }

  async searchRead(
    model: string,
    domain: unknown[][],
    fields: string[],
    opts: { limit?: number; offset?: number; order?: string; context?: Record<string, unknown> } = {},
  ): Promise<unknown[]> {
    // If context is provided, use web-style call_kw which processes context for ir.rules
    if (opts.context) {
      const result = await this.webCallKw(model, 'search_read', [domain], {
        fields,
        limit: opts.limit ?? 100,
        offset: opts.offset ?? 0,
        ...(opts.order ? { order: opts.order } : {}),
        context: opts.context,
      })
      return Array.isArray(result) ? result : []
    }

    const result = await this.rpcCall(model, 'search_read', [domain], {
      fields,
      limit: opts.limit ?? 100,
      offset: opts.offset ?? 0,
      ...(opts.order ? { order: opts.order } : {}),
    })
    return Array.isArray(result) ? result : []
  }

  async create(model: string, values: Record<string, unknown>): Promise<number> {
    const result = await this.rpcCall(model, 'create', [values])
    return typeof result === 'number' ? result : 0
  }

  async createBatch(model: string, valuesList: Record<string, unknown>[]): Promise<number[]> {
    if (valuesList.length === 0) return []
    const result = await this.rpcCall(model, 'create', [valuesList])
    return Array.isArray(result) ? (result as number[]) : []
  }

  async write(
    model: string,
    ids: number[],
    values: Record<string, unknown>,
    context?: Record<string, unknown>,
  ): Promise<boolean> {
    const kwargs = context ? { context } : {}
    const result = await this.rpcCall(model, 'write', [ids, values], kwargs)
    return result === true
  }

  async unlink(model: string, ids: number[]): Promise<boolean> {
    const result = await this.rpcCall(model, 'unlink', [ids])
    return result === true
  }

  /**
   * Generic method call on a model (e.g. action_approve, compute_sheet).
   * Calls execute_kw with the given method name on the provided record IDs.
   */
  async callMethod(
    model: string,
    method: string,
    ids: number[],
    args: unknown[] = [],
    kwargs: Record<string, unknown> = {},
  ): Promise<unknown> {
    return this.rpcCall(model, method, [ids, ...args], kwargs)
  }

  async search(
    model: string,
    domain: unknown[][],
    opts: { limit?: number; offset?: number; order?: string } = {},
  ): Promise<number[]> {
    const result = await this.rpcCall(model, 'search', [domain], {
      limit: opts.limit ?? 100,
      offset: opts.offset ?? 0,
      ...(opts.order ? { order: opts.order } : {}),
    })
    return Array.isArray(result) ? (result as number[]) : []
  }

  async read(
    model: string,
    ids: number[],
    fields: string[],
  ): Promise<unknown[]> {
    if (ids.length === 0) return []
    const result = await this.rpcCall(model, 'read', [ids, fields])
    return Array.isArray(result) ? result : []
  }

  async searchCount(model: string, domain: unknown[][]): Promise<number> {
    const result = await this.rpcCall(model, 'search_count', [domain])
    return typeof result === 'number' ? result : 0
  }

  async readGroup(
    model: string,
    domain: unknown[][],
    fields: string[],
    groupby: string[],
  ): Promise<unknown[]> {
    const result = await this.rpcCall(model, 'read_group', [domain, fields, groupby])
    return Array.isArray(result) ? result : []
  }

  // -------------------------------------------------------------------------
  // Accounting — Invoices
  // -------------------------------------------------------------------------

  /** Crea un borrador de factura/boleta en Odoo. Retorna el move id. */
  async createInvoice(data: CreateInvoiceData): Promise<number> {
    const invoiceLines = data.items.map((item) => [
      0,
      0,
      {
        product_id: item.product_id,
        name: item.name,
        quantity: item.quantity,
        price_unit: item.price_unit,
        tax_ids: [[6, 0, item.tax_ids]],
      },
    ])

    const values: Record<string, unknown> = {
      move_type: data.move_type,
      partner_id: data.partner_id,
      invoice_date: data.invoice_date,
      company_id: data.company_id,
      l10n_latam_document_number: data.l10n_latam_document_number,
      invoice_line_ids: invoiceLines,
    }

    if (data.observaciones) {
      values['narration'] = data.observaciones
    }

    const moveId = await this.create('account.move', values)

    if (!moveId) {
      logger.error({ data }, 'Failed to create invoice in Odoo')
      return 0
    }

    logger.info({ moveId, folio: data.l10n_latam_document_number }, 'Invoice created in Odoo')
    return moveId
  }

  /**
   * Confirma / publica una factura (draft → posted).
   * Equivalente a hacer click en "Confirmar" en Odoo.
   */
  async postInvoice(moveId: number): Promise<void> {
    const session = await this.ensureAuth()
    if (!session) return

    try {
      await odooAccountingCircuit.execute(() =>
        axios.post<RpcResponse>(
          this.rpcUrl,
          {
            jsonrpc: '2.0',
            method: 'call',
            id: Date.now(),
            params: {
              service: 'object',
              method: 'execute_kw',
              args: [
                session.db,
                session.uid,
                session.password,
                'account.move',
                'action_post',
                [[moveId]],
              ],
            },
          },
          { timeout: 15_000, headers: this.correlationHeaders },
        ),
      )

      logger.info({ moveId, reqId: getRequestId() }, 'Invoice posted in Odoo')
    } catch (error) {
      logger.error({ error, moveId }, 'Failed to post invoice in Odoo')
    }
  }

  /** Retorna facturas de una empresa con filtros opcionales. */
  async getInvoices(companyId: number, filters: InvoiceFilters): Promise<OdooInvoice[]> {
    const domain: unknown[][] = [
      ['company_id', '=', companyId],
      ['invoice_date', '>=', filters.desde],
      ['invoice_date', '<=', filters.hasta],
    ]

    if (filters.move_type) domain.push(['move_type', '=', filters.move_type])
    if (filters.state) domain.push(['state', '=', filters.state])

    const page = filters.page ?? 1
    const limit = filters.limit ?? 50
    const offset = (page - 1) * limit

    const rows = await this.searchRead(
      'account.move',
      domain,
      [
        'id',
        'name',
        'move_type',
        'partner_id',
        'invoice_date',
        'amount_untaxed',
        'amount_tax',
        'amount_total',
        'state',
        'l10n_latam_document_number',
      ],
      { limit, offset, order: 'invoice_date desc' },
    )

    return rows.map((r) => {
      const row = r as Record<string, unknown>
      const partner = Array.isArray(row['partner_id'])
        ? { id: row['partner_id'][0] as number, name: row['partner_id'][1] as string }
        : { id: 0, name: '' }

      return {
        id: row['id'] as number,
        name: (row['name'] as string) ?? '',
        move_type: (row['move_type'] as string) ?? '',
        partner_id: partner,
        invoice_date: (row['invoice_date'] as string) ?? '',
        amount_untaxed: (row['amount_untaxed'] as number) ?? 0,
        amount_tax: (row['amount_tax'] as number) ?? 0,
        amount_total: (row['amount_total'] as number) ?? 0,
        state: (row['state'] as string) ?? '',
        l10n_latam_document_number: (row['l10n_latam_document_number'] as string) ?? '',
      } satisfies OdooInvoice
    })
  }

  // -------------------------------------------------------------------------
  // Libros de Compra / Venta (LCV)
  // -------------------------------------------------------------------------

  /**
   * Retorna los registros del Libro de Compras o Ventas para un período.
   * Mapea campos de account.move al formato LCVRecord.
   */
  async getLCVData(
    companyId: number,
    year: number,
    month: number,
    tipo: 'ventas' | 'compras',
  ): Promise<LCVRecord[]> {
    const desde = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const hasta = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

    const moveTypes =
      tipo === 'ventas'
        ? ['out_invoice', 'out_refund']
        : ['in_invoice', 'in_refund']

    const domain: unknown[][] = [
      ['company_id', '=', companyId],
      ['state', '=', 'posted'],
      ['invoice_date', '>=', desde],
      ['invoice_date', '<=', hasta],
      ['move_type', 'in', moveTypes],
    ]

    const rows = await this.searchRead(
      'account.move',
      domain,
      [
        'l10n_latam_document_number',
        'l10n_latam_document_type_id',
        'invoice_date',
        'partner_id',
        'amount_untaxed',
        'amount_tax',
        'amount_total',
      ],
      { limit: 1000, order: 'invoice_date asc' },
    )

    return rows.map((r) => {
      const row = r as Record<string, unknown>
      const partner = Array.isArray(row['partner_id'])
        ? { id: row['partner_id'][0] as number, name: row['partner_id'][1] as string }
        : { id: 0, name: '' }

      const docType = Array.isArray(row['l10n_latam_document_type_id'])
        ? (row['l10n_latam_document_type_id'][1] as string)
        : ''

      return {
        folio: (row['l10n_latam_document_number'] as string) ?? '',
        tipo_dte: docType,
        fecha: (row['invoice_date'] as string) ?? '',
        rut_receptor: '',  // populated externally if needed; partner.vat requires extra read
        razon_social_receptor: partner.name,
        neto: (row['amount_untaxed'] as number) ?? 0,
        iva: (row['amount_tax'] as number) ?? 0,
        total: (row['amount_total'] as number) ?? 0,
      } satisfies LCVRecord
    })
  }

  // -------------------------------------------------------------------------
  // Formulario 29 (F29)
  // -------------------------------------------------------------------------

  /**
   * Calcula los datos básicos para el F29 chileno:
   * - Débito fiscal: suma de IVA en facturas de venta posted
   * - Crédito fiscal: suma de IVA en facturas de compra posted
   * - PPM: 1.5% sobre ventas neto
   */
  async getF29Data(companyId: number, year: number, month: number): Promise<F29Data> {
    const desde = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const hasta = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

    const baseDomain: unknown[][] = [
      ['company_id', '=', companyId],
      ['state', '=', 'posted'],
      ['invoice_date', '>=', desde],
      ['invoice_date', '<=', hasta],
    ]

    const [ventasRows, comprasRows] = await Promise.all([
      this.readGroup(
        'account.move',
        [...baseDomain, ['move_type', 'in', ['out_invoice', 'out_refund']]],
        ['amount_untaxed:sum', 'amount_tax:sum'],
        [],
      ),
      this.readGroup(
        'account.move',
        [...baseDomain, ['move_type', 'in', ['in_invoice', 'in_refund']]],
        ['amount_untaxed:sum', 'amount_tax:sum'],
        [],
      ),
    ])

    const ventaRow = (ventasRows[0] ?? {}) as Record<string, unknown>
    const compraRow = (comprasRows[0] ?? {}) as Record<string, unknown>

    const ventasNeto = (ventaRow['amount_untaxed'] as number) ?? 0
    const debitoFiscal = (ventaRow['amount_tax'] as number) ?? 0
    const creditoFiscal = (compraRow['amount_tax'] as number) ?? 0
    const ppm = Math.round(ventasNeto * 0.015 * 100) / 100
    const totalAPagar = debitoFiscal - creditoFiscal + ppm

    return {
      ventas_neto: ventasNeto,
      debito_fiscal: debitoFiscal,
      credito_fiscal: creditoFiscal,
      ppm,
      total_a_pagar: totalAPagar,
    }
  }

  // -------------------------------------------------------------------------
  // Estadísticas mensuales
  // -------------------------------------------------------------------------

  /** Retorna contadores y totales de documentos emitidos agrupados por estado. */
  async getMonthlyStats(
    companyId: number,
    year: number,
    month: number,
  ): Promise<MonthlyStats> {
    const desde = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const hasta = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

    const domain: unknown[][] = [
      ['company_id', '=', companyId],
      ['move_type', 'in', ['out_invoice', 'out_refund']],
      ['invoice_date', '>=', desde],
      ['invoice_date', '<=', hasta],
    ]

    const byStateRows = await this.readGroup(
      'account.move',
      domain,
      ['state', 'amount_total:sum'],
      ['state'],
    )

    const byTypeRows = await this.readGroup(
      'account.move',
      [...domain, ['state', '=', 'posted']],
      ['l10n_latam_document_type_id', 'amount_total:sum'],
      ['l10n_latam_document_type_id'],
    )

    let totalEmitidos = 0
    let totalAceptados = 0

    for (const r of byStateRows) {
      const row = r as Record<string, unknown>
      const count = (row['state_count'] as number) ?? (row['__count'] as number) ?? 0
      totalEmitidos += count
      if (row['state'] === 'posted') totalAceptados += count
    }

    const porTipo: Record<string, { count: number; total: number }> = {}

    for (const r of byTypeRows) {
      const row = r as Record<string, unknown>
      const docType = Array.isArray(row['l10n_latam_document_type_id'])
        ? (row['l10n_latam_document_type_id'][1] as string)
        : 'Sin tipo'
      const count = (row['__count'] as number) ?? 0
      const total = (row['amount_total'] as number) ?? 0
      porTipo[docType] = { count, total }
    }

    return { total_emitidos: totalEmitidos, total_aceptados: totalAceptados, por_tipo: porTipo }
  }

  // -------------------------------------------------------------------------
  // Partner sync
  // -------------------------------------------------------------------------

  /**
   * Busca un partner por RUT dentro de una empresa.
   * Si no existe, lo crea. Retorna el partner id.
   */
  async findOrCreatePartner(
    companyId: number,
    rut: string,
    data: PartnerData,
  ): Promise<number> {
    const existing = await this.searchRead(
      'res.partner',
      [
        ['vat', '=', rut],
        ['company_id', 'in', [companyId, false]],
      ],
      ['id'],
      { limit: 1 },
    )

    if (existing.length > 0) {
      const row = existing[0] as Record<string, unknown>
      return row['id'] as number
    }

    const values: Record<string, unknown> = {
      name: data.name,
      vat: data.vat,
      company_id: companyId,
      is_company: data.is_company ?? true,
    }

    if (data.street) values['street'] = data.street
    if (data.city) values['city'] = data.city
    if (data.email) values['email'] = data.email
    if (data.phone) values['phone'] = data.phone
    if (data.supplier_rank !== undefined) values['supplier_rank'] = data.supplier_rank
    if (data.customer_rank !== undefined) values['customer_rank'] = data.customer_rank

    const partnerId = await this.create('res.partner', values)

    if (!partnerId) {
      logger.error({ rut, companyId }, 'Failed to create partner in Odoo')
      return 0
    }

    logger.info({ partnerId, rut, companyId }, 'Partner created in Odoo')
    return partnerId
  }

  // -------------------------------------------------------------------------
  // Product sync
  // -------------------------------------------------------------------------

  /**
   * Busca un producto por código interno dentro de una empresa.
   * Si no existe, lo crea. Retorna el product id.
   */
  async findOrCreateProduct(
    companyId: number,
    codigo: string,
    data: ProductData,
  ): Promise<number> {
    const existing = await this.searchRead(
      'product.product',
      [
        ['default_code', '=', codigo],
        ['company_id', 'in', [companyId, false]],
      ],
      ['id'],
      { limit: 1 },
    )

    if (existing.length > 0) {
      const row = existing[0] as Record<string, unknown>
      return row['id'] as number
    }

    const values: Record<string, unknown> = {
      name: data.name,
      default_code: data.default_code,
      list_price: data.list_price,
      company_id: companyId,
    }

    if (data.taxes_id && data.taxes_id.length > 0) {
      values['taxes_id'] = [[6, 0, data.taxes_id]]
    }

    const productId = await this.create('product.product', values)

    if (!productId) {
      logger.error({ codigo, companyId }, 'Failed to create product in Odoo')
      return 0
    }

    logger.info({ productId, codigo, companyId }, 'Product created in Odoo')
    return productId
  }

  // -------------------------------------------------------------------------
  // Health check
  // -------------------------------------------------------------------------

  /** Verifica conectividad con Odoo (no requiere auth). */
  async ping(): Promise<boolean> {
    try {
      const res = await axios.post<RpcResponse>(
        this.rpcUrl,
        {
          jsonrpc: '2.0',
          method: 'call',
          id: 1,
          params: { service: 'common', method: 'version', args: [] },
        },
        { timeout: 15_000 },
      )
      return !!res.data?.result
    } catch {
      return false
    }
  }
}

export const odooAccountingAdapter = new OdooAccountingAdapter()
export { odooAccountingCircuit }
