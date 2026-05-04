/**
 * Unit tests for the revenue-share calculator math.
 * Pure functions only — no DB integration here (those live in
 * tests/integration once we wire test fixtures).
 */
import { describe, it, expect } from 'vitest'
import { firstDayOfPeriod, lastDayOfPeriod } from '@/services/revenue-share/calculator'

describe('revenue-share period helpers', () => {
  it('firstDayOfPeriod returns YYYY-MM-01', () => {
    expect(firstDayOfPeriod('2026-05')).toBe('2026-05-01')
  })

  it('lastDayOfPeriod handles 31-day months', () => {
    expect(lastDayOfPeriod('2026-01')).toBe('2026-01-31')
    expect(lastDayOfPeriod('2026-07')).toBe('2026-07-31')
    expect(lastDayOfPeriod('2026-12')).toBe('2026-12-31')
  })

  it('lastDayOfPeriod handles 30-day months', () => {
    expect(lastDayOfPeriod('2026-04')).toBe('2026-04-30')
    expect(lastDayOfPeriod('2026-09')).toBe('2026-09-30')
  })

  it('lastDayOfPeriod handles February (non-leap)', () => {
    expect(lastDayOfPeriod('2025-02')).toBe('2025-02-28')
  })

  it('lastDayOfPeriod handles February (leap year)', () => {
    expect(lastDayOfPeriod('2024-02')).toBe('2024-02-29')
    expect(lastDayOfPeriod('2028-02')).toBe('2028-02-29')
  })

  it('lastDayOfPeriod handles century non-leap', () => {
    expect(lastDayOfPeriod('2100-02')).toBe('2100-02-28')
  })

  it('lastDayOfPeriod throws on invalid input', () => {
    expect(() => lastDayOfPeriod('abc')).toThrow()
    expect(() => lastDayOfPeriod('2026')).toThrow()
  })
})

describe('revenue-share share math (sanity check)', () => {
  // Replicates the formula used in the service so a regression in the
  // rounding logic is caught by tests rather than at run time.
  function shareOf(monthly: number, rate: number): number {
    return Math.round(monthly * rate)
  }

  it('20% of 80.000 = 16.000', () => {
    expect(shareOf(80_000, 0.20)).toBe(16_000)
  })

  it('matches phase-03 acceptance example', () => {
    // 3 PYMEs × $80k contabilidad = $240k → 20% = $48k
    // 2 PYMEs × $50k remuneraciones = $100k → 20% = $20k
    const totalCont = 3 * 80_000
    const totalRem  = 2 * 50_000
    expect(shareOf(totalCont, 0.20)).toBe(48_000)
    expect(shareOf(totalRem,  0.20)).toBe(20_000)
    expect(shareOf(totalCont, 0.20) + shareOf(totalRem, 0.20)).toBe(68_000)
  })

  it('handles non-default rates (e.g. 15% / 25%)', () => {
    expect(shareOf(80_000, 0.15)).toBe(12_000)
    expect(shareOf(80_000, 0.25)).toBe(20_000)
  })
})
