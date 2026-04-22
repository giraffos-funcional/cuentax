/**
 * CUENTAX — Cash Flow Statement (Direct Method)
 * ================================================
 * Uses the direct method: we walk every posted cash/bank move and bucket it
 * into operating / investing / financing by the counter-account's type.
 *
 * Simplified mapping:
 *   Counter-account type = income* / expense*    → Operating
 *   Counter-account type = asset_fixed/non_current → Investing
 *   Counter-account type = liability_non_current / equity* → Financing
 *   Everything else (asset_receivable, asset_current transfers) → Operating
 *
 * This is not a perfect GAAP/IFRS cash flow but covers the 80% case for
 * SMBs tracking cash movement.
 */

import { odooAccountingAdapter } from '@/adapters/odoo-accounting.adapter'
import { logger } from '@/core/logger'

export interface CashFlowLine {
  source_account: string       // counter-account name
  category: string
  amount: number               // positive = inflow, negative = outflow
  transaction_count: number
}

export interface CashFlowSection {
  label: 'operating' | 'investing' | 'financing'
  lines: CashFlowLine[]
  subtotal: number
}

export interface CashFlowReport {
  period: { year: number; month: number | null; from: string; to: string }
  currency: 'CLP' | 'USD'
  opening_cash: number
  closing_cash: number
  net_change: number
  operating: CashFlowSection
  investing: CashFlowSection
  financing: CashFlowSection
  total_inflows: number
  total_outflows: number
}

/**
 * Cash/bank accounts are those with account_type in ('asset_cash'). For each
 * posted move touching one of these, we look at the NON-cash line(s) to
 * figure out what the cash moved to/from.
 */
