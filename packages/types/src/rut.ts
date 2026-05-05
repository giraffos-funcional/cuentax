/**
 * RUT chileno — utilidades compartidas web + BFF.
 * Validación con dígito verificador módulo 11.
 */

export function cleanRut(input: string): string {
  return input.replace(/\./g, '').replace(/-/g, '').replace(/\s/g, '').toUpperCase()
}

export function validateRut(input: string): boolean {
  const cleaned = cleanRut(input)
  if (cleaned.length < 8 || cleaned.length > 9) return false
  if (!/^\d+[\dK]$/.test(cleaned)) return false

  const body = cleaned.slice(0, -1)
  const dv   = cleaned.slice(-1)

  let sum = 0
  let multiplier = 2
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier
    multiplier = multiplier === 7 ? 2 : multiplier + 1
  }
  const remainder = 11 - (sum % 11)
  const expected = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder)
  return dv === expected
}

export function formatRut(input: string): string {
  const cleaned = cleanRut(input)
  if (cleaned.length < 2) return cleaned
  const body = cleaned.slice(0, -1)
  const dv   = cleaned.slice(-1)
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${formatted}-${dv}`
}

/** Computes the expected check digit for a RUT body (without DV). */
export function computeDv(rutBody: string): string {
  const cleaned = rutBody.replace(/\D/g, '')
  let sum = 0
  let multiplier = 2
  for (let i = cleaned.length - 1; i >= 0; i--) {
    sum += Number(cleaned[i]) * multiplier
    multiplier = multiplier === 7 ? 2 : multiplier + 1
  }
  const remainder = 11 - (sum % 11)
  return remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder)
}
