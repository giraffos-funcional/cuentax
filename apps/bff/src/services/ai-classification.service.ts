/**
 * CUENTAX — AI Transaction Classification Service
 * =================================================
 * Uses Claude to classify bank transactions into accounting categories.
 * Supports learned rules for repeat vendors and confidence-based approval.
 */

import Anthropic from '@anthropic-ai/sdk'
import { eq, and, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { transactionClassifications, classificationRules } from '@/db/schema'
import { logger } from '@/core/logger'
import type { ParsedStatementLine } from './bank-import.service'

// ── Types ────────────────────────────────────────────────────
export interface ClassifiedTransaction {
  original: ParsedStatementLine
  account_id: number
  account_name: string
  category: string
  confidence: number    // 0.0 to 1.0
  reasoning: string
  source: 'ai' | 'rule'
}

export interface ClassificationBatch {
  classified: ClassifiedTransaction[]
  errors: string[]
  stats: {
    total: number
    auto_approved: number   // confidence >= 0.8
    needs_review: number    // confidence 0.5 - 0.8
    unclassified: number    // confidence < 0.5
    rule_matched: number    // matched by learned rules
  }
}

interface ChartAccount {
  id: number
  code: string
  name: string
  account_type: string
}

// ── Constants ────────────────────────────────────────────────
const BATCH_SIZE = 30  // Transactions per Claude call
const HIGH_CONFIDENCE = 0.8
const LOW_CONFIDENCE = 0.5

export type ClassifyCountry = 'US' | 'CL'

const SYSTEM_PROMPT_US = `You are an expert US small business bookkeeper. Your task is to classify bank transactions into the correct accounting accounts.

RULES:
- Positive amounts are DEPOSITS (income, transfers in, refunds received)
- Negative amounts are PAYMENTS (expenses, transfers out, purchases)
- Always use the most specific account available from the chart of accounts
- If uncertain, use a general category and indicate lower confidence
- Mark suspected inter-account transfers with category="transfer" — these should not hit income/expense

COMMON PATTERNS (use as hints, not absolutes):
- STRIPE, SQUARE, SHOPIFY → Revenue / Sales
- GUSTO, ADP, PAYCHEX → Payroll Expense
- AWS, GOOGLE CLOUD, AZURE → Software / Cloud Services
- UBER, LYFT → Travel / Transportation
- DOORDASH, GRUBHUB → Meals & Entertainment
- COMCAST, ATT, VERIZON → Utilities / Telecom
- STATE FARM, GEICO → Insurance
- IRS, STATE TAX → Tax Payments
- CHASE TRANSFER, ZELLE → Bank Transfers (category="transfer")
- INTEREST PAYMENT → Interest Expense or Interest Income
- ATM WITHDRAWAL → Owner's Draw or Petty Cash

REFUND DETECTION:
- Positive amount with words like "REFUND", "REVERSAL", "CREDIT" → original vendor's account (reduces that expense)
- Reversal of a prior expense is NOT revenue

For each transaction, respond with a JSON object using the classify_transactions tool.`

const SYSTEM_PROMPT_CL = `Eres un contador chileno experto en PYMES y normativa SII. Tu tarea es clasificar transacciones bancarias en las cuentas contables correctas según el plan chileno.

REGLAS:
- Montos positivos son ABONOS (ingresos, transferencias recibidas, devoluciones)
- Montos negativos son CARGOS (gastos, pagos, compras)
- Usa la cuenta más específica disponible del plan de cuentas
- Si hay duda, usa una categoría general y baja la confianza
- Marca transferencias entre cuentas propias con category="transfer" (no son ingresos ni gastos)

PATRONES COMUNES (sugerencias, no absolutos):
- TRANSBANK, WEBPAY, GETNET → Ingresos por Ventas
- MERCADOPAGO, FLOW, KHIPU → Ingresos (pasarelas de pago)
- SII, TESORERIA GENERAL DE LA REPUBLICA (TGR) → Pago Impuestos
- PREVIRED, AFC, FONASA, ISAPRE → Imposiciones / Previsión
- ENEL, CGE, AGUAS ANDINAS, ESSBIO → Servicios Básicos
- MOVISTAR, ENTEL, CLARO, WOM, VTR → Telefonía / Internet
- UBER EATS, PEDIDOSYA, RAPPI → Alimentación / Viáticos
- COPEC, SHELL, SERVIPAG-PEAJE → Combustible / Peajes
- LIDER, JUMBO, SANTA ISABEL, UNIMARC → Insumos
- LATAM, SKY, JETSMART → Pasajes / Viajes
- AWS, GOOGLE, MICROSOFT, ADOBE → Servicios TI / Software
- TRANSFERENCIA A, ABONO A → posible transfer (category="transfer")
- CAJERO, GIRO, RETIRO → Retiro de Socio / Caja Chica
- COMISION BANCARIA → Gastos Bancarios

DEDUCIBILIDAD SII:
- Gastos con IVA y factura electrónica son necesarios para producir la renta (deducibles)
- Compras de supermercado SIN documento tributario pueden NO ser deducibles
- Gastos personales del socio NO son deducibles
- Indica en "reasoning" si el gasto parece deducible o no

Responde usando la herramienta classify_transactions. Todos los montos en CLP.`

function getPrompt(country: ClassifyCountry): string {
  return country === 'CL' ? SYSTEM_PROMPT_CL : SYSTEM_PROMPT_US
}

// ── Service ──────────────────────────────────────────────────
let anthropic: Anthropic | null = null

function getClient(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic()
  }
  return anthropic
}

