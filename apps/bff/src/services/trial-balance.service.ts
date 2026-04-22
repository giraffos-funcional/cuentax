/**
 * CUENTAX — Trial Balance + General Ledger
 * ===========================================
 * Trial Balance: sum of debits and credits per account for a period. Every
 * posted move increases either debit or credit on the accounts it touches.
 * A balanced TB is a prerequisite for a correct Balance Sheet / P&L.
 *
 * General Ledger: every move line for an account, in date order. The raw
 * transaction log used to audit anything.
 */

import { odooAccountingAdapter } from '@/adapters/odoo-accounting.adapter'

export interface TrialBalanceRow {
  account_code: string
  account_name: string
  account_type: string
  opening_balance: number   // carried forward from before `from`
  period_debit: number
  period_credit: number
  closing_balance: number   // opening + debit - credit
}

export interface TrialBalanceReport {
  period: { from: string; to: string }
  currency: 'CLP' | 'USD'
  rows: TrialBalanceRow[]
  totals: {
    opening_balance: number
    period_debit: number
    period_credit: number
    closing_balance: number
  }
  is_balanced: boolean
}

/**
 * Build the Trial Balance for a period. Every account that has any activity
 * (in the period or as opening balance) appears on a row.
 */
export async function buildTrialBalance(
  odooCompanyId: number,
  from: string,
  to: string,
  currency: 'CLP' | 'USD' = 'USD',
): Promise<TrialBalanceReport> {
  // All posted lines up to and including `to`
  const allLines = await odooAccountingAdapter.searchRead(
    'account.move.line',
    [
      ['company_id', '=', odooCompanyId],
      ['date', '<=', to],
      ['parent_state', '=', 'posted'],
    ],
    ['account_id', 'debit', 'credit', 'date'],
    { limit: 100_000, context: { allowed_company_ids: [odooCompanyId] } },
  ) as Array<{ account_id: [number, string]; debit: number; credit: number; date: string }>

  // Separate opening (date < from) from period (date >= from)
  const opening = new Map<number, number>()      // account_id → debit-credit (opening balance)
  const periodDebit = new Map<number, number>()
  const periodCredit = new Map<number, number>()

  for (const l of allLines) {
    const id = l.account_id?.[0]
    if (!id) continue
    const d = Number(l.debit) || 0
    const c = Number(l.credit) || 0
    if (l.date < from) {
      opening.set(id, (opening.get(id) ?? 0) + d - c)
    } else {
      periodDebit.set(id, (periodDebit.get(id) ?? 0) + d)
      periodCredit.set(id, (periodCredit.get(id) ?? 0) + c)
    }
  }

  // Union of account IDs that had any activity
  const allIds = new Set<number>([
    ...opening.keys(),
    ...periodDebit.keys(),
    ...periodCredit.keys(),
  ])

  // Fetch account metadata
  const accountsMeta = allIds.size > 0
    ? await odooAccountingAdapter.searchRead(
        'account.account',
        [['id', 'in', [...allIds]]],
        ['id', 'code', 'name', 'account_type'],
        { limit: 500, context: { allowed_company_ids: [odooCompanyId] } },
      ) as Array<{ id: number; code: string | false; name: string; account_type: string }>
    : []
  const metaById = new Map(accountsMeta.map(a => [a.id, a]))

  const rows: TrialBalanceRow[] = []
  for (const id of allIds) {
    const meta = metaById.get(id)
    if (!meta) continue
    const ob = opening.get(id) ?? 0
    const pd = periodDebit.get(id) ?? 0
    const pc = periodCredit.get(id) ?? 0
    const cb = ob + pd - pc
    // Skip accounts with zero everywhere
    if (Math.abs(ob) < 0.005 && Math.abs(pd) < 0.005 && Math.abs(pc) < 0.005) continue
    rows.push({
      account_code: meta.code === false ? '' : (meta.code ?? ''),
      account_name: meta.name,
      account_type: meta.account_type ?? '',
      opening_balance: round2(ob),
      period_debit: round2(pd),
      period_credit: round2(pc),
      closing_balance: round2(cb),
    })
  }

  rows.sort((a, b) => (a.account_code || 'zzz').localeCompare(b.account_code || 'zzz'))

  const totals = rows.reduce(
    (acc, r) => ({
      opening_balance: acc.opening_balance + r.opening_balance,
      period_debit: acc.period_debit + r.period_debit,
      period_credit: acc.period_credit + r.period_credit,
      closing_balance: acc.closing_balance + r.closing_balance,
    }),
    { opening_balance: 0, period_debit: 0, period_credit: 0, closing_balance: 0 },
  )

  return {
    period: { from, to },
    currency,
    rows,
    totals: {
      opening_balance: round2(totals.opening_balance),
      period_debit: round2(totals.period_debit),
      period_credit: round2(totals.period_credit),
      closing_balance: round2(totals.closing_balance),
    },
    is_balanced: Math.abs(totals.period_debit - totals.period_credit) < 1,
  }
}

