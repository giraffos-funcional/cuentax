/**
 * CUENTAX — Async bank import job
 * ===================================
 * For large CSVs (>1000 transactions) the synchronous import path is slow
 * enough that browsers may time out. This queue lets the BFF return a
 * job_id immediately and the frontend polls for progress.
 *
 * Each job runs the same pipeline as POST /accounting/import-and-classify
 * but in the background, writing progress to Redis for polling.
 */

import { createQueue, createWorker } from '@/core/queue.js'
import { redis } from '@/adapters/redis.adapter'
import { logger } from '@/core/logger'
import { parseCSV, parseOFX } from '@/services/bank-import.service.js'
import {
  persistTransactions,
  detectTransfers,
  detectRefunds,
  reconcileBalances,
  ensureDefaultBankAccount,
} from '@/services/bank-reconciliation.service.js'
import { classifyTransactions } from '@/services/ai-classification.service.js'
import { listCostCenters } from '@/services/cost-center.service.js'
import { getChartOfAccounts } from '@/services/chart-of-accounts-cache.service.js'

interface BankImportJobData {
  company_id: number
  odoo_company_id: number
  company_name: string
  country_code: string
  content: string
  format: 'csv' | 'ofx'
  bank: string
  currency: 'CLP' | 'USD'
  opening_balance?: number
  closing_balance?: number
  skip_classify?: boolean
}

const QUEUE_NAME = 'bank-import'

export const bankImportQueue = createQueue<BankImportJobData>(QUEUE_NAME)

/** Write progress to Redis so the frontend can poll via GET /import-jobs/:id */
async function writeProgress(jobId: string, data: Record<string, unknown>): Promise<void> {
  if (redis.status !== 'ready') return
  const key = `cuentax:import:${jobId}`
  await redis.setex(key, 3600, JSON.stringify({ ...data, updated_at: new Date().toISOString() }))
}

export async function getImportJobStatus(jobId: string): Promise<Record<string, unknown> | null> {
  if (redis.status !== 'ready') return null
  const key = `cuentax:import:${jobId}`
  const raw = await redis.get(key)
  return raw ? JSON.parse(raw) : null
}

/**
 * Start the worker. Called once from server.ts.
 */
export function startBankImportWorker(): void {
  createWorker<BankImportJobData>(QUEUE_NAME, async (job) => {
    const { data } = job
    const jobId = String(job.id ?? Date.now())

    await writeProgress(jobId, { status: 'parsing', progress: 0 })

    // 1. Parse
    const parsed = data.format === 'ofx'
      ? parseOFX(data.content)
      : parseCSV(data.content, data.bank)
    if (parsed.lines.length === 0) {
      await writeProgress(jobId, {
        status: 'failed',
        error: 'no_transactions',
        parse_errors: parsed.errors,
      })
      return
    }

    // 2. Persist
    await writeProgress(jobId, { status: 'persisting', progress: 20, total: parsed.lines.length })
    const bankAccountId = await ensureDefaultBankAccount(
      data.company_id,
      `${parsed.bank?.toUpperCase() || 'BANK'} — ${data.company_name}`,
      data.currency,
    )
    const persistResult = await persistTransactions(
      data.company_id, bankAccountId, parsed.lines, data.format, data.currency,
    )

    // 3. Transfers + refunds
    await writeProgress(jobId, { status: 'detecting', progress: 40 })
    const transferPairs = detectTransfers(parsed.lines)
    const refundPairs = detectRefunds(parsed.lines)
    const transferIndexes = new Set<number>()
    for (const p of transferPairs) {
      if (p.confidence >= 0.85) {
        transferIndexes.add(p.out_line_index)
        transferIndexes.add(p.in_line_index)
      }
    }

    // 4. Reconcile
    let reconciliation = null
    if (data.opening_balance !== undefined && data.closing_balance !== undefined) {
      reconciliation = reconcileBalances(parsed.lines, data.opening_balance, data.closing_balance)
    }

    // 5. Classify (if not skipped)
    await writeProgress(jobId, { status: 'classifying', progress: 60 })
    let classification = null
    if (!data.skip_classify) {
      try {
        const accounts = await getChartOfAccounts(data.odoo_company_id)
        const costCenters = await listCostCenters(data.company_id)
        const linesToClassify: typeof parsed.lines = []
        const txIds: number[] = []
        for (let i = 0; i < parsed.lines.length; i++) {
          if (transferIndexes.has(i)) continue
          linesToClassify.push(parsed.lines[i])
          txIds.push(persistResult.transactionIds[i] ?? 0)
        }
        classification = await classifyTransactions(
          data.company_id, linesToClassify, accounts, txIds,
          data.country_code === 'US' ? 'US' : 'CL',
          costCenters,
        )
      } catch (err) {
        logger.warn({ err, jobId }, 'Classification step failed in async job')
      }
    }

    // 6. Done
    await writeProgress(jobId, {
      status: 'completed',
      progress: 100,
      parsed: {
        bank: parsed.bank, total_lines: parsed.lines.length, parse_errors: parsed.errors,
      },
      persisted: {
        inserted: persistResult.inserted,
        skipped_duplicates: persistResult.skipped,
        bank_account_id: bankAccountId,
      },
      transfers_detected: transferPairs.length,
      refunds_detected: refundPairs.length,
      reconciliation,
      classification: classification ? {
        total: classification.stats.total,
        auto_approved: classification.stats.auto_approved,
        needs_review: classification.stats.needs_review,
        unclassified: classification.stats.unclassified,
        rule_matched: classification.stats.rule_matched,
      } : null,
    })
  })
}