/**
 * Try to match transactions against learned rules first.
 * Returns matched transactions and remaining unmatched ones.
 */
async function applyRules(
  companyId: number,
  lines: ParsedStatementLine[],
): Promise<{ matched: ClassifiedTransaction[]; unmatched: ParsedStatementLine[] }> {
  const rules = await db.select().from(classificationRules)
    .where(eq(classificationRules.company_id, companyId))

  if (rules.length === 0) return { matched: [], unmatched: lines }

  const matched: ClassifiedTransaction[] = []
  const unmatched: ParsedStatementLine[] = []

  for (const line of lines) {
    const desc = line.description.toUpperCase()
    let ruleMatch = null

    for (const rule of rules) {
      const pattern = rule.vendor_pattern.toUpperCase()
      if (desc.includes(pattern)) {
        ruleMatch = rule
        break
      }
    }

    if (ruleMatch) {
      matched.push({
        original: line,
        account_id: ruleMatch.account_id,
        account_name: ruleMatch.account_name ?? '',
        category: ruleMatch.category ?? '',
        confidence: 0.95,
        reasoning: `Matched rule: "${ruleMatch.vendor_pattern}"`,
        source: 'rule',
      })

      // Update rule hit count (non-blocking)
      db.update(classificationRules)
        .set({
          hit_count: sql`${classificationRules.hit_count} + 1`,
          last_used_at: new Date(),
        })
        .where(eq(classificationRules.id, ruleMatch.id))
        .catch(() => {})
    } else {
      unmatched.push(line)
    }
  }

  return { matched, unmatched }
}

/**
 * Classify transactions using Claude AI.
 * Sends batches of transactions with the company's chart of accounts.
 */
