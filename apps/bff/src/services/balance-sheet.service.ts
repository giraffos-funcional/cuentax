/**
 * CUENTAX — Balance Sheet Service
 * =================================
 * Computes the Balance Sheet (Estado de Situación Financiera) as of a given
 * date from Odoo's posted journal entries.
 *
 * Balance Sheet = Assets = Liabilities + Equity
 * Grouping driven by Odoo `account_type`:
 *   asset_*        → Assets
 *   liability_*    → Liabilities
 *   equity, equity_unaffected → Equity
 * Income/Expense accounts are collapsed into "Current year Net Income" and
 * shown under Equity.
 */

import { odooAccountingAdapter } from '@/adapters/odoo-accounting.adapter'
import { logger } from '@/core/logger'

export interface BalanceSheetLine {
  code: string
  name: string
  account_type: string
  balance: number   // positive for assets (debit natural), negative for liab/equity flipped to positive
}

export interface BalanceSheetSection {
  label: string
  lines: BalanceSheetLine[]
  subtotal: number
}

export interface BalanceSheetReport {
  as_of_date: string
  currency: 'CLP' | 'USD'
  // Main sections
  current_assets: BalanceSheetSection
  fixed_assets: BalanceSheetSection
  other_assets: BalanceSheetSection
  current_liabilities: BalanceSheetSection
  long_term_liabilities: BalanceSheetSection
  equity: BalanceSheetSection
  // Derived totals
  total_assets: number
  total_liabilities: number
  total_equity: number
  net_income_current_period: number
  // Balance check: |assets - (liab + eq)| should be ~0
  unbalanced_by: number
}

/**
 * Build the balance sheet as of a given date. Aggregates every posted move
 * line from the start of time up to (and including) that date. Revenue and
 * expense net goes to "Net Income" under equity.
 */