export async function buildCashFlow(
  odooCompanyId: number,
  year: number,
  month: number | undefined,
  currency: 'CLP' | 'USD' = 'USD',
): Promise<CashFlowReport> {
  const from = month ? `${year}-${String(month).padStart(2, '0')}-01` : `${year}-01-01`
  const to   = month ? `${year}-${String(month).padStart(2, '0')}-31` : `${year}-12-31`

  // 1. Find cash accounts for this company
  const cashAccounts = await odooAccountingAdapter.searchRead(
    'account.account',
    [['company_ids', 'in', [odooCompanyId]], ['account_type', '=', 'asset_cash']],
    ['id', 'code', 'name'],
    { limit: 50, context: { allowed_company_ids: [odooCompanyId] } },
  ) as Array<{ id: number; code: string | false; name: string }>
  const cashAccountIds = new Set(cashAccounts.map(a => a.id))

  if (cashAccountIds.size === 0) {
    return emptyReport(year, month, from, to, currency)
  }

  // 2. Opening cash balance (sum of cash-account moves before `from`)
  const openingLines = await odooAccountingAdapter.searchRead(
    'account.move.line',
    [
      ['company_id', '=', odooCompanyId],
      ['date', '<', from],
      ['parent_state', '=', 'posted'],
      ['account_id', 'in', [...cashAccountIds]],
    ],
    ['account_id', 'debit', 'credit'],
    { limit: 50_000, context: { allowed_company_ids: [odooCompanyId] } },
  ) as Array<{ account_id: [number, string]; debit: number; credit: number }>
  const openingCash = openingLines.reduce((s, l) => s + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0)

  // 3. All posted moves that touch a cash account within the period
  const cashLinesInPeriod = await odooAccountingAdapter.searchRead(
    'account.move.line',
    [
      ['company_id', '=', odooCompanyId],
      ['date', '>=', from],
      ['date', '<=', to],
      ['parent_state', '=', 'posted'],
      ['account_id', 'in', [...cashAccountIds]],
    ],
    ['move_id', 'account_id', 'debit', 'credit'],
    { limit: 50_000, context: { allowed_company_ids: [odooCompanyId] } },
  ) as Array<{ move_id: [number, string]; account_id: [number, string]; debit: number; credit: number }>

  if (cashLinesInPeriod.length === 0) {
    const report = emptyReport(year, month, from, to, currency)
    report.opening_cash = round2(openingCash)
    report.closing_cash = round2(openingCash)
    return report
  }

  // 4. Pull ALL lines of those moves so we can see the non-cash counterparts
  const moveIds = [...new Set(cashLinesInPeriod.map(l => l.move_id?.[0]).filter(Boolean))]
  const allLines = await odooAccountingAdapter.searchRead(
    'account.move.line',
    [
      ['move_id', 'in', moveIds],
      ['parent_state', '=', 'posted'],
    ],
    ['move_id', 'account_id', 'debit', 'credit', 'name'],
    { limit: 100_000, context: { allowed_company_ids: [odooCompanyId] } },
  ) as Array<{ move_id: [number, string]; account_id: [number, string]; debit: number; credit: number; name?: string }>

  // 5. Fetch account types for all counter-accounts
  const allAccountIds = [...new Set(allLines.map(l => l.account_id?.[0]).filter(Boolean))]
  const accountMeta = await odooAccountingAdapter.searchRead(
    'account.account',
    [['id', 'in', allAccountIds]],
    ['id', 'code', 'name', 'account_type'],
    { limit: 500, context: { allowed_company_ids: [odooCompanyId] } },
  ) as Array<{ id: number; code: string | false; name: string; account_type: string }>
  const acctById = new Map(accountMeta.map(a => [a.id, {
    id: a.id, code: a.code === false ? '' : (a.code ?? ''), name: a.name, account_type: a.account_type ?? '',
  }]))

  // 6. Group moves → for each move, determine the counter-account (the
  //    non-cash line) and figure out the cash delta (sum of cash-account
  //    lines on that move).
  const linesByMove = new Map<number, typeof allLines>()
  for (const l of allLines) {
    const mid = l.move_id?.[0]
    if (!mid) continue
    const arr = linesByMove.get(mid) ?? []
    arr.push(l)
    linesByMove.set(mid, arr)
  }

  // Bucket: section → counter-account label → aggregate
  type Agg = { amount: number; count: number; category: string }
  const buckets = {
    operating: new Map<string, Agg>(),
    investing: new Map<string, Agg>(),
    financing: new Map<string, Agg>(),
  }

  for (const [, lines] of linesByMove) {
    const cashDelta = lines
      .filter(l => cashAccountIds.has(l.account_id[0]))
      .reduce((s, l) => s + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0)
    if (Math.abs(cashDelta) < 0.005) continue

    // Non-cash lines: aggregate by account. Each non-cash line gets a share
    // of cashDelta proportional to its own (credit - debit for inflows,
    // debit - credit for outflows) so multi-line entries split correctly.
    const nonCash = lines.filter(l => !cashAccountIds.has(l.account_id[0]))
    if (nonCash.length === 0) continue

    const nonCashTotal = nonCash.reduce((s, l) => s + Math.abs((Number(l.debit) || 0) - (Number(l.credit) || 0)), 0)
    if (nonCashTotal < 0.005) continue

    for (const cl of nonCash) {
      const acct = acctById.get(cl.account_id[0])
      if (!acct) continue
      const lineAmt = Math.abs((Number(cl.debit) || 0) - (Number(cl.credit) || 0))
      const share = (lineAmt / nonCashTotal) * cashDelta
      const section = classifySection(acct.account_type)
      const label = acct.code ? `${acct.code} ${acct.name}` : acct.name
      const bag = buckets[section]
      const cur = bag.get(label) ?? { amount: 0, count: 0, category: acct.account_type }
      cur.amount += share
      cur.count += 1
      bag.set(label, cur)
    }
  }

  const toSection = (label: 'operating' | 'investing' | 'financing', map: Map<string, Agg>): CashFlowSection => {
    const lines: CashFlowLine[] = [...map.entries()]
      .map(([source_account, agg]) => ({
        source_account,
        category: agg.category,
        amount: round2(agg.amount),
        transaction_count: agg.count,
      }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    return { label, lines, subtotal: round2(lines.reduce((s, l) => s + l.amount, 0)) }
  }

  const operating = toSection('operating', buckets.operating)
  const investing = toSection('investing', buckets.investing)
  const financing = toSection('financing', buckets.financing)

  const netChange = round2(operating.subtotal + investing.subtotal + financing.subtotal)
  const closingCash = round2(openingCash + netChange)

  const inflows  = [operating, investing, financing].flatMap(s => s.lines).filter(l => l.amount > 0).reduce((s, l) => s + l.amount, 0)
  const outflows = [operating, investing, financing].flatMap(s => s.lines).filter(l => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0)

  return {
    period: { year, month: month ?? null, from, to },
    currency,
    opening_cash: round2(openingCash),
    closing_cash: closingCash,
    net_change: netChange,
    operating, investing, financing,
    total_inflows: round2(inflows),
    total_outflows: round2(outflows),
  }
}

function classifySection(accountType: string): 'operating' | 'investing' | 'financing' {
  if (accountType === 'asset_fixed' || accountType === 'asset_non_current') return 'investing'
  if (accountType === 'liability_non_current' || accountType.startsWith('equity')) return 'financing'
  // Everything else (income, expense, AR, AP, current liabilities, prepayments, inventory)
  // is operating activity.
  return 'operating'
}

function emptyReport(
  year: number, month: number | undefined, from: string, to: string, currency: 'CLP' | 'USD',
): CashFlowReport {
  const emptySec = (label: 'operating' | 'investing' | 'financing'): CashFlowSection =>
    ({ label, lines: [], subtotal: 0 })
  return {
    period: { year, month: month ?? null, from, to },
    currency,
    opening_cash: 0, closing_cash: 0, net_change: 0,
    operating: emptySec('operating'),
    investing: emptySec('investing'),
    financing: emptySec('financing'),
    total_inflows: 0, total_outflows: 0,
  }
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