async function classifyWithAI(
  lines: ParsedStatementLine[],
  accounts: ChartAccount[],
  country: ClassifyCountry = 'US',
): Promise<ClassifiedTransaction[]> {
  const client = getClient()
  const results: ClassifiedTransaction[] = []
  const currencySymbol = country === 'CL' ? '$' : '$'
  const currencyCode = country === 'CL' ? 'CLP' : 'USD'

  // Process in batches
  for (let i = 0; i < lines.length; i += BATCH_SIZE) {
    const batch = lines.slice(i, i + BATCH_SIZE)

    const accountList = accounts.map(a => `${a.code} - ${a.name} (${a.account_type})`).join('\n')
    const transactionList = batch.map((t, idx) => (
      `${idx + 1}. Date: ${t.date} | Description: "${t.description}" | Amount: ${currencySymbol}${t.amount.toFixed(2)} ${currencyCode} | Ref: ${t.reference}`
    )).join('\n')

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: getPrompt(country),
        tools: [{
          name: 'classify_transactions',
          description: 'Classify each bank transaction into an accounting account',
          input_schema: {
            type: 'object' as const,
            properties: {
              classifications: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    index: { type: 'number', description: 'Transaction index (1-based)' },
                    account_code: { type: 'string', description: 'Account code from chart of accounts' },
                    account_name: { type: 'string', description: 'Account name' },
                    category: { type: 'string', description: 'Category (Revenue, Expense, Transfer, etc.)' },
                    confidence: { type: 'number', description: 'Confidence 0.0-1.0' },
                    reasoning: { type: 'string', description: 'Brief explanation' },
                  },
                  required: ['index', 'account_code', 'account_name', 'category', 'confidence', 'reasoning'],
                },
              },
            },
            required: ['classifications'],
          },
        }],
        tool_choice: { type: 'tool', name: 'classify_transactions' },
        messages: [{
          role: 'user',
          content: `Chart of Accounts:\n${accountList}\n\nTransactions to classify:\n${transactionList}`,
        }],
      })

      // Extract tool use result
      const toolUse = response.content.find(c => c.type === 'tool_use')
      if (toolUse && toolUse.type === 'tool_use') {
        const input = toolUse.input as { classifications: Array<{
          index: number; account_code: string; account_name: string;
          category: string; confidence: number; reasoning: string;
        }> }

        for (const c of input.classifications) {
          const txIdx = c.index - 1
          if (txIdx >= 0 && txIdx < batch.length) {
            const account = accounts.find(a => a.code === c.account_code)
            results.push({
              original: batch[txIdx],
              account_id: account?.id ?? 0,
              account_name: c.account_name,
              category: c.category,
              confidence: Math.min(1, Math.max(0, c.confidence)),
              reasoning: c.reasoning,
              source: 'ai',
            })
          }
        }
      }
    } catch (err) {
      logger.error({ err, batchStart: i, batchSize: batch.length }, 'AI classification batch failed')
      // Add unclassified entries for failed batch
      for (const line of batch) {
        results.push({
          original: line,
          account_id: 0,
          account_name: 'Uncategorized',
          category: 'Unknown',
          confidence: 0,
          reasoning: 'AI classification failed',
          source: 'ai',
        })
      }
    }
  }

  return results
}

/**
 * Main classification entry point.
 * 1. Skip lines that already have a classification linked to their
 *    bank_transaction_id (prevents duplicate work on re-imports)
 * 2. Apply learned rules to known vendors
 * 3. Send remaining transactions to Claude for classification
 * 4. Save results to transaction_classifications table
 *
 * @param bankTransactionIds Optional: per-line DB ids from bank_transactions.
 *        When provided, classifications are linked to them and re-imports
 *        are deduped by skipping lines whose bank_transaction_id already has
 *        a classification.
 */
