/**
 * CUENTAX — SII RUT Lookup Adapter
 * Consulta datos de contribuyente en el SII por RUT.
 * Uses HTTP requests only — no shell commands.
 */

import axios from 'axios'
import { logger } from '@/core/logger'

export interface SIIContribuyenteData {
  rut: string
  razon_social: string
  giro: string
  actividad_economica: number
  actividades: Array<{
    codigo: number
    descripcion: string
    categoria: string
    afecta_iva: boolean
    fecha: string
  }>
  inicio_actividades: string
  es_menor_tamano: boolean
  found: boolean
}

class SIIRutAdapter {
  /**
   * Busca datos de un contribuyente en el SII.
   * First tries with session cookies, falls back gracefully.
   */
  async lookup(rut: string): Promise<SIIContribuyenteData> {
    const cleaned = rut.replace(/\./g, '').replace(/-/g, '').toUpperCase()
    const body = cleaned.slice(0, -1)
    const dv = cleaned.slice(-1)
    const formattedRut = `${body}-${dv}`

    try {
      // Step 1: Get session cookie from SII
      const session = await axios.get('https://www2.sii.cl/stc/noauthz', {
        timeout: 10_000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
        maxRedirects: 5,
      })

      const cookies = (session.headers['set-cookie'] ?? [])
        .map((c: string) => c.split(';')[0])
        .join('; ')

      // Step 2: Submit the RUT query
      const response = await axios.post(
        'https://zeus.sii.cl/cvc_cgi/stc/getstc',
        `RUT=${body}&DV=${dv}&PRG=STC&OPC=NOR`,
        {
          timeout: 10_000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': 'https://www2.sii.cl/stc/noauthz',
            'Cookie': cookies,
          },
          maxRedirects: 5,
        },
      )

      const html = response.data as string

      // Check for captcha or error
      if (html.includes('Captcha') || html.includes("alert('")) {
        logger.debug('SII returned captcha — falling back')
        return this.notFound(formattedRut)
      }

      return this.parseHTML(html, formattedRut)
    } catch (err) {
      logger.warn({ err, rut: formattedRut }, 'SII RUT lookup failed')
      return this.notFound(formattedRut)
    }
  }

  private notFound(rut: string): SIIContribuyenteData {
    return {
      rut,
      razon_social: '',
      giro: '',
      actividad_economica: 0,
      actividades: [],
      inicio_actividades: '',
      es_menor_tamano: false,
      found: false,
    }
  }

  private parseHTML(html: string, rut: string): SIIContribuyenteData {
    // Extract razón social
    const razonMatch = html.match(/Nombre\s*o\s*Raz[oó]n\s*Social[^:]*:\s*([^<\n]+)/i)
    const razon_social = razonMatch?.[1]?.trim() ?? ''

    // Extract inicio actividades
    const inicioMatch = html.match(/Fecha\s*de\s*Inicio\s*de\s*Actividades[^:]*:\s*([^<\n]+)/i)
    const inicio_actividades = inicioMatch?.[1]?.trim() ?? ''

    // Extract menor tamaño
    const menorMatch = html.match(/Empresa\s*de\s*Menor\s*Tama[ñn]o[^:]*:\s*(SI|NO)/i)
    const es_menor_tamano = menorMatch?.[1]?.toUpperCase() === 'SI'

    // Extract actividades from table rows
    const actividades: SIIContribuyenteData['actividades'] = []

    // Match table rows with activity data
    const activityPattern = /(\d{6})\s*<\/td>\s*<td[^>]*>\s*([^<]*)\s*<\/td>\s*<td[^>]*>\s*(S[iíI]|No)\s*<\/td>\s*<td[^>]*>\s*([\d-]+)/gi
    let match
    while ((match = activityPattern.exec(html)) !== null) {
      actividades.push({
        codigo: parseInt(match[1]) || 0,
        descripcion: '',
        categoria: match[2]?.trim() ?? '',
        afecta_iva: match[3]?.trim().toUpperCase().startsWith('S') ?? false,
        fecha: match[4]?.trim() ?? '',
      })
    }

    // Try to get activity descriptions from another pattern
    const descPattern = /<td[^>]*>\s*\d+\s*<\/td>\s*<td[^>]*>\s*([A-ZÁÉÍÓÚÑ][^<]{10,})\s*<\/td>\s*<td[^>]*>\s*(\d{6})/gi
    let descMatch
    while ((descMatch = descPattern.exec(html)) !== null) {
      const codigo = parseInt(descMatch[2])
      const existing = actividades.find(a => a.codigo === codigo)
      if (existing) {
        existing.descripcion = descMatch[1].trim()
      } else {
        actividades.push({
          codigo,
          descripcion: descMatch[1].trim(),
          categoria: '',
          afecta_iva: true,
          fecha: '',
        })
      }
    }

    const firstActivity = actividades[0]
    const giro = firstActivity?.descripcion || ''
    const actividad_economica = firstActivity?.codigo || 0

    return {
      rut,
      razon_social,
      giro,
      actividad_economica,
      actividades,
      inicio_actividades,
      es_menor_tamano,
      found: !!razon_social,
    }
  }
}

export const siiRutAdapter = new SIIRutAdapter()
