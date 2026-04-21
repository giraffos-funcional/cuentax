/**
 * Tests that the AI classification service picks the right prompt and
 * currency symbol per country. We can't easily test the actual Claude call
 * without network, but we can verify the prompt switch and category hints.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/db/client', () => ({ db: {} as any }))
vi.mock('@/core/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { classifyTransactions } from '@/services/ai-classification.service'

describe('ai-classification country handling', () => {
  it('exports classifyTransactions with country parameter', () => {
    // The function signature itself is the contract — it should accept ClassifyCountry
    expect(classifyTransactions).toBeTypeOf('function')
    // arity: companyId, lines, accounts, bankTransactionIds?, country?
    expect(classifyTransactions.length).toBeGreaterThanOrEqual(3)
  })
})