export async function classifyTransactions(
  companyId: number,
  lines: ParsedStatementLine[],
  accounts: ChartAccount[],
  bankTransactionIds?: number[],
  country: ClassifyCountry = 'US',
): Promise<ClassificationBatch> {
  const errors: string[] = []

  // 0. Dedup against existing classifications linked to the same bank transactions
  let linesToProcess = lines
  let txIdsToProcess = bankTransactionIds
  if (bankTransactionIds && bankTransactionIds.length === lines.length) {
    const validIds = bankTransactionIds.filter(id => id > 0)
    if (validIds.length > 0) {
      const existing = await db.select({
        bank_transaction_id: transactionClassifications.bank_transaction_id,
      })
        .from(transactionClassifications)
        .where(and(
          eq(transactionClassifications.company_id, companyId),
          sql`${transactionClassifications.bank_transaction_id} = ANY(${validIds})`,
        ))
      const alreadyClassified = new Set(existing.map(r => r.bank_transaction_id))

      linesToProcess = []
      txIdsToProcess = []
      for (let i = 0; i < lines.length; i++) {
        const txId = bankTransactionIds[i]
        if (!alreadyClassified.has(txId)) {
          linesToProcess.push(lines[i])
          txIdsToProcess.push(txId)
        }
      }
      if (linesToProcess.length < lines.length) {
        logger.info(
          { companyId, skipped: lines.length - linesToProcess.length },
          'Skipped already-classified transactions',
        )
      }
    }
  }

  // 1. Apply learned rules
  const { matched: ruleMatched, unmatched } = await applyRules(companyId, linesToProcess)

  // 2. AI classification for unmatched
  let aiClassified: ClassifiedTransaction[] = []
  if (unmatched.length > 0 && accounts.length > 0) {
    aiClassified = await classifyWithAI(unmatched, accounts, country)
  }

  const allClassified = [...ruleMatched, ...aiClassified]

  // Build lookup: line → bank_transaction_id
  const txIdByKey = new Map<string, number>()
  if (txIdsToProcess) {
    for (let i = 0; i < linesToProcess.length; i++) {
      const line = linesToProcess[i]
      txIdByKey.set(line.external_id, txIdsToProcess[i])
    }
  }

  // 3. Save to DB
  const dbRows = allClassified.map(c => ({
    company_id: companyId,
    bank_transaction_id: txIdByKey.get(c.original.external_id) ?? null,
    original_description: c.original.description,
    original_amount: String(c.original.amount),
    original_date: c.original.date,
    classified_account_id: c.account_id || null,
    classified_account_name: c.account_name,
    classified_category: c.category,
    confidence: c.confidence,
    classification_source: c.source as 'ai' | 'manual' | 'rule',
    ai_reasoning: c.reasoning,
    approved: c.confidence >= HIGH_CONFIDENCE,
    approved_at: c.confidence >= HIGH_CONFIDENCE ? new Date() : null,
  }))

  if (dbRows.length > 0) {
    try {
      await db.insert(transactionClassifications).values(dbRows)
    } catch (err) {
      logger.error({ err }, 'Failed to save classifications to DB')
      errors.push('Failed to persist classifications')
    }
  }

  // 4. Stats
  const stats = {
    total: allClassified.length,
    auto_approved: allClassified.filter(c => c.confidence >= HIGH_CONFIDENCE).length,
    needs_review: allClassified.filter(c => c.confidence >= LOW_CONFIDENCE && c.confidence < HIGH_CONFIDENCE).length,
    unclassified: allClassified.filter(c => c.confidence < LOW_CONFIDENCE).length,
    rule_matched: ruleMatched.length,
  }

  logger.info({ companyId, stats }, 'Transaction classification complete')

  return { classified: allClassified, errors, stats }
}

/**
 * Learn a new rule from a manual classification.
 * Next time a transaction matches this vendor pattern, it will be auto-classified.
 */
export async function learnRule(
  companyId: number,
  vendorPattern: string,
  accountId: number,
  accountName: string,
  category: string,
): Promise<void> {
  await db.insert(classificationRules).values({
    company_id: companyId,
    vendor_pattern: vendorPattern,
    account_id: accountId,
    account_name: accountName,
    category,
  }).onConflictDoNothing()

  logger.info({ companyId, vendorPattern, accountId }, 'Classification rule learned')
}

/**
 * Get pending (unapproved) classifications for a company.
 */
export async function getPendingClassifications(companyId: number) {
  return db.select().from(transactionClassifications)
    .where(and(
      eq(transactionClassifications.company_id, companyId),
      eq(transactionClassifications.approved, false),
    ))
    .orderBy(transactionClassifications.original_date)
}

/**
 * Approve a classification (mark as approved).
 * Optionally update the account if the user corrected it.
 */
export async function approveClassification(
  id: number,
  userId: number,
  update?: { account_id: number; account_name: string; category: string },
) {
  const vals: Record<string, unknown> = {
    approved: true,
    approved_by: userId,
    approved_at: new Date(),
    updated_at: new Date(),
  }

  if (update) {
    vals.classified_account_id = update.account_id
    vals.classified_account_name = update.account_name
    vals.classified_category = update.category
    vals.classification_source = 'manual'
  }

  await db.update(transactionClassifications)
    .set(vals)
    .where(eq(transactionClassifications.id, id))
}

/**
 * Bulk approve multiple classifications.
 */
export async function bulkApprove(ids: number[], userId: number) {
  for (const id of ids) {
    await approveClassification(id, userId)
  }
}
