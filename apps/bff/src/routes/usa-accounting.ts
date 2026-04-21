/**
 * CUENTAX — USA Accounting Routes
 * =================================
 * Endpoints for the US accounting flow:
 * Upload bank statements → AI classification → journal entry generation
 *
 * All routes require FEATURE_USA_ACCOUNTING=true and country_code='US'
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { authGuard } from '@/middlewares/auth-guard'
import { requireCountry } from '@/middlewares/country-guard'
import { featureFlags } from '@/core/feature-flags'
import { logger } from '@/core/logger'
import { db } from '@/db/client'
import { transactionClassifications, classificationRules } from '@/db/schema'
import { odooAccountingAdapter } from '@/adapters/odoo-accounting.adapter'
import { parseCSV, parseOFX } from '@/services/bank-import.service'
import {
  classifyTransactions,
  getPendingClassifications,
  approveClassification,
  bulkApprove,
  learnRule,
} from '@/services/ai-classification.service'
import { generateJournalEntries } from '@/services/auto-journal.service'
import {
  persistTransactions,
  reconcileBalances,
  detectTransfers,
  buildYearSummary,
  ensureDefaultBankAccount,
} from '@/services/bank-reconciliation.service'
import { US_GAAP_CHART, US_JOURNALS } from '@/data/chart-of-accounts-us-gaap'
import { getLocalCompanyId } from '@/core/company-resolver'

export async function usaAccountingRoutes(fastify: FastifyInstance) {
  // All routes require auth + US company
  fastify.addHook('preHandler', authGuard)
  fastify.addHook('preHandler', requireCountry('US'))

  // ── POST /import-and-classify ─────────────────────────────
  // Upload a bank statement, dedupe into bank_transactions, detect transfers,
  // optionally reconcile against a known balance, then classify with AI.
  fastify.post('/import-and-classify', async (req, reply) => {
    if (!featureFlags.aiClassificationEnabled && !featureFlags.usaAccountingEnabled) {
      return reply.status(503).send({ error: 'AI classification is not enabled' })
    }

    const user = (req as any).user
    const body = req.body as {
      content: string
      format: 'csv' | 'ofx'
      bank?: string
      opening_balance?: number
      closing_balance?: number
      /** Skip AI classification (useful when API key not configured). */
      skip_classify?: boolean
    }

    if (!body.content || !body.format) {
      return reply.status(400).send({ error: 'content and format are required' })
    }

    // 1. Parse the file
    const parsed = body.format === 'ofx'
      ? parseOFX(body.content)
      : parseCSV(body.content, body.bank ?? 'generic_us')

    if (parsed.lines.length === 0) {
      return reply.status(400).send({
        error: 'no_transactions',
        message: 'No transactions could be parsed from the file',
        parse_errors: parsed.errors,
      })
    }

    const odooCompanyId = user.company_id
    const localCompanyId = await getLocalCompanyId(odooCompanyId)

    // 2. Persist to bank_transactions with dedup
    const bankAccountLocalId = await ensureDefaultBankAccount(
      localCompanyId,
      `${(parsed.bank || 'Bank').toString().toUpperCase()} — ${user.company_name ?? 'Default'}`,
    )
    const persistResult = await persistTransactions(
      localCompanyId,
      bankAccountLocalId,
      parsed.lines,
      body.format,
    )

    // 3. Detect transfers
    const transferPairs = detectTransfers(parsed.lines)
    const transferIndexes = new Set<number>()
    for (const p of transferPairs) {
      if (p.confidence >= 0.85) {
        transferIndexes.add(p.out_line_index)
        transferIndexes.add(p.in_line_index)
      }
    }

    // 4. Reconcile balances if provided
    let reconciliation = null
    if (body.opening_balance !== undefined && body.closing_balance !== undefined) {
      reconciliation = reconcileBalances(parsed.lines, body.opening_balance, body.closing_balance)
    }

    // 5. Fetch US company chart of accounts (Odoo 18: uses company_ids M2M)
    let accounts: Array<{ id: number; code: string; name: string; account_type: string }> = []
    try {
      const raw = await odooAccountingAdapter.searchRead(
        'account.account',
        [['company_ids', 'in', [odooCompanyId]]],
        ['id', 'code', 'name', 'account_type'],
        { limit: 500, context: { allowed_company_ids: [odooCompanyId], company_id: odooCompanyId } },
      ) as Array<{ id: number; code: string | false; name: string; account_type: string }>
      accounts = raw.map(a => ({
        id: a.id,
        code: a.code === false ? '' : (a.code ?? ''),
        name: a.name ?? '',
        account_type: a.account_type ?? '',
      }))
    } catch (err) {
      logger.warn({ err }, 'Failed to fetch chart of accounts — classification will use generic categories')
    }

    // 6. Classify (skippable when AI key absent — still useful to see the import/dedup)
    let classification = null as null | { stats: any; classified: any[]; errors: string[] }
    if (!body.skip_classify) {
      try {
        // Filter out detected transfers so they don't become income/expense
        const linesToClassify: typeof parsed.lines = []
        const txIds: number[] = []
        for (let i = 0; i < parsed.lines.length; i++) {
          if (transferIndexes.has(i)) continue
          linesToClassify.push(parsed.lines[i])
          txIds.push(persistResult.transactionIds[i] ?? 0)
        }
        const result = await classifyTransactions(localCompanyId, linesToClassify, accounts, txIds)
        classification = result
      } catch (err) {
        logger.warn({ err }, 'AI classification failed or skipped')
      }
    }

    return reply.send({
      parsed: {
        bank: parsed.bank,
        format: parsed.format,
        total_lines: parsed.lines.length,
        parse_errors: parsed.errors,
      },
      persisted: {
        inserted: persistResult.inserted,
        skipped_duplicates: persistResult.skipped,
        bank_account_id: bankAccountLocalId,
      },
      transfers_detected: transferPairs.length,
      transfers: transferPairs.slice(0, 20),
      reconciliation,
      classification: classification
        ? {
            total: classification.stats.total,
            auto_approved: classification.stats.auto_approved,
            needs_review: classification.stats.needs_review,
            unclassified: classification.stats.unclassified,
            rule_matched: classification.stats.rule_matched,
          }
        : null,
      transactions: classification
        ? classification.classified.map((c: any) => ({
            date: c.original.date,
            description: c.original.description,
            amount: c.original.amount,
            account_name: c.account_name,
            category: c.category,
            confidence: c.confidence,
            reasoning: c.reasoning,
            source: c.source,
            auto_approved: c.confidence >= 0.8,
          }))
        : [],
      errors: classification?.errors ?? [],
    })
  })

  // ── GET /classifications ──────────────────────────────────
  // List classifications with optional status filter
  fastify.get('/classifications', async (req, reply) => {
    const user = (req as any).user
    const query = req.query as { status?: 'pending' | 'approved' | 'all' }
    const localCompanyId = await getLocalCompanyId(user.company_id)

    let rows
    if (query.status === 'pending') {
      rows = await getPendingClassifications(localCompanyId)
    } else if (query.status === 'approved') {
      rows = await db.select().from(transactionClassifications)
        .where(and(
          eq(transactionClassifications.company_id, localCompanyId),
          eq(transactionClassifications.approved, true),
        ))
        .orderBy(transactionClassifications.original_date)
    } else {
      rows = await db.select().from(transactionClassifications)
        .where(eq(transactionClassifications.company_id, localCompanyId))
        .orderBy(transactionClassifications.original_date)
    }

    return reply.send({
      classifications: rows.map(r => ({
        id: r.id,
        date: r.original_date,
        description: r.original_description,
        amount: r.original_amount,
        account_id: r.classified_account_id,
        account_name: r.classified_account_name,
        category: r.classified_category,
        confidence: r.confidence,
        source: r.classification_source,
        reasoning: r.ai_reasoning,
        approved: r.approved,
        has_journal_entry: r.odoo_move_id !== null,
      })),
      total: rows.length,
    })
  })

  // ── PUT /classifications/:id/approve ──────────────────────
  fastify.put('/classifications/:id/approve', async (req, reply) => {
    const user = (req as any).user
    const { id } = req.params as { id: string }
    const body = req.body as {
      account_id?: number
      account_name?: string
      category?: string
    } | undefined

    const update = body?.account_id ? {
      account_id: body.account_id,
      account_name: body.account_name ?? '',
      category: body.category ?? '',
    } : undefined

    await approveClassification(Number(id), user.uid, update)

    // If user corrected the classification, learn a rule
    if (update) {
      const [classification] = await db.select().from(transactionClassifications)
        .where(eq(transactionClassifications.id, Number(id))).limit(1)
      if (classification) {
        // Extract vendor keyword from description (first 2 words usually)
        const words = classification.original_description.split(/\s+/).slice(0, 2).join(' ')
        if (words.length >= 3) {
          await learnRule(
            classification.company_id,
            words,
            update.account_id,
            update.account_name,
            update.category,
          )
        }
      }
    }

    return reply.send({ ok: true, id: Number(id) })
  })

  // ── POST /bulk-approve ────────────────────────────────────
  fastify.post('/bulk-approve', async (req, reply) => {
    const user = (req as any).user
    const body = req.body as { ids: number[] }

    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      return reply.status(400).send({ error: 'ids array required' })
    }

    await bulkApprove(body.ids, user.uid)
    return reply.send({ ok: true, approved_count: body.ids.length })
  })

  // ── POST /generate-journal-entries ────────────────────────
  // Create journal entries in Odoo from approved classifications.
  // Pass auto_post=true to call action_post on the created moves so they hit
  // the balance sheet / P&L immediately instead of sitting in draft.
  fastify.post('/generate-journal-entries', async (req, reply) => {
    const user = (req as any).user
    const body = req.body as {
      bank_journal_id: number
      bank_account_id: number
      auto_post?: boolean
      skip_transfers?: boolean
    }

    if (!body.bank_journal_id || !body.bank_account_id) {
      return reply.status(400).send({ error: 'bank_journal_id and bank_account_id required' })
    }

    const localCompanyId = await getLocalCompanyId(user.company_id)
    const result = await generateJournalEntries(
      localCompanyId,
      user.company_id,
      body.bank_journal_id,
      body.bank_account_id,
      { auto_post: body.auto_post === true, skip_transfers: body.skip_transfers !== false },
    )

    const created = result.created.filter(r => r.odoo_move_id)
    const failed = result.created.filter(r => !r.odoo_move_id)

    return reply.send({
      created: created.length,
      posted: created.filter(r => r.posted).length,
      failed: failed.length,
      entries: created.map(r => ({
        classification_id: r.classification_id,
        odoo_move_id: r.odoo_move_id,
        posted: r.posted ?? false,
      })),
      errors: result.errors,
    })
  })

  // ── POST /reconcile ───────────────────────────────────────
  // Parse a statement and report whether it balances against expected opening
  // and closing balances. Doesn't persist anything — useful as a pre-flight
  // check before /import-and-classify.
  fastify.post('/reconcile', async (req, reply) => {
    const body = req.body as {
      content: string
      format: 'csv' | 'ofx'
      bank?: string
      opening_balance: number
      closing_balance: number
    }
    if (!body.content || !body.format || body.opening_balance === undefined || body.closing_balance === undefined) {
      return reply.status(400).send({ error: 'content, format, opening_balance, closing_balance required' })
    }
    const parsed = body.format === 'ofx'
      ? parseOFX(body.content)
      : parseCSV(body.content, body.bank ?? 'generic_us')

    const result = reconcileBalances(parsed.lines, body.opening_balance, body.closing_balance)
    return reply.send({
      parsed: {
        total_lines: parsed.lines.length,
        parse_errors: parsed.errors,
      },
      reconciliation: result,
      transfers_detected: detectTransfers(parsed.lines).length,
    })
  })

  // ── GET /summary?year=YYYY ────────────────────────────────
  // Executive summary for a year — totals, monthly breakdown, top vendors.
  // Works off bank_transactions so it shows value even before AI classification.
  fastify.get('/summary', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const query = req.query as { year?: string }
    const year = query.year ? Number(query.year) : new Date().getFullYear()
    if (Number.isNaN(year)) {
      return reply.status(400).send({ error: 'invalid year' })
    }
    const summary = await buildYearSummary(localCompanyId, year)
    return reply.send(summary)
  })

  // ── POST /classifications/:id/mark-transfer ───────────────
  // Flag a classification as an inter-account transfer so generate-journal-entries
  // skips it. Useful when the auto-detector misses a transfer or the user imports
  // statements from both sides of the transfer.
  fastify.post('/classifications/:id/mark-transfer', async (req, reply) => {
    const { id } = req.params as { id: string }
    await db.update(transactionClassifications)
      .set({
        classified_category: 'transfer',
        approved: true,
        approved_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(transactionClassifications.id, Number(id)))
    return reply.send({ ok: true, id: Number(id), category: 'transfer' })
  })

  // ── GET /classification-rules ─────────────────────────────
  fastify.get('/classification-rules', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)

    const rules = await db.select().from(classificationRules)
      .where(eq(classificationRules.company_id, localCompanyId))
      .orderBy(classificationRules.hit_count)

    return reply.send({
      rules: rules.map(r => ({
        id: r.id,
        pattern: r.vendor_pattern,
        account_id: r.account_id,
        account_name: r.account_name,
        category: r.category,
        hit_count: r.hit_count,
        last_used: r.last_used_at,
      })),
    })
  })

  // ── DELETE /classification-rules/:id ──────────────────────
  fastify.delete('/classification-rules/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    await db.delete(classificationRules)
      .where(eq(classificationRules.id, Number(id)))
    return reply.send({ ok: true })
  })

  // ── POST /setup ───────────────────────────────────────────
  // Initialize US GAAP chart of accounts and journals for a new US company
  fastify.post('/setup', async (req, reply) => {
    const user = (req as any).user
    const odooCompanyId = user.company_id

    const results = { accounts_created: 0, journals_created: 0, errors: [] as string[] }

    // 1. Create chart of accounts in Odoo
    // Odoo 18: account.account uses `company_ids` (M2M). The `code` field is
    // company-dependent (stored in account.code.mapping), so we must create
    // the account first, then write `code` with company_id in the context.
    const companyContext = { allowed_company_ids: [odooCompanyId], company_id: odooCompanyId }
    for (const acct of US_GAAP_CHART) {
      try {
        // Odoo 18: must pass `code` at creation to satisfy validator ("code
        // must be set for all companies"), but the value doesn't persist.
        // After creation, write the code with company_id in context.
        const accountId = await odooAccountingAdapter.create(
          'account.account',
          {
            code: acct.code,
            name: acct.name,
            account_type: acct.account_type,
            reconcile: acct.reconcile,
            company_ids: [[6, 0, [odooCompanyId]]],
          },
          companyContext,
        )
        if (accountId) {
          // NOTE: Odoo 18 stores account.account.code in account.code.mapping
          // (company-dependent). Both execute_kw and /web/dataset/call_kw with
          // company context return success but don't persist the mapping when
          // called from the BFF's internal Docker network. This needs further
          // investigation — possibly a worker/transaction issue. For now, the
          // account name and account_type are set correctly; codes must be
          // configured via Odoo's UI chart template flow or direct RPC.
          await odooAccountingAdapter.write(
            'account.account',
            [accountId],
            { code: acct.code },
            companyContext,
          )
          results.accounts_created++
        } else {
          results.errors.push(`Account ${acct.code}: Odoo create returned null`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown'
        if (!msg.includes('unique') && !msg.includes('duplicate')) {
          results.errors.push(`Account ${acct.code}: ${msg}`)
        }
      }
    }

    // 2. Create journals
    for (const journal of US_JOURNALS) {
      try {
        await odooAccountingAdapter.create('account.journal', {
          name: journal.name,
          code: journal.code,
          type: journal.type,
          company_id: odooCompanyId,
        })
        results.journals_created++
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown'
        if (!msg.includes('unique') && !msg.includes('duplicate')) {
          results.errors.push(`Journal ${journal.code}: ${msg}`)
        }
      }
    }

    logger.info({ odooCompanyId, ...results }, 'US company setup complete')

    return reply.send(results)
  })
}
