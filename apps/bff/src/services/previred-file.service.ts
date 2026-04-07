/**
 * CUENTAX — Previred File Generator
 * Generates the semicolon-delimited .pre file for monthly declaration
 * of AFP, health, and unemployment contributions to Previred.
 */

export interface PreviredEmployee {
  rut: string              // "12345678-9"
  afp_code: string         // Previred AFP code (e.g., "33")
  isapre_code: string      // Previred Isapre code (e.g., "67" or "07" for FONASA)
  renta_imponible: number  // Gross taxable wage
  renta_no_imponible: number
  cotiz_afp: number        // AFP contribution amount
  sis: number              // SIS amount (employer)
  cotiz_salud: number      // Health contribution amount
  salud_adicional: number  // Additional health (Isapre UF plan diff)
  cesantia_trabajador: number
  cesantia_empleador: number
  mutual: number           // Mutual de Seguridad
  impuesto_unico: number   // Income tax
  tipo_contrato: string    // "1"=indefinido, "2"=plazo fijo, "3"=obra
  dias_trabajados: number  // Days worked in month
  tipo_jornada: string     // "1"=completa, "2"=parcial
  apv_amount: number       // Voluntary pension savings
}

export interface PreviredFileData {
  company_rut: string
  periodo: { year: number; mes: number }
  employees: PreviredEmployee[]
}

export function generatePreviredFile(data: PreviredFileData): string {
  const { periodo, employees } = data
  const periodoStr = `${periodo.year}${String(periodo.mes).padStart(2, '0')}`

  const lines: string[] = []

  for (const emp of employees) {
    // Split RUT into body and DV
    const rutParts = emp.rut.replace(/\./g, '').split('-')
    const rutBody = rutParts[0] ?? ''
    const rutDV = rutParts[1] ?? ''

    const fields = [
      rutBody,                             // RUT sin DV
      rutDV,                               // Dígito verificador
      periodoStr,                          // Periodo (YYYYMM)
      emp.afp_code || '',                  // Código AFP
      Math.round(emp.renta_imponible),     // Renta imponible
      Math.round(emp.cotiz_afp),           // Cotización AFP obligatoria
      Math.round(emp.sis),                 // SIS
      Math.round(emp.apv_amount),          // APV
      emp.isapre_code || '07',             // Código Isapre (07=FONASA)
      Math.round(emp.cotiz_salud),         // Cotización salud
      Math.round(emp.salud_adicional),     // Salud adicional
      Math.round(emp.cesantia_trabajador), // AFC trabajador
      Math.round(emp.cesantia_empleador),  // AFC empleador
      Math.round(emp.mutual),             // Mutual
      Math.round(emp.renta_no_imponible), // Renta no imponible
      Math.round(emp.impuesto_unico),     // Impuesto único
      emp.tipo_contrato || '1',           // Tipo contrato
      emp.dias_trabajados,                // Días trabajados
      emp.tipo_jornada || '1',            // Tipo jornada
    ]

    lines.push(fields.join(';'))
  }

  return lines.join('\n')
}

/** Validate employees have required data for Previred */
export interface PreviredValidation {
  valid: boolean
  errors: Array<{ employee: string; rut: string; issues: string[] }>
}

export function validatePreviredData(employees: PreviredEmployee[]): PreviredValidation {
  const errors: PreviredValidation['errors'] = []

  for (const emp of employees) {
    const issues: string[] = []
    if (!emp.rut) issues.push('RUT no definido')
    if (!emp.afp_code) issues.push('Código AFP Previred no asignado')
    if (!emp.isapre_code) issues.push('Código Isapre/FONASA Previred no asignado')
    if (emp.renta_imponible <= 0) issues.push('Renta imponible es 0')
    if (emp.cotiz_afp <= 0) issues.push('Cotización AFP es 0')

    if (issues.length > 0) {
      errors.push({ employee: emp.rut, rut: emp.rut, issues })
    }
  }

  return { valid: errors.length === 0, errors }
}
