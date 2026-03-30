/**
 * CUENTAX — SII Bridge Adapter (BFF → SII Bridge)
 * ================================================
 * Cliente HTTP que el BFF usa para comunicarse con el SII Bridge (FastAPI).
 * El BFF actúa como gateway: recibe del frontend, enriquece con datos de Odoo
 * y delega la operación SII al bridge.
 */

import axios, { AxiosInstance } from 'axios'
import https from 'node:https'
import FormData from 'form-data'
import { config } from '@/core/config'
import { logger } from '@/core/logger'
import { CircuitBreaker } from '@/core/circuit-breaker'
import { getRequestId } from '@/core/request-context'

// Internal HTTPS agent: skip cert verification for container-to-container communication via Traefik
const internalHttpsAgent = new https.Agent({ rejectUnauthorized: false })

const siiBridgeCircuit = new CircuitBreaker({
  name: 'sii-bridge',
  failureThreshold: 5,
  resetTimeout: 30_000,
})

/** Connection error codes that indicate the URL itself is unreachable (not an app-level error) */
const CONNECTION_ERROR_CODES = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'ECONNABORTED'])

const isConnectionError = (err: unknown): boolean => {
  if (!axios.isAxiosError(err)) return false
  // Network-level failures (no response received at all)
  if (err.code && CONNECTION_ERROR_CODES.has(err.code)) return true
  // Timeout with no response also means unreachable
  if (err.code === 'ERR_CANCELED' && !err.response) return true
  return false
}

export class SIIBridgeAdapter {
  private readonly http: AxiosInstance
  private _currentBaseUrl: string
  private readonly _fallbackUrls: string[]

  constructor() {
    this._currentBaseUrl = config.SII_BRIDGE_URL
    this._fallbackUrls = [...config.SII_BRIDGE_FALLBACK_URLS]

    this.http = axios.create({
      baseURL: this._currentBaseUrl,
      timeout: 15_000, // Default 15s; long operations override per-request
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': config.INTERNAL_SECRET,
      },
      // Skip TLS verification for internal bridge URL (container-to-container via Traefik)
      httpsAgent: internalHttpsAgent,
    })

    // Propagate correlation ID to downstream service
    this.http.interceptors.request.use((reqConfig) => {
      const requestId = getRequestId()
      if (requestId !== 'unknown') {
        reqConfig.headers.set('X-Request-ID', requestId)
      }
      return reqConfig
    })

    this.http.interceptors.response.use(
      (res) => res,
      (err) => {
        const detail = err.response?.data?.detail ?? err.message
        logger.error({ url: err.config?.url, status: err.response?.status, detail, reqId: getRequestId() }, 'SII Bridge error')
        throw err
      },
    )

