/**
 * CUENTAX — SII Bridge Adapter (BFF → SII Bridge)
 * ================================================
 * Cliente HTTP que el BFF usa para comunicarse con el SII Bridge (FastAPI).
 * El BFF actúa como gateway: recibe del frontend, enriquece con datos de Odoo
 * y delega la operación SII al bridge.
 */

import axios, { AxiosInstance } from 'axios'
import FormData from 'form-data'
import { config } from '@/core/config'
import { logger } from '@/core/logger'

export class SIIBridgeAdapter {
  private readonly http: AxiosInstance

  constructor() {
    this.http = axios.create({
      baseURL: config.SII_BRIDGE_URL,
      timeout: 60_000, // El SII puede ser lento
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': config.INTERNAL_SECRET,
      },
    })

    this.http.interceptors.response.use(
      (res) => res,
      (err) => {
        const detail = err.response?.data?.detail ?? err.message
        logger.error({ url: err.config?.url, status: err.response?.status, detail }, 'SII Bridge error')
        throw err
      },
    )
  }

  // ── DTE ────────────────────────────────────────────────────

  /** Emite un DTE completo: genera XML, firma, envía al SII */
  async emitDTE(payload: DTEPayload): Promise<DTEResult> {
    const { data } = await this.http.post('/dte/emit', payload)
    return data
  }

  /** Consulta el estado de un DTE en el SII por track_id */
  async getDTEStatus(trackId: string, rutEmisor: string): Promise<DTEStatusResult> {
    const { data } = await this.http.get(`/dte/status/${trackId}`, {
      params: { rut_emisor: rutEmisor },
    })
    return data
  }

  /** Anula un DTE emitiendo una Nota de Crédito */
  async anularDTE(payload: AnulacionPayload): Promise<DTEResult> {
    const { data } = await this.http.post('/dte/anular', payload)
    return data
  }

  /** Genera el PDF de un DTE firmado */
  async generatePDF(xmlB64: string, tipo: number): Promise<Buffer> {
    const { data } = await this.http.post('/dte/pdf', { xml_b64: xmlB64, tipo_dte: tipo }, {
      responseType: 'arraybuffer',
    })
    return Buffer.from(data)
  }

  // ── CAF ────────────────────────────────────────────────────

  /** Carga un CAF (archivo XML) al SII Bridge */
  async loadCAF(cafXmlBuffer: Buffer, filename: string, rutEmpresa: string, ambiente: string = ''): Promise<CAFLoadResult> {
    const form = new FormData()
    form.append('file', cafXmlBuffer, { filename, contentType: 'application/xml' })
    form.append('rut_empresa', rutEmpresa)
    if (ambiente) form.append('ambiente', ambiente)

    const { data } = await this.http.post('/caf/load', form, {
      headers: { ...form.getHeaders() },
    })
    return data
  }

  /** Estado de los CAFs de una empresa, filtrado por ambiente */
  async getCAFStatus(rutEmpresa: string, ambiente: string = ''): Promise<CAFStatus[]> {
    const { data } = await this.http.get(`/caf/status/${rutEmpresa}`, {
      params: ambiente ? { ambiente } : {},
    })
    return data.cafs ?? []
  }

  // ── Certificado ────────────────────────────────────────────

  /** Carga el certificado digital PFX al SII Bridge */
  async loadCertificate(pfxBuffer: Buffer, password: string, rutEmpresa: string): Promise<CertResult> {
    const form = new FormData()
    form.append('file', pfxBuffer, { filename: 'certificado.pfx', contentType: 'application/octet-stream' })
    form.append('password', password)
    form.append('rut_empresa', rutEmpresa)

    const { data } = await this.http.post('/certificate/load', form, {
      headers: { ...form.getHeaders() },
    })
    return data
  }

  /** Estado del certificado cargado (per-company when rut_empresa provided) */
  async getCertificateStatus(rutEmpresa?: string): Promise<CertStatus> {
    const params = rutEmpresa ? `?rut_empresa=${rutEmpresa}` : ''
    const { data } = await this.http.get(`/certificate/status${params}`)
    return data
  }

  /** Associate current company with an existing loaded certificate */
  async associateCertificate(rutEmpresa: string): Promise<{ success: boolean; mensaje: string }> {
    const { data } = await this.http.post('/certificate/associate', { rut_empresa: rutEmpresa })
    return data
  }

  /** List all loaded certificates and their associated companies */
  async listCertificates(): Promise<CertListResult> {
    const { data } = await this.http.get('/certificate/list')
    return data
  }

  // ── Certificación Wizard ──────────────────────────────────

  /** Check prerequisites for certification */
  async certPrerequisites(rutEmisor: string): Promise<any> {
    const { data } = await this.http.get('/certification/prerequisites', { params: { rut_emisor: rutEmisor || '' } })
    return data
  }

  /** Get wizard overview */
  async certWizard(rutEmisor: string): Promise<any> {
    const { data } = await this.http.get('/certification/wizard', { params: { rut_emisor: rutEmisor } })
    return data
  }

  /** Get certification status */
  async certStatus(rutEmisor: string): Promise<any> {
    const { data } = await this.http.get('/certification/status', { params: { rut_emisor: rutEmisor } })
    return data
  }

  /** Mark manual step as complete */
  async certCompleteStep(rutEmisor: string, step: number): Promise<any> {
    const { data } = await this.http.post('/certification/wizard/complete-step', { rut_emisor: rutEmisor, step })
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
    const { data } = await this.http.post(`/certification/wizard/set-prueba/upload?set_type=${setType}`, form, {
      headers: { ...form.getHeaders() },
    })
    return data
  }

  /** Process loaded test set */
  async certProcessTestSet(rutEmisor: string, fechaEmision?: string, setType: string = 'factura'): Promise<any> {
    const { data } = await this.http.post('/certification/wizard/set-prueba/process', {
      rut_emisor: rutEmisor,
      fecha_emision: fechaEmision || undefined,
      set_type: setType,
    })
    return data
  }

  /** Send simulation batch */
  async certSimulacion(payloads: any[]): Promise<any> {
    const { data } = await this.http.post('/certification/wizard/simulacion/send', payloads)
    return data
  }

  /** Generate PDF for muestras */
  async certGeneratePDF(dteData: any, tedString?: string): Promise<any> {
    const { data } = await this.http.post('/certification/wizard/muestras/generate-pdf', {
      dte_data: dteData,
      ted_string: tedString,
    })
    return data
  }

  /** Reset wizard */
  async certReset(rutEmisor: string): Promise<any> {
    const { data } = await this.http.post('/certification/wizard/reset', null, {
      params: { rut_emisor: rutEmisor },
    })
    return data
  }

  // ── SII Conectividad ───────────────────────────────────────

  /** Verifica conectividad con el SII y genera token si hay certificado */
  async checkSIIConnectivity(): Promise<SIIConnectivityResult> {
    const { data } = await this.http.get('/health/sii')
    return data
  }

  /** Consulta estado del bridge (health check interno) */
  async ping(): Promise<boolean> {
    try {
      await this.http.get('/health', { timeout: 3_000 })
      return true
    } catch {
      return false
    }
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
