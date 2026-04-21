/**
 * CUENTAX — Shared Accounting Routes
 * ====================================
 * Country-agnostic endpoints that work for BOTH Chile and USA companies.
 * Country context drives: currency, AI prompt language, default bank parser,
 * and journal generation behavior.
 *
 * Base: /api/v1/accounting
 *
 * Routes:
 *   POST /import-and-classify   Upload statement → dedup → detect transfers/refunds → AI classify
 *   POST /reconcile             Pre-flight balance check (no persistence)
 *   GET  /summary?year=YYYY     Year summary with monthly breakdown + top vendors
 *   POST /generate-entries      Create journal entries in Odoo
 *   GET  /classifications       List with status filter
 *   PUT  /classifications/:id/approve
 *   POST /classifications/:id/mark-transfer
 *   POST /bulk-approve
 *   GET  /classification-rules
 *   DELETE /classification-rules/:id
 *   GET  /pnl?year=YYYY&month=M  P&L from posted Odoo journal entries
 */

import type { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { authGuard } from '@/middlewares/auth-guard'
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
  type ClassifyCountry,
} from '@/services/ai-classification.service'
import { generateJournalEntries } from '@/services/auto-journal.service'
import {
  persistTransactions,
  reconcileBalances,
  detectTransfers,
  detectRefunds,
  buildYearSummary,
  ensureDefaultBankAccount,
} from '@/services/bank-reconciliation.service'
import { generatePnlPdf, type PnlData } from '@/services/pnl-pdf.service'
import { companies } from '@/db/schema'
import { getLocalCompanyId } from '@/core/company-resolver'

interface AuthedUser {
  uid: number
  company_id: number
  company_name: string
  country_code: string
  currency: string
  locale: string
}

/** Pick sensible defaults from country when caller doesn't override. */
function countryDefaults(country: string): {
  classifyCountry: ClassifyCountry
  currency: 'USD' | 'CLP'
  defaultBank: string
} {
  if (country === 'US') {
    return { classifyCountry: 'US', currency: 'USD', defaultBank: 'generic_us' }
  }
  return { classifyCountry: 'CL', currency: 'CLP', defaultBank: 'generic' }
}