    if (this._fallbackUrls.length > 0) {
      logger.info(
        { primary: this._currentBaseUrl, fallbacks: this._fallbackUrls },
        'SII Bridge adapter initialized with fallback URLs',
      )
    }
  }

  // ── URL Fallback ──────────────────────────────────────────

  /** Switch the primary URL and move the old one into fallback pool */
  private _promoteUrl(newPrimary: string): void {
    const oldPrimary = this._currentBaseUrl
    this._currentBaseUrl = newPrimary
    this.http.defaults.baseURL = newPrimary

    // Remove the new primary from fallback list and push old primary to the end
    const idx = this._fallbackUrls.indexOf(newPrimary)
    if (idx !== -1) this._fallbackUrls.splice(idx, 1)
    this._fallbackUrls.push(oldPrimary)

    logger.warn(
      { from: oldPrimary, to: newPrimary, fallbacks: this._fallbackUrls },
      'SII Bridge URL switched to fallback',
    )
  }

  /**
   * Execute a request function with automatic URL fallback on connection errors.
   * Tries the current primary URL first, then each fallback in order.
   * When a fallback succeeds, it becomes the new primary.
   */
  private async _requestWithFallback<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      if (!isConnectionError(err) || this._fallbackUrls.length === 0) throw err

      logger.warn(
        { url: this._currentBaseUrl, fallbackCount: this._fallbackUrls.length },
        'SII Bridge primary URL unreachable, trying fallbacks',
      )

      // Try each fallback in order
      for (const fallbackUrl of [...this._fallbackUrls]) {
        try {
          // Temporarily switch baseURL for this attempt
          this.http.defaults.baseURL = fallbackUrl
          const result = await fn()
          // Fallback worked — promote it
          this._promoteUrl(fallbackUrl)
          return result
        } catch (fallbackErr) {
          if (!isConnectionError(fallbackErr)) {
            // App-level error from this URL means the URL works but request failed
            // Still promote the URL since it's reachable
            this._promoteUrl(fallbackUrl)
            throw fallbackErr
          }
          logger.warn({ url: fallbackUrl }, 'SII Bridge fallback URL also unreachable')
        }
      }

      // All fallbacks failed — restore original baseURL and throw original error
      this.http.defaults.baseURL = this._currentBaseUrl
      throw err
    }
  }

  // ── DTE ────────────────────────────────────────────────────

  /** Emite un DTE completo: genera XML, firma, envía al SII */
  async emitDTE(payload: DTEPayload): Promise<DTEResult> {
    const { data } = await this._requestWithFallback(() =>
      siiBridgeCircuit.execute(() =>
        this.http.post('/dte/emit', payload, { timeout: 45_000 }),
      ),
    )
    return data
  }

  /** Consulta el estado de un DTE en el SII por track_id */
  async getDTEStatus(trackId: string, rutEmisor: string): Promise<DTEStatusResult> {
    const { data } = await this._requestWithFallback(() =>
      siiBridgeCircuit.execute(() =>
        this.http.get(`/dte/status/${trackId}`, { params: { rut_emisor: rutEmisor } }),
      ),
    )
    return data
  }

  /** Anula un DTE emitiendo una Nota de Crédito */
  async anularDTE(payload: AnulacionPayload): Promise<DTEResult> {
    const { data } = await this._requestWithFallback(() =>
      siiBridgeCircuit.execute(() =>
        this.http.post('/dte/anular', payload, { timeout: 45_000 }),
      ),
    )
    return data
  }

  /** Genera el PDF de un DTE firmado */
  async generatePDF(xmlB64: string, tipo: number): Promise<Buffer> {
    const { data } = await this._requestWithFallback(() =>
      siiBridgeCircuit.execute(() =>
        this.http.post('/dte/pdf', { xml_b64: xmlB64, tipo_dte: tipo }, { responseType: 'arraybuffer', timeout: 30_000 }),
      ),
    )
    return Buffer.from(data)
  }

  // ── CAF ────────────────────────────────────────────────────

  /** Carga un CAF (archivo XML) al SII Bridge.
   *  Bypasses circuit breaker — config operation, not SII operation. */
  async loadCAF(cafXmlBuffer: Buffer, filename: string, rutEmpresa: string, ambiente: string = ''): Promise<CAFLoadResult> {
    const form = new FormData()
    form.append('file', cafXmlBuffer, { filename, contentType: 'application/xml' })
    form.append('rut_empresa', rutEmpresa)
    if (ambiente) form.append('ambiente', ambiente)

    const { data } = await this._requestWithFallback(() =>
      this.http.post('/caf/load', form, { headers: { ...form.getHeaders() } }),
    )
    return data
  }

  /** Estado de los CAFs de una empresa, filtrado por ambiente.
   *  Bypasses circuit breaker — config query, not SII operation. */
  async getCAFStatus(rutEmpresa: string, ambiente: string = ''): Promise<CAFStatus[]> {
    const { data } = await this._requestWithFallback(() =>
      this.http.get(`/caf/status/${rutEmpresa}`, { params: ambiente ? { ambiente } : {} }),
    )
    return data.cafs ?? []
  }

  // ── Certificado ────────────────────────────────────────────

  /** Carga el certificado digital PFX al SII Bridge.
   *  Certificate config ops bypass circuit breaker — they talk directly to the bridge,
   *  not to SII Chile, so they should always work if the bridge container is alive. */
  async loadCertificate(pfxBuffer: Buffer, password: string, rutEmpresa: string): Promise<CertResult> {
    const form = new FormData()
    form.append('file', pfxBuffer, { filename: 'certificado.pfx', contentType: 'application/octet-stream' })
    form.append('password', password)
    form.append('rut_empresa', rutEmpresa)

    const { data } = await this._requestWithFallback(() =>
      this.http.post('/certificate/load', form, {
        headers: { ...form.getHeaders() },
        timeout: 10_000,
      }),
    )
    return data
  }

  /** Estado del certificado cargado (per-company when rut_empresa provided).
   *  Bypasses circuit breaker — config query, not SII operation. */
  async getCertificateStatus(rutEmpresa?: string): Promise<CertStatus> {
    const params = rutEmpresa ? `?rut_empresa=${rutEmpresa}` : ''
    const { data } = await this._requestWithFallback(() =>
      this.http.get(`/certificate/status${params}`),
    )
    return data
  }

  /** Associate current company with an existing loaded certificate.
   *  Bypasses circuit breaker — config operation, not SII operation. */
  async associateCertificate(rutEmpresa: string): Promise<{ success: boolean; mensaje: string }> {
    const { data } = await this._requestWithFallback(() =>
      this.http.post('/certificate/associate', { rut_empresa: rutEmpresa }),
    )
    return data
  }

  /** List all loaded certificates and their associated companies.
   *  Bypasses circuit breaker — config query, not SII operation. */
  async listCertificates(): Promise<CertListResult> {
    const { data } = await this._requestWithFallback(() =>
      this.http.get('/certificate/list'),
    )
    return data
  }

  // ── Certificación Wizard ──────────────────────────────────

  /** Check prerequisites for certification */
  async certPrerequisites(rutEmisor: string): Promise<any> {
    const { data } = await this._requestWithFallback(() =>
      siiBridgeCircuit.execute(() =>
        this.http.get('/certification/prerequisites', { params: { rut_emisor: rutEmisor || '' } }),
      ),
    )
    return data
  }

  /** Get wizard overview */
  async certWizard(rutEmisor: string): Promise<any> {
    const { data } = await this._requestWithFallback(() =>
      siiBridgeCircuit.execute(() =>
        this.http.get('/certification/wizard', { params: { rut_emisor: rutEmisor } }),
      ),
    )
    return data
  }

  /** Get certification status */
  async certStatus(rutEmisor: string): Promise<any> {
    const { data } = await this._requestWithFallback(() =>
      siiBridgeCircuit.execute(() =>
        this.http.get('/certification/status', { params: { rut_emisor: rutEmisor } }),
      ),
    )
    return data
  }

  /** Mark manual step as complete */
  async certCompleteStep(rutEmisor: string, step: number): Promise<any> {
    const { data } = await this._requestWithFallback(() =>
      siiBridgeCircuit.execute(() =>
        this.http.post('/certification/wizard/complete-step', { rut_emisor: rutEmisor, step }),
      ),
    )
    return data
  }

  /** Upload test set file */
  async certUploadTestSet(fileBuffer: Buffer, filename: string, emisor: any, setType: string = 'factura'): Promise<any> {
    const form = new FormData()
    form.append('file', fileBuffer, { filename, contentType: 'text/plain' })
    // Emit emisor fields as form fields for the FastAPI dependency
    Object.entries(emisor).forEach(([key, value]) => {
      form.append(key, String(value))
    })
    const { data } = await this._requestWithFallback(() =>
      siiBridgeCircuit.execute(() =>
        this.http.post(`/certification/wizard/set-prueba/upload?set_type=${setType}`, form, {
          headers: { ...form.getHeaders() },
        }),
      ),
    )
    return data
  }

  /** Process loaded test set */
  async certProcessTestSet(rutEmisor: string, fechaEmision?: string, setType: string = 'factura'): Promise<any> {
    const { data } = await this._requestWithFallback(() =>
      siiBridgeCircuit.execute(() =>
        this.http.post('/certification/wizard/set-prueba/process', {
          rut_emisor: rutEmisor,
          fecha_emision: fechaEmision || undefined,
          set_type: setType,
        }, { timeout: 60_000 }),
      ),
    )
    return data
  }

  /** Send simulation batch */
  async certSimulacion(payloads: any[]): Promise<any> {
    const { data } = await this._requestWithFallback(() =>
      siiBridgeCircuit.execute(() =>
        this.http.post('/certification/wizard/simulacion/send', payloads),
      ),
    )
    return data
  }

  /** Generate PDF for muestras */
  async certGeneratePDF(dteData: any, tedString?: string): Promise<any> {
    const { data } = await this._requestWithFallback(() =>
      siiBridgeCircuit.execute(() =>
        this.http.post('/certification/wizard/muestras/generate-pdf', {
          dte_data: dteData,
          ted_string: tedString,
        }),
      ),
    )
    return data
  }

  /** Reset wizard */
  async certReset(rutEmisor: string): Promise<any> {
    const { data } = await this._requestWithFallback(() =>
      siiBridgeCircuit.execute(() =>
        this.http.post('/certification/wizard/reset', null, { params: { rut_emisor: rutEmisor } }),
      ),
    )
    return data
  }

  // ── SII Conectividad ───────────────────────────────────────

  /** Verifica conectividad con el SII y genera token si hay certificado */
  async checkSIIConnectivity(): Promise<SIIConnectivityResult> {
    const { data } = await this._requestWithFallback(() =>
      siiBridgeCircuit.execute(() => this.http.get('/health/sii')),
    )
    return data
  }

  /** Consulta estado del bridge (health check interno).
   *  Tries all URLs and sets the first reachable one as primary. */
  async ping(): Promise<boolean> {
    // Try primary first
    try {
      await this.http.get('/health', { timeout: 8_000 })
      return true
    } catch (err) {
      if (!isConnectionError(err) || this._fallbackUrls.length === 0) return false
    }

    // Primary unreachable — try each fallback
    for (const fallbackUrl of [...this._fallbackUrls]) {
      try {
        const saved = this.http.defaults.baseURL
        this.http.defaults.baseURL = fallbackUrl
        await this.http.get('/health', { timeout: 8_000 })
        // This fallback works — promote it
        this.http.defaults.baseURL = saved // restore before promote (promote sets it)
        this._promoteUrl(fallbackUrl)
        return true
      } catch {
        // Continue to next fallback
      }
    }

    // Restore original baseURL since nothing worked
    this.http.defaults.baseURL = this._currentBaseUrl
    return false
  }

  /** Returns the currently active bridge URL (useful for debugging/health endpoints) */
  get currentBaseUrl(): string {
    return this._currentBaseUrl
  }
}

