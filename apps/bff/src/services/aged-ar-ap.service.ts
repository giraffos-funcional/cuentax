/**
 * CUENTAX — Aged AR / AP Report
 * ================================
 * Pulls unpaid customer invoices (AR) and unpaid vendor bills (AP) from Odoo,
 * groups by partner, and buckets each outstanding amount by days overdue:
 *   Current (0 days), 1-30, 31-60, 61-90, 90+
 *
 * Odoo's `account.move` model has fields:
 *   move_type: 'out_invoice' | 'in_invoice' | 'out_refund' | 'in_refund'
 *   invoice_date_due: the due date
 *   amount_residual: what's left unpaid (in company currency)
 */

import { odooAccountingAdapter } from '@/adapters/odoo-accounting.adapter'

export interface AgedRow {
  partner_id: number
  partner_name: string
  current: number     // not yet due or due today
  days_1_30: number
  days_31_60: number
  days_61_90: number
  days_over_90: number
  total: number
  invoice_count: number
}

export interface AgedReport {
  kind: 'AR' | 'AP'
  as_of_date: string
  currency: 'CLP' | 'USD'
  rows: AgedRow[]
  totals: {
    current: number
    days_1_30: number
    days_31_60: number
    days_61_90: number
    days_over_90: number
    total: number
    invoice_count: number
  }
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime()
  const db = new Date(b).getTime()
  return Math.floor((db - da) / 86_400_000)
}

function bucket(daysOverdue: number): keyof Omit<AgedRow, 'partner_id' | 'partner_name' | 'total' | 'invoice_count'> {
  if (daysOverdue <= 0) return 'current'
  if (daysOverdue <= 30) return 'days_1_30'
  if (daysOverdue <= 60) return 'days_31_60'
  if (daysOverdue <= 90) return 'days_61_90'
  return 'days_over_90'
}

export async function buildAgedReport(
  odooCompanyId: number,
  kind: 'AR' | 'AP',
  asOfDate: string,
  currency: 'CLP' | 'USD' = 'USD',
): Promise<AgedReport> {
  // AR → out_invoice + out_refund (customer invoices)
  // AP → in_invoice + in_refund (vendor bills)
  const moveTypes = kind === 'AR'
    ? ['out_invoice', 'out_refund']
    : ['in_invoice', 'in_refund']

  const invoices = await odooAccountingAdapter.searchRead(
    'account.move',
    [
      ['company_id', '=', odooCompanyId],
      ['move_type', 'in', moveTypes],
      ['state', '=', 'posted'],
      ['amount_residual', '>', 0],
      ['invoice_date', '<=', asOfDate],
    ],
    ['id', 'name', 'partner_id', 'invoice_date', 'invoice_date_due', 'amount_residual', 'move_type'],
    { limit: 5000, context: { allowed_company_ids: [odooCompanyId] } },
  ) as Array<{
    id: number
    name: string
    partner_id: [number, string] | false
    invoice_date: string
    invoice_date_due: string | false
    amount_residual: number
    move_type: string
  }>

  // Aggregate by partner
  const byPartner = new Map<number, AgedRow>()
  for (const inv of invoices) {
    const partnerId = inv.partner_id ? inv.partner_id[0] : 0
    const partnerName = inv.partner_id ? inv.partner_id[1] : 'Unknown'
    const dueDate = (inv.invoice_date_due === false || !inv.invoice_date_due)
      ? inv.invoice_date
      : inv.invoice_date_due
    const daysOverdue = daysBetween(dueDate, asOfDate)
    const bucketKey = bucket(daysOverdue)
    const amount = Number(inv.amount_residual) || 0
    // Sign: refunds (out_refund / in_refund) reduce the outstanding balance
    const signed = inv.move_type.endsWith('_refund') ? -amount : amount

    let row = byPartner.get(partnerId)
    if (!row) {
      row = {
        partner_id: partnerId, partner_name: partnerName,
        current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_over_90: 0,
        total: 0, invoice_count: 0,
      }
      byPartner.set(partnerId, row)
    }
    row[bucketKey] += signed
    row.total += signed
    row.invoice_count++
  }

  // Filter out partners with net zero total
  const rows = [...byPartner.values()]
    .filter(r => Math.abs(r.total) >= 0.005)
    .map(r => ({
      ...r,
      current: round2(r.current),
      days_1_30: round2(r.days_1_30),
      days_31_60: round2(r.days_31_60),
      days_61_90: round2(r.days_61_90),
      days_over_90: round2(r.days_over_90),
      total: round2(r.total),
    }))
    .sort((a, b) => b.total - a.total)

  const totals = rows.reduce(
    (acc, r) => ({
      current: acc.current + r.current,
      days_1_30: acc.days_1_30 + r.days_1_30,
      days_31_60: acc.days_31_60 + r.days_31_60,
      days_61_90: acc.days_61_90 + r.days_61_90,
      days_over_90: acc.days_over_90 + r.days_over_90,
      total: acc.total + r.total,
      invoice_count: acc.invoice_count + r.invoice_count,
    }),
    { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_over_90: 0, total: 0, invoice_count: 0 },
  )

  return {
    kind,
    as_of_date: asOfDate,
    currency,
    rows,
    totals: {
      current: round2(totals.current),
      days_1_30: round2(totals.days_1_30),
      days_31_60: round2(totals.days_31_60),
      days_61_90: round2(totals.days_61_90),
      days_over_90: round2(totals.days_over_90),
      total: round2(totals.total),
      invoice_count: totals.invoice_count,
    },
  }
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