// ─── General Ledger ───────────────────────────────────────────

export interface GeneralLedgerRow {
  date: string
  move_id: number
  move_name: string
  account_code: string
  account_name: string
  partner: string | null
  description: string
  debit: number
  credit: number
  balance: number   // running balance within the account
  cost_center: string | null   // first analytic account name if any
}

export interface GeneralLedgerReport {
  period: { from: string; to: string }
  currency: 'CLP' | 'USD'
  rows: GeneralLedgerRow[]
  total_debit: number
  total_credit: number
}

/**
 * Build the General Ledger — every posted move line for the period, sorted
 * by (account, date, move). Useful as raw audit trail + CSV export.
 */
export async function buildGeneralLedger(
  odooCompanyId: number,
  from: string,
  to: string,
  currency: 'CLP' | 'USD' = 'USD',
  accountCode?: string,
): Promise<GeneralLedgerReport> {
  const domain: any[] = [
    ['company_id', '=', odooCompanyId],
    ['date', '>=', from],
    ['date', '<=', to],
    ['parent_state', '=', 'posted'],
  ]

  const lines = await odooAccountingAdapter.searchRead(
    'account.move.line',
    domain,
    ['id', 'date', 'move_id', 'account_id', 'partner_id', 'name', 'debit', 'credit', 'analytic_distribution'],
    { limit: 100_000, context: { allowed_company_ids: [odooCompanyId] } },
  ) as Array<{
    id: number
    date: string
    move_id: [number, string]
    account_id: [number, string]
    partner_id: [number, string] | false
    name: string | false
    debit: number
    credit: number
    analytic_distribution: Record<string, number> | false | null
  }>

  // Optionally filter by account_code (need to map code → id first)
  let filteredLines = lines
  if (accountCode) {
    const accts = await odooAccountingAdapter.searchRead(
      'account.account',
      [['code', '=', accountCode]],
      ['id'],
      { limit: 10, context: { allowed_company_ids: [odooCompanyId] } },
    ) as Array<{ id: number }>
    const codeIds = new Set(accts.map(a => a.id))
    filteredLines = lines.filter(l => codeIds.has(l.account_id[0]))
  }

  // Resolve analytic names for display
  const analyticIds = new Set<number>()
  for (const l of filteredLines) {
    const dist = l.analytic_distribution
    if (dist && typeof dist === 'object') {
      for (const k of Object.keys(dist)) {
        const id = Number(String(k).split(',')[0])
        if (Number.isFinite(id)) analyticIds.add(id)
      }
    }
  }
  const analyticMeta = analyticIds.size > 0
    ? await odooAccountingAdapter.searchRead(
        'account.analytic.account',
        [['id', 'in', [...analyticIds]]],
        ['id', 'name'],
        { limit: 500, context: { allowed_company_ids: [odooCompanyId] } },
      ) as Array<{ id: number; name: string }>
    : []
  const analyticNameById = new Map(analyticMeta.map(a => [a.id, a.name]))

  // Running balance per account
  const accountBalance = new Map<number, number>()
  const rows: GeneralLedgerRow[] = []

  // Sort by (account, date, move_id) for correct running balance
  const sorted = [...filteredLines].sort((a, b) => {
    if (a.account_id[0] !== b.account_id[0]) return a.account_id[0] - b.account_id[0]
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.move_id[0] - b.move_id[0]
  })

  let totalDebit = 0
  let totalCredit = 0
  for (const l of sorted) {
    const accountId = l.account_id[0]
    const accountLabel = l.account_id[1] ?? ''
    const [accountCode, ...nameParts] = accountLabel.split(' ')
    const accountName = nameParts.join(' ') || accountLabel
    const d = Number(l.debit) || 0
    const c = Number(l.credit) || 0
    const newBalance = (accountBalance.get(accountId) ?? 0) + d - c
    accountBalance.set(accountId, newBalance)

    // Cost center: take first analytic account from distribution
    let costCenter: string | null = null
    const dist = l.analytic_distribution
    if (dist && typeof dist === 'object') {
      const firstKey = Object.keys(dist)[0]
      if (firstKey) {
        const id = Number(String(firstKey).split(',')[0])
        if (Number.isFinite(id)) costCenter = analyticNameById.get(id) ?? null
      }
    }

    rows.push({
      date: l.date,
      move_id: l.move_id[0],
      move_name: l.move_id[1] ?? '',
      account_code: accountCode || '',
      account_name: accountName,
      partner: l.partner_id ? l.partner_id[1] : null,
      description: l.name === false ? '' : (l.name ?? ''),
      debit: d,
      credit: c,
      balance: round2(newBalance),
      cost_center: costCenter,
    })
    totalDebit += d
    totalCredit += c
  }

  return {
    period: { from, to },
    currency,
    rows,
    total_debit: round2(totalDebit),
    total_credit: round2(totalCredit),
  }
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
