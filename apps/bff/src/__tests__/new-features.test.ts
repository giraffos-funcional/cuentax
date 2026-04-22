/**
 * Tests for the new feature batch:
 *   - Trial Balance + General Ledger exports
 *   - Aged AR/AP report
 *   - 1099-NEC PDF
 *   - Keyword templates
 *   - Budget period expansion
 *   - New bank parsers (Mercury, Brex, Ramp, Relay, Stripe, Tenpo, Mach)
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/db/client', () => ({ db: {} as any }))
vi.mock('@/core/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/adapters/odoo-accounting.adapter', () => ({ odooAccountingAdapter: {} as any }))
vi.mock('@/adapters/redis.adapter', () => ({ redis: { status: 'end' } as any }))

import { parseCSV, BANK_MAPPINGS } from '@/services/bank-import.service'
import { expandPeriodBudget } from '@/services/budget.service'
import { KEYWORD_TEMPLATES } from '@/data/keyword-templates'

describe('new bank parsers', () => {
  it('registers all new bank mappings', () => {
    for (const bank of ['mercury', 'brex', 'ramp', 'relay', 'stripe', 'tenpo', 'mach']) {
      expect(BANK_MAPPINGS[bank], `missing mapping for ${bank}`).toBeDefined()
    }
  })

  it('parses a Mercury CSV (MM/DD/YYYY + comma separator)', () => {
    const csv = [
      'Date,Description,Amount,Status,Reference,Note,Account',
      '01/15/2026,STRIPE TRANSFER,5250.00,Posted,TXN-1,,Main',
      '01/16/2026,GUSTO PAYROLL,-3200.00,Posted,TXN-2,,Main',
    ].join('\n')
    const r = parseCSV(csv, 'mercury')
    expect(r.lines).toHaveLength(2)
    expect(r.lines[0].date).toBe('2026-01-15')
    expect(r.lines[0].description).toBe('STRIPE TRANSFER')
    expect(r.lines[0].amount).toBe(5250)
    expect(r.lines[1].amount).toBe(-3200)
  })

  it('parses a Stripe payouts CSV (YYYY-MM-DD, positive deposits)', () => {
    const csv = [
      'automatic_payout_effective_at_(UTC),description,gross,fees,net,automatic_payout_id',
      '2026-01-15 08:00:00,Payout Jan 15,10000.00,300.00,9700.00,po_123',
      '2026-02-01 08:00:00,Payout Feb 1,20000.00,600.00,19400.00,po_456',
    ].join('\n')
    const r = parseCSV(csv, 'stripe')
    expect(r.lines).toHaveLength(2)
    expect(r.lines[0].date).toBe('2026-01-15')  // Time stripped
    expect(r.lines[0].amount).toBe(9700)        // net column
  })

  it('parses a Tenpo CSV (DD/MM/YYYY + semicolon)', () => {
    const csv = [
      'Fecha;Descripción;Referencia;Monto;Saldo',
      '15/01/2026;TRANSBANK;REF123;150000;500000',
      '20/01/2026;ENEL;REF456;-85000;415000',
    ].join('\n')
    const r = parseCSV(csv, 'tenpo')
    expect(r.lines).toHaveLength(2)
    expect(r.lines[0].date).toBe('2026-01-15')
    expect(r.lines[0].amount).toBe(150000)
    expect(r.lines[1].amount).toBe(-85000)
  })

  it('parses a Mach CSV (debit/credit separate columns)', () => {
    const csv = [
      'Fecha;Detalle;Cargo;Abono;Saldo',
      '15/01/2026;TRANSFERENCIA;;300000;500000',
      '20/01/2026;PAGO ENEL;85000;;415000',
    ].join('\n')
    const r = parseCSV(csv, 'mach')
    expect(r.lines).toHaveLength(2)
    expect(r.lines[0].amount).toBe(300000)
    expect(r.lines[1].amount).toBe(-85000)
  })
})

describe('expandPeriodBudget', () => {
  const base = { account_code: '6000', cost_center_id: null, year: 2026 }

  it('single-month → one row', () => {
    const rows = expandPeriodBudget(base, 'month', 4, 3000)
    expect(rows).toHaveLength(1)
    expect(rows[0].month).toBe(4)
    expect(rows[0].amount).toBe(3000)
  })

  it('quarter → 3 rows of equal amount', () => {
    const rows = expandPeriodBudget(base, 'quarter', 2, 9000)
    expect(rows).toHaveLength(3)
    expect(rows.map(r => r.month)).toEqual([4, 5, 6])
    expect(rows.every(r => r.amount === 3000)).toBe(true)
  })

  it('year → 12 rows of equal amount', () => {
    const rows = expandPeriodBudget(base, 'year', 1, 12000)
    expect(rows).toHaveLength(12)
    expect(rows.map(r => r.month)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12])
    expect(rows.every(r => r.amount === 1000)).toBe(true)
  })
})

describe('KEYWORD_TEMPLATES', () => {
  it('has 7 verticals', () => {
    expect(KEYWORD_TEMPLATES.length).toBeGreaterThanOrEqual(7)
  })

  it('each template has bilingual name + example centers', () => {
    for (const t of KEYWORD_TEMPLATES) {
      expect(t.id).toBeTypeOf('string')
      expect(t.name).toBeTypeOf('string')
      expect(t.name_es).toBeTypeOf('string')
      expect(Array.isArray(t.suggested_keywords)).toBe(true)
      expect(Array.isArray(t.example_centers)).toBe(true)
    }
  })

  it('Airbnb template has property-specific keywords', () => {
    const airbnb = KEYWORD_TEMPLATES.find(t => t.id === 'airbnb')
    expect(airbnb).toBeDefined()
    expect(airbnb!.suggested_keywords).toContain('CLEANING')
    expect(airbnb!.suggested_keywords).toContain('GASTOS COMUNES')
  })
})

describe('service module load', () => {
  it('trial-balance.service loads', async () => {
    const m = await import('@/services/trial-balance.service.js')
    expect(typeof m.buildTrialBalance).toBe('function')
    expect(typeof m.buildGeneralLedger).toBe('function')
  })

  it('aged-ar-ap.service loads', async () => {
    const m = await import('@/services/aged-ar-ap.service.js')
    expect(typeof m.buildAgedReport).toBe('function')
  })

  it('form-1099-pdf.service loads', async () => {
    const m = await import('@/services/form-1099-pdf.service.js')
    expect(typeof m.generate1099Pdf).toBe('function')
    expect(typeof m.build1099Entries).toBe('function')
  })

  it('alerts.service loads', async () => {
    const m = await import('@/services/alerts.service.js')
    expect(typeof m.buildAlerts).toBe('function')
  })

  it('report-conversion.service loads', async () => {
    const m = await import('@/services/report-conversion.service.js')
    expect(typeof m.convertToReportCurrency).toBe('function')
    expect(typeof m.batchConvert).toBe('function')
  })

  it('metrics.service loads', async () => {
    const m = await import('@/services/metrics.service.js')
    expect(typeof m.buildCompanyMetrics).toBe('function')
  })

  it('chart-of-accounts-cache.service loads', async () => {
    const m = await import('@/services/chart-of-accounts-cache.service.js')
    expect(typeof m.getChartOfAccounts).toBe('function')
    expect(typeof m.invalidateChartCache).toBe('function')
  })
})

describe('PDF generators produce valid PDFs', () => {
  it('1099-NEC PDF (empty vendors)', async () => {
    const { generate1099Pdf } = await import('@/services/form-1099-pdf.service.js')
    const buf = await generate1099Pdf({
      company_name: 'Test Inc', company_tax_id: '12-3456789',
      year: 2025, threshold: 600, vendors: [],
    })
    expect(buf.slice(0, 4).toString()).toBe('%PDF')
  })

  it('1099-NEC PDF (with vendors)', async () => {
    const { generate1099Pdf } = await import('@/services/form-1099-pdf.service.js')
    const buf = await generate1099Pdf({
      company_name: 'Test Inc', company_tax_id: '12-3456789',
      year: 2025, threshold: 600,
      vendors: [
        { vendor: 'AWS', total: 12000.50, count: 12 },
        { vendor: 'Stripe Consulting', total: 8000, count: 8 },
      ],
    })
    expect(buf.slice(0, 4).toString()).toBe('%PDF')
    expect(buf.length).toBeGreaterThan(500)
  })

  it('Trial Balance PDF (empty report)', async () => {
    const { generateTrialBalancePdf } = await import('@/services/trial-balance-pdf.service.js')
    const buf = await generateTrialBalancePdf({
      country: 'CL',
      company_name: 'Test Ltda', company_tax_id: '76.123.456-7',
      report: {
        period: { from: '2025-01-01', to: '2025-12-31' },
        currency: 'CLP', rows: [],
        totals: { opening_balance: 0, period_debit: 0, period_credit: 0, closing_balance: 0 },
        is_balanced: true,
      },
    })
    expect(buf.slice(0, 4).toString()).toBe('%PDF')
  })
})
