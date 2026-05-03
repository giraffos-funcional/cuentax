import type { companies } from '@/db/schema'

export type Company = typeof companies.$inferSelect

export interface ReadinessResult {
  ready: boolean
  missing: string[]
}

/**
 * Verifica que una empresa tenga todos los campos requeridos para emitir DTE en Chile.
 * Si falta algo, devuelve la lista de campos faltantes.
 */
export function checkEmissionReadiness(company: Company | null | undefined): ReadinessResult {
  if (!company) return { ready: false, missing: ['company'] }
  if (company.country_code && company.country_code !== 'CL') {
    return { ready: true, missing: [] }
  }

  const required: Array<[keyof Company, string]> = [
    ['rut', 'RUT'],
    ['razon_social', 'Razón social'],
    ['giro', 'Giro'],
    ['direccion', 'Dirección'],
    ['comuna', 'Comuna'],
    ['ciudad', 'Ciudad'],
    ['actividad_economica', 'Actividad económica'],
    ['tipo_contribuyente', 'Tipo de contribuyente'],
    ['correo_dte', 'Correo DTE'],
    ['oficina_regional_sii', 'Oficina Regional SII'],
    ['numero_resolucion_sii', 'Número de Resolución SII'],
    ['fecha_resolucion_sii', 'Fecha de Resolución SII'],
    ['ambiente_sii', 'Ambiente SII'],
  ]

  const missing: string[] = []
  for (const [field, label] of required) {
    const v = company[field]
    if (v === null || v === undefined || v === '') missing.push(label)
  }

  return { ready: missing.length === 0, missing }
}