// ── Type definitions ───────────────────────────────────────────
export interface DTEPayload {
  tipo_dte: number
  rut_emisor: string
  razon_social_emisor: string
  giro_emisor: string
  direccion_emisor?: string
  comuna_emisor?: string
  actividad_economica?: number
  rut_receptor: string
  razon_social_receptor: string
  giro_receptor: string
  direccion_receptor?: string
  email_receptor?: string
  items: DTEItem[]
  forma_pago?: number
  fecha_emision?: string
  fecha_vencimiento?: string
  observaciones?: string
  ref_tipo_doc?: number
  ref_folio?: number
  ref_fecha?: string
  ref_motivo?: string
}

export interface DTEItem {
  nombre: string
  cantidad: number
  precio_unitario: number
  descuento_pct?: number
  exento?: boolean
  codigo?: string
  unidad?: string
}

export interface DTEResult {
  success: boolean
  folio?: number
  track_id?: string
  estado: string
  mensaje: string
  xml_firmado_b64?: string
}

export interface DTEStatusResult {
  track_id: string
  estado: string
  glosa?: string
}

export interface AnulacionPayload {
  tipo_original: number
  folio_original: number
  fecha_original: string
  rut_emisor: string
  razon_social_emisor: string
  giro_emisor: string
  rut_receptor: string
  razon_social_receptor: string
  giro_receptor: string
  motivo: string
  items: DTEItem[]
}

export interface CAFLoadResult {
  success: boolean
  tipo_dte: number
  folio_desde: number
  folio_hasta: number
  folios_disponibles: number
  mensaje: string
}

export interface CAFStatus {
  tipo_dte: number
  folio_desde: number
  folio_hasta: number
  folio_actual: number
  folios_usados: number
  folios_disponibles: number
  porcentaje_usado: number
  necesita_renovacion: boolean
}

export interface CertResult {
  success: boolean
  rut_empresa: string
  nombre_empresa: string
  vence: string
  mensaje: string
}

export interface CertStatus {
  cargado: boolean
  rut_empresa?: string
  vence?: string
  dias_para_vencer?: number
}

export interface CertListResult {
  certificates: Array<{
    rut_titular: string
    nombre_titular: string
    vence: string
    dias_para_vencer: number
    empresas: string[] // list of rut_empresa associated
  }>
}

export interface SIIConnectivityResult {
  conectado: boolean
  ambiente: string
  token_vigente: boolean
  error?: string
}

export const siiBridgeAdapter = new SIIBridgeAdapter()
export { siiBridgeCircuit }
