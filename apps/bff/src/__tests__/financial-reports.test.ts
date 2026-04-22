/**
 * Tests for Balance Sheet / Cash Flow / Budget variance / Exchange Rate
 * logic where we can test pure math without Odoo.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/db/client', () => ({ db: {} as any }))
vi.mock('@/core/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/adapters/odoo-accounting.adapter', () => ({ odooAccountingAdapter: {} as any }))

describe('financial reports: module load', () => {
  it('balance-sheet.service exports buildBalanceSheet', async () => {
    const m = await import('@/services/balance-sheet.service.js')
    expect(typeof m.buildBalanceSheet).toBe('function')
  })

  it('cash-flow.service exports buildCashFlow', async () => {
    const m = await import('@/services/cash-flow.service.js')
    expect(typeof m.buildCashFlow).toBe('function')
  })

  it('budget.service exports buildBudgetVariance + CRUD', async () => {
    const m = await import('@/services/budget.service.js')
    expect(typeof m.buildBudgetVariance).toBe('function')
    expect(typeof m.listBudgets).toBe('function')
    expect(typeof m.upsertBudget).toBe('function')
    expect(typeof m.deleteBudget).toBe('function')
  })

  it('exchange-rate.service exports convert + CRUD', async () => {
    const m = await import('@/services/exchange-rate.service.js')
    expect(typeof m.convert).toBe('function')
    expect(typeof m.listRates).toBe('function')
    expect(typeof m.setRate).toBe('function')
    expect(typeof m.deleteRate).toBe('function')
  })
})

describe('balance-sheet-pdf: generate without crashing', () => {
  it('generates a PDF buffer for an empty report', async () => {
    const { generateBalanceSheetPdf } = await import('@/services/balance-sheet-pdf.service.js')
    const buf = await generateBalanceSheetPdf({
      country: 'US',
      company_name: 'Test Inc',
      company_tax_id: '12-3456789',
      report: {
        as_of_date: '2025-12-31',
        currency: 'USD',
        current_assets:        { label: 'current_assets',        lines: [], subtotal: 0 },
        fixed_assets:          { label: 'fixed_assets',          lines: [], subtotal: 0 },
        other_assets:          { label: 'other_assets',          lines: [], subtotal: 0 },
        current_liabilities:   { label: 'current_liabilities',   lines: [], subtotal: 0 },
        long_term_liabilities: { label: 'long_term_liabilities', lines: [], subtotal: 0 },
        equity:                { label: 'equity',                lines: [], subtotal: 0 },
        total_assets: 0, total_liabilities: 0, total_equity: 0,
        net_income_current_period: 0, unbalanced_by: 0,
      },
    })
    expect(buf).toBeInstanceOf(Buffer)
    expect(buf.length).toBeGreaterThan(500)
    expect(buf.slice(0, 4).toString()).toBe('%PDF')
  })
})

describe('cash-flow-pdf: generate without crashing', () => {
  it('generates a PDF buffer for an empty period (CL spanish)', async () => {
    const { generateCashFlowPdf } = await import('@/services/cash-flow-pdf.service.js')
    const buf = await generateCashFlowPdf({
      country: 'CL',
      company_name: 'Inversiones Franic Ltda',
      company_tax_id: '76673985-7',
      report: {
        period: { year: 2025, month: null, from: '2025-01-01', to: '2025-12-31' },
        currency: 'CLP',
        opening_cash: 0, closing_cash: 0, net_change: 0,
        operating: { label: 'operating', lines: [], subtotal: 0 },
        investing: { label: 'investing', lines: [], subtotal: 0 },
        financing: { label: 'financing', lines: [], subtotal: 0 },
        total_inflows: 0, total_outflows: 0,
      },
    })
    expect(buf).toBeInstanceOf(Buffer)
    expect(buf.length).toBeGreaterThan(500)
    expect(buf.slice(0, 4).toString()).toBe('%PDF')
  })
})
