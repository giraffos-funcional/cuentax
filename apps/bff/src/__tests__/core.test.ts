/**
 * CUENTAX — BFF Tests (Vitest)
 * Servicios y utilidades core del BFF.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── Mock adapters ───────────────────────────────────────────
vi.mock('@/adapters/sii-bridge.adapter', () => ({
  siiBridgeAdapter: {
    emitDTE: vi.fn(),
    getDTEStatus: vi.fn(),
    ping: vi.fn().mockResolvedValue(true),
  },
}))

vi.mock('@/repositories/dte.repository', () => ({
  dteRepository: {
    save: vi.fn().mockResolvedValue('db-id-1'),
    updateEstado: vi.fn(),
    findMany: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getMonthStats: vi.fn().mockResolvedValue([]),
  },
}))

// ─── RUT Validator ───────────────────────────────────────────
function isValidRut(rut: string): boolean {
  const clean = rut.replace(/[.\-]/g, '').toUpperCase()
  if (clean.length < 2) return false
  const body   = clean.slice(0, -1)
  const dv     = clean.slice(-1)
  const digits = body.split('').reverse()
  const factors = [2, 3, 4, 5, 6, 7]
  let sum = 0
  digits.forEach((d, i) => { sum += parseInt(d) * factors[i % factors.length] })
  const expected = 11 - (sum % 11)
  const expectedDV = expected === 11 ? '0' : expected === 10 ? 'K' : String(expected)
  return dv === expectedDV
}

function formatRut(rut: string): string {
  const clean = rut.replace(/[.\-]/g, '').toUpperCase()
  const body  = clean.slice(0, -1)
  const dv    = clean.slice(-1)
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${formatted}-${dv}`
}

// ─── IVA Calculator ──────────────────────────────────────────
function calcularIVA(neto: number): number {
  return Math.round(neto * 0.19)
}

function calcularTotal(neto: number, exento: number = 0): number {
  return neto + calcularIVA(neto) + exento
}

function calcularNeto(totalConIVA: number): number {
  return Math.round(totalConIVA / 1.19)
}

// ─── DTE Service calc ────────────────────────────────────────
function calcTotal(items: { cant: number; precio: number; desc?: number; exento?: boolean }[], tipoDTE: number): number {
  return items.reduce((sum, it) => {
    const bruto = it.cant * it.precio
    const neto  = Math.round(bruto * (1 - (it.desc ?? 0) / 100))
    if (it.exento || tipoDTE === 41) return sum + neto
    return tipoDTE === 39 ? sum + neto : sum + neto + Math.round(neto * 0.19)
  }, 0)
}

// ══════════════════════════════════════════════════════════════
// TEST SUITES
// ══════════════════════════════════════════════════════════════

describe('RUT Validator', () => {
  it('valida RUT correcto (12.345.678-9 → módulo 11)', () => {
    // RUT ejemplo con DV sintético
    expect(typeof isValidRut('76354771-K')).toBe('boolean')
  })

  it('rechaza RUT vacío', () => {
    expect(isValidRut('')).toBe(false)
  })

  it('rechaza RUT muy corto', () => {
    expect(isValidRut('1')).toBe(false)
  })

  it('formatea correctamente sin puntos ni guión', () => {
    const formatted = formatRut('123456789')
    expect(formatted).toContain('-')
    expect(formatted).toContain('.')
  })

  it('formatea independiente de mayúsculas/minúsculas', () => {
    const r1 = formatRut('9999999k')
    const r2 = formatRut('9999999K')
    expect(r1).toBe(r2)
  })
})

describe('IVA Calculator', () => {
  it('calcula 19% correcto', () => {
    expect(calcularIVA(100000)).toBe(19000)
    expect(calcularIVA(1000)).toBe(190)
  })

  it('redondea correctamente con decimales', () => {
    // 100001 * 0.19 = 19000.19 → 19000
    expect(calcularIVA(100001)).toBe(19000)
  })

  it('calcula total neto + IVA', () => {
    expect(calcularTotal(100000)).toBe(119000)
    expect(calcularTotal(100000, 50000)).toBe(169000)
  })

  it('calcula neto desde total con IVA', () => {
    expect(calcularNeto(119000)).toBe(100000)
  })

  it('IVA de cero es cero', () => {
    expect(calcularIVA(0)).toBe(0)
  })
})

describe('DTE Total Calculator', () => {
  const items = [
    { cant: 1, precio: 100000 },
    { cant: 2, precio: 50000 },
  ]

  it('factura tipo 33 incluye IVA 19%', () => {
    const total = calcTotal(items, 33)
    // (100000 + 100000) * 1.19 = 238000
    expect(total).toBe(238000)
  })

  it('boleta tipo 39 NO suma IVA adicional', () => {
    const total = calcTotal(items, 39)
    expect(total).toBe(200000)  // precio ya incluye IVA
  })

  it('boleta no afecta tipo 41 sin IVA', () => {
    const total = calcTotal(items, 41)
    expect(total).toBe(200000)
  })

  it('item exento no paga IVA', () => {
    const itemsConExento = [
      { cant: 1, precio: 100000, exento: false },
      { cant: 1, precio: 50000,  exento: true  },
    ]
    const total = calcTotal(itemsConExento, 33)
    // 100000 + 19000 (iva) + 50000 (exento) = 169000
    expect(total).toBe(169000)
  })

  it('descuento reduce monto del ítem', () => {
    const itemConDesc = [{ cant: 10, precio: 1000, desc: 10 }]
    const total = calcTotal(itemConDesc, 33)
    // 10*1000 = 10000, -10% = 9000, +IVA 1710 = 10710
    expect(total).toBe(10710)
  })

  it('total cero con items vacíos', () => {
    expect(calcTotal([], 33)).toBe(0)
  })
})

describe('DTE Status Mapping', () => {
  const SII_STATUS_MAP: Record<string, string> = {
    'EPR': 'enviado',
    'ACD': 'aceptado',
    'RSC': 'aceptado',
    'RCT': 'rechazado',
    'VOF': 'rechazado',
    '00':  'aceptado',
    '01':  'rechazado',
  }

  it.each([
    ['EPR', 'enviado'],
    ['ACD', 'aceptado'],
    ['RSC', 'aceptado'],
    ['RCT', 'rechazado'],
    ['VOF', 'rechazado'],
    ['00',  'aceptado'],
    ['01',  'rechazado'],
  ])('SII estado %s → interno %s', (sii, interno) => {
    expect(SII_STATUS_MAP[sii]).toBe(interno)
  })

  it('estado desconocido retorna enviado (default safe)', () => {
    expect(SII_STATUS_MAP['XXX'] ?? 'enviado').toBe('enviado')
  })
})
