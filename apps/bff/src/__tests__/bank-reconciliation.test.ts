/**
 * CUENTAX — Tests for bank-reconciliation + bank-import services
 *
 * These are pure-function tests (no DB, no network). They cover the logic
 * that decides what to persist, what counts as a transfer, what counts as
 * a refund, and how a year summary is shaped.
 */

import { describe, it, expect, vi } from 'vitest'

// The reconciliation service imports db and logger — stub those before importing the service
vi.mock('@/db/client', () => ({ db: {} as any }))
vi.mock('@/core/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import {
  reconcileBalances,
  detectTransfers,
  detectRefunds,
  normalizeVendor,
} from '@/services/bank-reconciliation.service'
import { transactionHash } from '@/services/bank-import.service'
import type { ParsedStatementLine } from '@/services/bank-import.service'

function line(date: string, description: string, amount: number, reference = ''): ParsedStatementLine {
  return {
    date,
    description,
    amount,
    reference,
    external_id: transactionHash(date, description, amount, reference),
  }
}

describe('transactionHash', () => {
  it('produces a stable 32-char hash for the same inputs', () => {
    const a = transactionHash('2025-04-15', 'STRIPE TRANSFER', 5250.0)
    const b = transactionHash('2025-04-15', 'STRIPE TRANSFER', 5250.0)
    expect(a).toBe(b)
    expect(a).toHaveLength(32)
  })

  it('is case-insensitive on description', () => {
    const a = transactionHash('2025-04-15', 'stripe transfer', 100)
    const b = transactionHash('2025-04-15', 'STRIPE TRANSFER', 100)
    expect(a).toBe(b)
  })

  it('differs when amount changes by a cent', () => {
    const a = transactionHash('2025-04-15', 'X', 100.00)
    const b = transactionHash('2025-04-15', 'X', 100.01)
    expect(a).not.toBe(b)
  })

  it('differs when reference changes', () => {
    const a = transactionHash('2025-04-15', 'X', 100, 'REF1')
    const b = transactionHash('2025-04-15', 'X', 100, 'REF2')
    expect(a).not.toBe(b)
  })
})

describe('reconcileBalances', () => {
  it('returns ok=true when opening + deposits - payments = closing', () => {
    const lines = [
      line('2025-01-05', 'DEPOSIT', 1000),
      line('2025-01-10', 'PAYMENT', -200),
      line('2025-01-15', 'DEPOSIT', 500),
    ]
    const result = reconcileBalances(lines, 1000, 2300)
    expect(result.ok).toBe(true)
    expect(result.diff).toBeCloseTo(0)
    expect(result.total_deposits).toBe(1500)
    expect(result.total_payments).toBe(200)
    expect(result.transaction_count).toBe(3)
  })

  it('returns ok=false with detail when balance does not reconcile', () => {
    const lines = [line('2025-01-05', 'PAYMENT', -100)]
    const result = reconcileBalances(lines, 1000, 1000) // missing the -100
    expect(result.ok).toBe(false)
    expect(result.diff).toBeCloseTo(100)
    expect(result.note).toMatch(/Gap/i)
  })

  it('tolerates rounding within default tolerance (1 cent)', () => {
    const lines = [line('2025-01-05', 'X', -100.005)]
    const result = reconcileBalances(lines, 1000, 899.995)
    expect(result.ok).toBe(true)
  })
})

describe('detectTransfers', () => {
  it('detects paired transfers with matching amounts and transfer keyword', () => {
    const lines = [
      line('2025-01-10', 'TRANSFER TO SAVINGS', -2000),
      line('2025-01-10', 'TRANSFER FROM CHECKING', 2000),
    ]
    const pairs = detectTransfers(lines)
    expect(pairs).toHaveLength(1)
    expect(pairs[0].amount).toBe(2000)
    expect(pairs[0].confidence).toBeGreaterThan(0.9)
  })

  it('detects Chilean "transferencia" keyword', () => {
    const lines = [
      line('2025-03-01', 'TRANSFERENCIA A CUENTA AHORRO', -500000),
      line('2025-03-01', 'ABONO A CUENTA PROPIA', 500000),
    ]
    const pairs = detectTransfers(lines)
    expect(pairs).toHaveLength(1)
    expect(pairs[0].confidence).toBeGreaterThan(0.9)
  })

  it('lowers confidence when amount matches but no keyword', () => {
    const lines = [
      line('2025-01-10', 'RANDOM VENDOR A', -500),
      line('2025-01-10', 'RANDOM VENDOR B', 500),
    ]
    const pairs = detectTransfers(lines)
    expect(pairs).toHaveLength(1)
    expect(pairs[0].confidence).toBeLessThan(0.85)
  })

  it('ignores pairs outside the window', () => {
    const lines = [
      line('2025-01-01', 'TRANSFER TO SAVINGS', -2000),
      line('2025-02-01', 'TRANSFER FROM CHECKING', 2000), // 31 days later
    ]
    const pairs = detectTransfers(lines, 3)
    expect(pairs).toHaveLength(0)
  })

  it('does not double-pair an already-used transaction', () => {
    const lines = [
      line('2025-01-10', 'TRANSFER TO SAVINGS', -2000),
      line('2025-01-10', 'TRANSFER FROM CHECKING', 2000),
      line('2025-01-11', 'TRANSFER FROM CHECKING', 2000), // 2nd positive — should NOT match
    ]
    const pairs = detectTransfers(lines)
    expect(pairs).toHaveLength(1)
  })
})

describe('detectRefunds', () => {
  it('detects a refund from same vendor with same absolute amount', () => {
    const lines = [
      line('2025-01-05', 'AMAZON PURCHASE', -150),
      line('2025-01-12', 'AMAZON REFUND', 150),
    ]
    const pairs = detectRefunds(lines)
    expect(pairs).toHaveLength(1)
    expect(pairs[0].amount).toBe(150)
    expect(pairs[0].confidence).toBeGreaterThan(0.9)
  })

  it('detects Chilean "devolucion" keyword', () => {
    const lines = [
      line('2025-02-01', 'FALABELLA COMPRA', -45000),
      line('2025-02-10', 'FALABELLA DEVOLUCION', 45000),
    ]
    const pairs = detectRefunds(lines)
    expect(pairs).toHaveLength(1)
  })

  it('does not confuse a same-amount payment with a refund if no vendor match', () => {
    const lines = [
      line('2025-01-05', 'UBER EATS', -50),
      line('2025-01-12', 'STRIPE PAYMENT', 50), // unrelated
    ]
    const pairs = detectRefunds(lines)
    expect(pairs).toHaveLength(0)
  })

  it('respects the 60-day window', () => {
    const lines = [
      line('2025-01-01', 'AMAZON PURCHASE', -100),
      line('2025-04-01', 'AMAZON REFUND', 100), // 90 days later — outside default window
    ]
    const pairs = detectRefunds(lines)
    expect(pairs).toHaveLength(0)
  })
})

describe('normalizeVendor', () => {
  it('strips trailing dates and reference numbers', () => {
    expect(normalizeVendor('STRIPE TRANSFER 04/15 12345678')).toBe('STRIPE TRANSFER')
    expect(normalizeVendor('AMAZON.COM*A1B2C3 AMZN.COM/BILL')).toContain('AMAZON.COM')
  })

  it('uppercases input for consistent grouping', () => {
    expect(normalizeVendor('stripe transfer')).toBe(normalizeVendor('STRIPE TRANSFER'))
  })

  it('falls back to full description if everything gets stripped', () => {
    // Single-char words get stripped, then we fall back
    expect(normalizeVendor('A B')).toBe('A B')
  })
})