export async function accountingRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  // ── POST /import-and-classify ─────────────────────────────
  fastify.post('/import-and-classify', async (req, reply) => {
    const user = (req as any).user as AuthedUser
    const body = req.body as {
      content: string
      format: 'csv' | 'ofx'
      bank?: string
      opening_balance?: number
      closing_balance?: number
      skip_classify?: boolean
      /** Override country defaults (normally inferred from JWT). */
      currency?: 'USD' | 'CLP'
    }

    if (!body.content || !body.format) {
      return reply.status(400).send({ error: 'content and format are required' })
    }

    const defaults = countryDefaults(user.country_code)
    const currency = body.currency ?? defaults.currency
    const classifyCountry = defaults.classifyCountry
    const bank = body.bank ?? defaults.defaultBank

    const parsed = body.format === 'ofx' ? parseOFX(body.content) : parseCSV(body.content, bank)

    if (parsed.lines.length === 0) {
      return reply.status(400).send({
        error: 'no_transactions',
        message: 'No transactions could be parsed from the file',
        parse_errors: parsed.errors,
      })
    }

    const localCompanyId = await getLocalCompanyId(user.company_id)
    const bankAccountLocalId = await ensureDefaultBankAccount(
      localCompanyId,
      `${parsed.bank?.toUpperCase() || 'BANK'} — ${user.company_name ?? 'Default'}`,
      currency,
    )

    const persistResult = await persistTransactions(
      localCompanyId,
      bankAccountLocalId,
      parsed.lines,
      body.format,
      currency,
    )

    const transferPairs = detectTransfers(parsed.lines)
    const refundPairs = detectRefunds(parsed.lines)
    const transferIndexes = new Set<number>()
    for (const p of transferPairs) {
      if (p.confidence >= 0.85) {
        transferIndexes.add(p.out_line_index)
        transferIndexes.add(p.in_line_index)
      }
    }
    // Refunds aren't skipped here — the AI handles them via prompt guidance
    // and they still become journal entries (just against the original expense)

    let reconciliation = null
    if (body.opening_balance !== undefined && body.closing_balance !== undefined) {
      reconciliation = reconcileBalances(parsed.lines, body.opening_balance, body.closing_balance)
    }

    // Fetch chart of accounts (Odoo 18 company_ids M2M)
    let accounts: Array<{ id: number; code: string; name: string; account_type: string }> = []
    try {
      const raw = await odooAccountingAdapter.searchRead(
        'account.account',
        [['company_ids', 'in', [user.company_id]]],
        ['id', 'code', 'name', 'account_type'],
        { limit: 500, context: { allowed_company_ids: [user.company_id], company_id: user.company_id } },
      ) as Array<{ id: number; code: string | false; name: string; account_type: string }>
      accounts = raw.map(a => ({
        id: a.id,
        code: a.code === false ? '' : (a.code ?? ''),
        name: a.name ?? '',
        account_type: a.account_type ?? '',
      }))
    } catch (err) {
      logger.warn({ err }, 'Failed to fetch chart of accounts')
    }

    let classification = null as null | { stats: any; classified: any[]; errors: string[] }
    if (!body.skip_classify) {
      try {
        const linesToClassify: typeof parsed.lines = []
        const txIds: number[] = []
        for (let i = 0; i < parsed.lines.length; i++) {
          if (transferIndexes.has(i)) continue
          linesToClassify.push(parsed.lines[i])
          txIds.push(persistResult.transactionIds[i] ?? 0)
        }
        const result = await classifyTransactions(
          localCompanyId,
          linesToClassify,
          accounts,
          txIds,
          classifyCountry,
        )
        classification = result
      } catch (err) {
        logger.warn({ err }, 'AI classification failed or skipped')
      }
    }

    return reply.send({
      country: user.country_code,
      currency,
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
      refunds_detected: refundPairs.length,
      refunds: refundPairs.slice(0, 20),
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

  // ── POST /reconcile ───────────────────────────────────────
  fastify.post('/reconcile', async (req, reply) => {
    const user = (req as any).user as AuthedUser
    const defaults = countryDefaults(user.country_code)
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
      : parseCSV(body.content, body.bank ?? defaults.defaultBank)

    return reply.send({
      parsed: {
        total_lines: parsed.lines.length,
        parse_errors: parsed.errors,
      },
      reconciliation: reconcileBalances(parsed.lines, body.opening_balance, body.closing_balance),
      transfers_detected: detectTransfers(parsed.lines).length,
      refunds_detected: detectRefunds(parsed.lines).length,
    })
  })

  // ── GET /summary?year=YYYY ────────────────────────────────
  fastify.get('/summary', async (req, reply) => {
    const user = (req as any).user as AuthedUser
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const query = req.query as { year?: string }
    const year = query.year ? Number(query.year) : new Date().getFullYear()
    if (Number.isNaN(year)) {
      return reply.status(400).send({ error: 'invalid year' })
    }
    const { currency } = countryDefaults(user.country_code)
    const summary = await buildYearSummary(localCompanyId, year, currency)
    return reply.send({ ...summary, currency, country: user.country_code })
  })

  // ── GET /pnl?year=YYYY&month=M ────────────────────────────
  // Accrual-basis P&L computed from posted journal entries in Odoo
  fastify.get('/pnl', async (req, reply) => {
    const user = (req as any).user as AuthedUser
    const query = req.query as { year?: string; month?: string }
    const year = query.year ? Number(query.year) : new Date().getFullYear()
    const month = query.month ? Number(query.month) : undefined
    if (Number.isNaN(year)) return reply.status(400).send({ error: 'invalid year' })

    const dateFrom = month
      ? `${year}-${String(month).padStart(2, '0')}-01`
      : `${year}-01-01`
    const dateTo = month
      ? `${year}-${String(month).padStart(2, '0')}-31`
      : `${year}-12-31`

    try {
      const lines = await odooAccountingAdapter.searchRead(
        'account.move.line',
        [
          ['company_id', '=', user.company_id],
          ['date', '>=', dateFrom],
          ['date', '<=', dateTo],
          ['parent_state', '=', 'posted'],
        ],
        ['account_id', 'debit', 'credit', 'balance'],
        { limit: 2000, context: { allowed_company_ids: [user.company_id] } },
      ) as Array<{ account_id: [number, string]; debit: number; credit: number; balance: number }>

      const revenue = new Map<string, { debit: number; credit: number }>()
      const expenses = new Map<string, { debit: number; credit: number }>()
      const other = new Map<string, { debit: number; credit: number }>()

      for (const line of lines) {
        if (!line.account_id) continue
        const label = line.account_id[1] ?? 'Unknown'
        const codePart = label.split(' ')[0]
        const bucket = codePart.startsWith('4') ? revenue
          : (codePart.startsWith('5') || codePart.startsWith('6') || codePart.startsWith('7')) ? expenses
          : other
        const cur = bucket.get(label) ?? { debit: 0, credit: 0 }
        cur.debit += Number(line.debit) || 0
        cur.credit += Number(line.credit) || 0
        bucket.set(label, cur)
      }

      const toArray = (m: Map<string, { debit: number; credit: number }>) =>
        [...m.entries()]
          .map(([account, v]) => ({
            account,
            debit: Number(v.debit.toFixed(2)),
            credit: Number(v.credit.toFixed(2)),
            balance: Number((v.credit - v.debit).toFixed(2)),
          }))
          .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))

      const revArr = toArray(revenue)
      const expArr = toArray(expenses)
      const totalRevenue = revArr.reduce((s, x) => s + x.balance, 0)
      const totalExpenses = expArr.reduce((s, x) => s - x.balance, 0) // expenses have debit balance (positive = more expense)

      return reply.send({
        country: user.country_code,
        currency: countryDefaults(user.country_code).currency,
        period: { year, month: month ?? null, from: dateFrom, to: dateTo },
        revenue: revArr,
        expenses: expArr,
        other: toArray(other),
        totals: {
          revenue: Number(totalRevenue.toFixed(2)),
          expenses: Number(totalExpenses.toFixed(2)),
          net_income: Number((totalRevenue - totalExpenses).toFixed(2)),
        },
        line_count: lines.length,
      })
    } catch (err) {
      logger.error({ err }, 'P&L generation failed')
      return reply.status(500).send({ error: 'pnl_failed', message: err instanceof Error ? err.message : 'unknown' })
    }
  })

  // ── GET /pnl.pdf?year=YYYY&month=M ────────────────────────
  // Returns the same P&L data as /pnl but rendered as a downloadable PDF.
  fastify.get('/pnl.pdf', async (req, reply) => {
    const user = (req as any).user as AuthedUser
    const query = req.query as { year?: string; month?: string }
    const year = query.year ? Number(query.year) : new Date().getFullYear()
    const month = query.month ? Number(query.month) : undefined
    if (Number.isNaN(year)) return reply.status(400).send({ error: 'invalid year' })

    const dateFrom = month
      ? `${year}-${String(month).padStart(2, '0')}-01`
      : `${year}-01-01`
    const dateTo = month
      ? `${year}-${String(month).padStart(2, '0')}-31`
      : `${year}-12-31`

    // Fetch posted move lines
    const lines = await odooAccountingAdapter.searchRead(
      'account.move.line',
      [
        ['company_id', '=', user.company_id],
        ['date', '>=', dateFrom],
        ['date', '<=', dateTo],
        ['parent_state', '=', 'posted'],
      ],
      ['account_id', 'debit', 'credit', 'balance'],
      { limit: 5000, context: { allowed_company_ids: [user.company_id] } },
    ) as Array<{ account_id: [number, string]; debit: number; credit: number; balance: number }>

    const revenue = new Map<string, { debit: number; credit: number }>()
    const expenses = new Map<string, { debit: number; credit: number }>()
    const other = new Map<string, { debit: number; credit: number }>()
    for (const line of lines) {
      if (!line.account_id) continue
      const label = line.account_id[1] ?? 'Unknown'
      const codePart = label.split(' ')[0]
      const bucket = codePart.startsWith('4') ? revenue
        : (codePart.startsWith('5') || codePart.startsWith('6') || codePart.startsWith('7')) ? expenses
        : other
      const cur = bucket.get(label) ?? { debit: 0, credit: 0 }
      cur.debit += Number(line.debit) || 0
      cur.credit += Number(line.credit) || 0
      bucket.set(label, cur)
    }
    const toArray = (m: Map<string, { debit: number; credit: number }>) =>
      [...m.entries()]
        .map(([account, v]) => ({
          account,
          debit: Number(v.debit.toFixed(2)),
          credit: Number(v.credit.toFixed(2)),
          balance: Number((v.credit - v.debit).toFixed(2)),
        }))
        .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))

    const revArr = toArray(revenue)
    const expArr = toArray(expenses)
    const totalRevenue = revArr.reduce((s, x) => s + x.balance, 0)
    const totalExpenses = expArr.reduce((s, x) => s - x.balance, 0)

    // Fetch company info for header
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const [company] = await db.select().from(companies)
      .where(eq(companies.id, localCompanyId)).limit(1)

    const country = (user.country_code === 'US' ? 'US' : 'CL') as 'US' | 'CL'
    const { currency } = countryDefaults(country)

    const pdfData: PnlData = {
      country,
      currency,
      company_name: company?.razon_social ?? user.company_name ?? 'Company',
      company_tax_id: company?.tax_id ?? company?.rut ?? '',
      period: { year, month: month ?? null, from: dateFrom, to: dateTo },
      revenue: revArr,
      expenses: expArr,
      other: toArray(other),
      totals: {
        revenue: Number(totalRevenue.toFixed(2)),
        expenses: Number(totalExpenses.toFixed(2)),
        net_income: Number((totalRevenue - totalExpenses).toFixed(2)),
      },
    }

    const buffer = await generatePnlPdf(pdfData)
    const filename = `pnl-${year}${month ? '-' + String(month).padStart(2, '0') : ''}.pdf`
    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    return reply.send(buffer)
  })

  // ── POST /generate-entries ────────────────────────────────
  fastify.post('/generate-entries', async (req, reply) => {
    const user = (req as any).user as AuthedUser
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

  // ── GET /classifications ──────────────────────────────────
  fastify.get('/classifications', async (req, reply) => {
    const user = (req as any).user as AuthedUser
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
      country: user.country_code,
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
    const user = (req as any).user as AuthedUser
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

    if (update) {
      const [classification] = await db.select().from(transactionClassifications)
        .where(eq(transactionClassifications.id, Number(id))).limit(1)
      if (classification) {
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
    const user = (req as any).user as AuthedUser
    const body = req.body as { ids: number[] }
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      return reply.status(400).send({ error: 'ids array required' })
    }
    await bulkApprove(body.ids, user.uid)
    return reply.send({ ok: true, approved_count: body.ids.length })
  })

  // ── POST /classifications/:id/mark-transfer ───────────────
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
    const user = (req as any).user as AuthedUser
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

  // ── GET /vendor-spend.csv?year=YYYY&threshold=600 ─────────
  // Export vendor spend as CSV. For US 1099-NEC compliance the threshold
  // defaults to $600/year (IRS requirement for contractor reporting).
  // Works for CL too (useful for annual supplier summaries).
  fastify.get('/vendor-spend.csv', async (req, reply) => {
    const user = (req as any).user as AuthedUser
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const query = req.query as { year?: string; threshold?: string }
    const year = query.year ? Number(query.year) : new Date().getFullYear()
    const threshold = query.threshold ? Number(query.threshold) : (user.country_code === 'US' ? 600 : 0)
    const { currency } = countryDefaults(user.country_code)

    const summary = await buildYearSummary(localCompanyId, year, currency)
    const vendors = summary.top_vendors_by_spend.filter(v => v.total >= threshold)

    const rows: string[] = [
      user.country_code === 'US'
        ? 'Vendor,Year,Total Paid (USD),Transaction Count,Over 1099 Threshold'
        : 'Proveedor,Año,Total Pagado (CLP),Cantidad Transacciones,Sobre Umbral',
    ]
    for (const v of vendors) {
      const amount = currency === 'USD' ? v.total.toFixed(2) : Math.round(v.total).toString()
      rows.push(`"${v.vendor.replace(/"/g, '""')}",${year},${amount},${v.count},${v.total >= 600 ? 'Yes' : 'No'}`)
    }

    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="vendor-spend-${year}.csv"`)
    return reply.send(rows.join('\n'))
  })

  // ── POST /setup ───────────────────────────────────────────
  // Country-aware chart of accounts + journal setup. Picks the right template
  // based on the JWT's country_code. Safe to re-run — duplicates are ignored.
  fastify.post('/setup', async (req, reply) => {
    const user = (req as any).user as AuthedUser
    const odooCompanyId = user.company_id
    const country = user.country_code === 'US' ? 'US' : 'CL'

    // Dynamic import keeps the Chilean template out of the US bundle and vice versa
    const { US_GAAP_CHART, US_JOURNALS } = await import('@/data/chart-of-accounts-us-gaap.js')
    const { CL_CHART, CL_JOURNALS } = await import('@/data/chart-of-accounts-cl.js')

    const chart = country === 'US' ? US_GAAP_CHART : CL_CHART
    const journals = country === 'US' ? US_JOURNALS : CL_JOURNALS

    const results = { accounts_created: 0, journals_created: 0, errors: [] as string[] }
    const companyContext = { allowed_company_ids: [odooCompanyId], company_id: odooCompanyId }

    // Odoo 18: company-dependent fields (account.account.code via
    // account.code.mapping) only persist reliably when env.company matches
    // the target company. env.company comes from the user's default, not the
    // request context. So we flip the admin's default company for the
    // duration of the writes, then restore it.
    await odooAccountingAdapter.withAdminDefaultCompany(odooCompanyId, async () => {
      for (const acct of chart) {
        try {
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
            // With the user default aligned, the code now persists via plain
            // write — no context shenanigans needed.
            await odooAccountingAdapter.write(
              'account.account',
              [accountId],
              { code: acct.code },
            )
            results.accounts_created++
          } else {
            results.errors.push(`Account ${acct.code}: create returned null`)
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown'
          if (!msg.includes('unique') && !msg.includes('duplicate')) {
            results.errors.push(`Account ${acct.code}: ${msg}`)
          }
        }
      }
    })

    for (const journal of journals) {
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

    logger.info({ odooCompanyId, country, ...results }, 'Company accounting setup complete')
    return reply.send({ ...results, country })
  })
}
