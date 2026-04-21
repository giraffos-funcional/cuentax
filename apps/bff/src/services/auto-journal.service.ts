/**
 * CUENTAX — Auto Journal Entry Service
 * ======================================
 * Generates draft journal entries in Odoo from approved AI classifications.
 * Creates proper double-entry bookkeeping: Bank ↔ Expense/Revenue accounts.
 */

import { eq, and, isNull } from 'drizzle-orm'
import { db } from '@/db/client'
import { transactionClassifications } from '@/db/schema'
import { odooAccountingAdapter } from '@/adapters/odoo-accounting.adapter'
import { logger } from '@/core/logger'

interface JournalEntryResult {
  classification_id: number
  odoo_move_id: number | null
  posted?: boolean
  error?: string
}

export interface GenerateJournalOptions {
  /** Automatically post created moves (state=posted) when true. Default false (draft). */
  auto_post?: boolean
  /** Skip classifications flagged as inter-account transfers. Default true. */
  skip_transfers?: boolean
}

/**
 * Generate draft journal entries in Odoo from approved, unposted classifications.
 * Each classification becomes one journal entry with two lines (double-entry).
 *
 * @param companyId - Local company ID
 * @param odooCompanyId - Odoo company ID
 * @param bankJournalId - Odoo journal ID for bank transactions
 * @param bankAccountId - Odoo account.account ID for the bank account (e.g., 1000 Cash)
 * @param options - { auto_post?: boolean; skip_transfers?: boolean }
 */
export async function generateJournalEntries(
  companyId: number,
  odooCompanyId: number,
  bankJournalId: number,
  bankAccountId: number,
  options: GenerateJournalOptions = {},
): Promise<{ created: JournalEntryResult[]; errors: string[] }> {
  const { auto_post = false, skip_transfers = true } = options
  // Fetch approved classifications that don't have a journal entry yet
  const pending = await db.select().from(transactionClassifications)
    .where(and(
      eq(transactionClassifications.company_id, companyId),
      eq(transactionClassifications.approved, true),
      isNull(transactionClassifications.odoo_move_id),
    ))

  if (pending.length === 0) {
    return { created: [], errors: [] }
  }

  const results: JournalEntryResult[] = []
  const errors: string[] = []

  for (const classification of pending) {
    const amount = parseFloat(String(classification.original_amount))
    const isDeposit = amount > 0
    const absAmount = Math.abs(amount)

    // Skip inter-account transfers first — these typically have no account_id
    // assigned (by design: they cancel out at the company level).
    if (skip_transfers && classification.classified_category === 'transfer') {
      results.push({
        classification_id: classification.id,
        odoo_move_id: null,
        error: 'Skipped: inter-account transfer',
      })
      continue
    }

    if (!classification.classified_account_id) {
      errors.push(`Classification ${classification.id}: no account assigned`)
      results.push({ classification_id: classification.id, odoo_move_id: null, error: 'No account assigned' })
      continue
    }

    // Build double-entry journal entry
    // Deposit: Debit Bank, Credit Revenue/Income
    // Payment: Debit Expense, Credit Bank
    const lines = isDeposit
      ? [
          [0, 0, {
            account_id: bankAccountId,
            name: classification.original_description ?? 'Bank deposit',
            debit: absAmount,
            credit: 0,
          }],
          [0, 0, {
            account_id: classification.classified_account_id,
            name: classification.original_description ?? 'Bank deposit',
            debit: 0,
            credit: absAmount,
          }],
        ]
      : [
          [0, 0, {
            account_id: classification.classified_account_id,
            name: classification.original_description ?? 'Bank payment',
            debit: absAmount,
            credit: 0,
          }],
          [0, 0, {
            account_id: bankAccountId,
            name: classification.original_description ?? 'Bank payment',
            debit: 0,
            credit: absAmount,
          }],
        ]

    try {
      const moveId = await odooAccountingAdapter.create('account.move', {
        journal_id: bankJournalId,
        date: classification.original_date ?? new Date().toISOString().slice(0, 10),
        ref: `AI: ${(classification.original_description ?? '').slice(0, 60)}`,
        move_type: 'entry',
        company_id: odooCompanyId,
        line_ids: lines,
      })

      if (moveId) {
        // Update classification with the generated move ID
        await db.update(transactionClassifications)
          .set({ odoo_move_id: moveId, updated_at: new Date() })
          .where(eq(transactionClassifications.id, classification.id))

        results.push({ classification_id: classification.id, odoo_move_id: moveId, posted: false })
      } else {
        errors.push(`Classification ${classification.id}: Odoo create returned null`)
        results.push({ classification_id: classification.id, odoo_move_id: null, error: 'Odoo create failed' })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      logger.error({ err, classificationId: classification.id }, 'Failed to create journal entry')
      errors.push(`Classification ${classification.id}: ${msg}`)
      results.push({ classification_id: classification.id, odoo_move_id: null, error: msg })
    }
  }

  // Batch-post created moves (100 at a time). A single action_post with an
  // array of IDs is much faster than calling it per-move — across 500 entries
  // this cuts the wall-clock from ~8 minutes to ~20 seconds.
  if (auto_post) {
    const createdIds = results.filter(r => r.odoo_move_id).map(r => r.odoo_move_id as number)
    const BATCH = 100
    for (let i = 0; i < createdIds.length; i += BATCH) {
      const batch = createdIds.slice(i, i + BATCH)
      try {
        await odooAccountingAdapter.callMethod('account.move', 'action_post', batch)
        // Mark all in this batch as posted
        for (const r of results) {
          if (r.odoo_move_id && batch.includes(r.odoo_move_id)) r.posted = true
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown post error'
        logger.warn({ err, batchSize: batch.length, start: i }, 'Batch post failed, entries left in draft')
        errors.push(`Batch post failed (${batch.length} moves, starting at index ${i}): ${msg}`)
      }
    }
  }

  logger.info({
    companyId,
    total: pending.length,
    created: results.filter(r => r.odoo_move_id).length,
    posted: results.filter(r => r.posted).length,
    failed: results.filter(r => !r.odoo_move_id).length,
  }, 'Auto journal entries generated')

  return { created: results, errors }
}