export async function buildBalanceSheet(
  odooCompanyId: number,
  asOfDate: string,
  currency: 'CLP' | 'USD' = 'USD',
): Promise<BalanceSheetReport> {
  // Pull all posted move lines up to the as_of_date
  const lines = await odooAccountingAdapter.searchRead(
    'account.move.line',
    [
      ['company_id', '=', odooCompanyId],
      ['date', '<=', asOfDate],
      ['parent_state', '=', 'posted'],
    ],
    ['account_id', 'debit', 'credit', 'balance'],
    { limit: 50_000, context: { allowed_company_ids: [odooCompanyId] } },
  ) as Array<{ account_id: [number, string]; debit: number; credit: number; balance: number }>

  // Fetch account metadata (type + code) in one call
  const accountIds = [...new Set(lines.map(l => l.account_id?.[0]).filter(Boolean))]
  const accounts = accountIds.length > 0
    ? await odooAccountingAdapter.searchRead(
        'account.account',
        [['id', 'in', accountIds]],
        ['id', 'code', 'name', 'account_type'],
        { limit: 500, context: { allowed_company_ids: [odooCompanyId] } },
      ) as Array<{ id: number; code: string | false; name: string; account_type: string }>
    : []
  const acctById = new Map(accounts.map(a => [a.id, {
    id: a.id,
    code: a.code === false ? '' : (a.code ?? ''),
    name: a.name,
    account_type: a.account_type ?? '',
  }]))

  // Sum debit - credit per account
  const balancesByAccount = new Map<number, number>()
  for (const line of lines) {
    const id = line.account_id?.[0]
    if (!id) continue
    const cur = balancesByAccount.get(id) ?? 0
    balancesByAccount.set(id, cur + (Number(line.debit) || 0) - (Number(line.credit) || 0))
  }

  // Bucket accounts
  const currentAssets: BalanceSheetLine[] = []
  const fixedAssets: BalanceSheetLine[] = []
  const otherAssets: BalanceSheetLine[] = []
  const currentLiab: BalanceSheetLine[] = []
  const longTermLiab: BalanceSheetLine[] = []
  const equityAccounts: BalanceSheetLine[] = []
  let netIncome = 0

  for (const [accountId, rawBal] of balancesByAccount) {
    const acct = acctById.get(accountId)
    if (!acct) continue
    if (Math.abs(rawBal) < 0.005) continue // ignore zero-balance accounts
    const type = acct.account_type
    const line: BalanceSheetLine = {
      code: acct.code,
      name: acct.name,
      account_type: type,
      balance: 0,
    }

    if (type.startsWith('asset_')) {
      // Assets: debit-natural. Positive debit balance = asset value.
      line.balance = rawBal
      if (type === 'asset_fixed' || type === 'asset_non_current') {
        fixedAssets.push(line)
      } else if (type === 'asset_receivable' || type === 'asset_cash' ||
                 type === 'asset_current' || type === 'asset_prepayments') {
        currentAssets.push(line)
      } else {
        otherAssets.push(line)
      }
    } else if (type.startsWith('liability_') || type === 'credit_card') {
      // Liabilities: credit-natural. Flip sign to show as positive.
      line.balance = -rawBal
      if (type === 'liability_non_current') {
        longTermLiab.push(line)
      } else {
        currentLiab.push(line)
      }
    } else if (type.startsWith('equity')) {
      line.balance = -rawBal
      equityAccounts.push(line)
    } else if (type === 'income' || type === 'income_other') {
      // Revenue has credit-natural balance → contributes positively to net income
      netIncome += -rawBal
    } else if (type === 'expense' || type === 'expense_direct_cost' ||
               type === 'expense_depreciation') {
      // Expenses have debit-natural balance → reduce net income
      netIncome -= rawBal
    }
  }

  // Sort sections by code
  const byCode = (a: BalanceSheetLine, b: BalanceSheetLine) =>
    (a.code || '').localeCompare(b.code || '')
  currentAssets.sort(byCode)
  fixedAssets.sort(byCode)
  otherAssets.sort(byCode)
  currentLiab.sort(byCode)
  longTermLiab.sort(byCode)
  equityAccounts.sort(byCode)

  // Add net income as a synthetic equity line
  if (Math.abs(netIncome) > 0.005) {
    equityAccounts.push({
      code: '',
      name: 'Net Income (current period)',
      account_type: 'equity_computed',
      balance: netIncome,
    })
  }

  const sum = (ls: BalanceSheetLine[]) => ls.reduce((s, l) => s + l.balance, 0)
  const ca = round2(sum(currentAssets))
  const fa = round2(sum(fixedAssets))
  const oa = round2(sum(otherAssets))
  const cl = round2(sum(currentLiab))
  const ll = round2(sum(longTermLiab))
  const eq = round2(sum(equityAccounts))
  const totalAssets = round2(ca + fa + oa)
  const totalLiab = round2(cl + ll)
  const totalEq = eq
  const unbalancedBy = round2(totalAssets - totalLiab - totalEq)

  if (Math.abs(unbalancedBy) > 1) {
    logger.warn({ odooCompanyId, asOfDate, unbalancedBy }, 'Balance Sheet does not balance')
  }

  return {
    as_of_date: asOfDate,
    currency,
    current_assets:        { label: 'current_assets',        lines: currentAssets, subtotal: ca },
    fixed_assets:          { label: 'fixed_assets',          lines: fixedAssets,   subtotal: fa },
    other_assets:          { label: 'other_assets',          lines: otherAssets,   subtotal: oa },
    current_liabilities:   { label: 'current_liabilities',   lines: currentLiab,   subtotal: cl },
    long_term_liabilities: { label: 'long_term_liabilities', lines: longTermLiab,  subtotal: ll },
    equity:                { label: 'equity',                lines: equityAccounts, subtotal: eq },
    total_assets: totalAssets,
    total_liabilities: totalLiab,
    total_equity: totalEq,
    net_income_current_period: round2(netIncome),
    unbalanced_by: unbalancedBy,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
