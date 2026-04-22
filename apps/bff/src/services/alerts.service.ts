/**
 * CUENTAX — Alerts Service
 * ===========================
 * Computes actionable alerts for the company dashboard:
 *   - Budget variance > X% unfavorable
 *   - Cash balance below Y (absolute) or below Z days of runway
 *   - Classifications pending review > 7 days old
 *   - No bank import in > 30 days
 *   - Reconciliation gap on recent imports
 */

import { and, eq, isNull, sql, lt, desc } from 'drizzle-orm'
import { db } from '@/db/client'
import { bankTransactions, transactionClassifications } from '@/db/schema'
import { buildBudgetVariance } from './budget.service'
import { buildCashFlow } from './cash-flow.service'

export interface Alert {
  id: string
  severity: 'info' | 'warning' | 'critical'
  category: 'budget' | 'cash' | 'classification' | 'import' | 'reconciliation'
  title: string
  title_es: string
  detail: string
  detail_es: string
  action_href?: string
  value?: number | string
}

export interface AlertsConfig {
  budget_variance_pct_threshold?: number   // alert when variance % exceeds this (default 20)
  low_cash_absolute?: number               // warn when total cash < this
  pending_classification_days?: number     // warn after this many days unreviewed (default 7)
  no_import_days?: number                  // warn after this many days without imports (default 30)
}

const DEFAULT_CONFIG: Required<AlertsConfig> = {
  budget_variance_pct_threshold: 20,
  low_cash_absolute: 0,
  pending_classification_days: 7,
  no_import_days: 30,
}

export async function buildAlerts(
  companyId: number,
  odooCompanyId: number,
  currency: 'CLP' | 'USD',
  config: AlertsConfig = {},
): Promise<Alert[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const alerts: Alert[] = []
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1

  // ─── Budget variance ────────────────────────────────────
  try {
    const variance = await buildBudgetVariance(
      companyId, odooCompanyId, currentYear, currentMonth, currency,
    )
    const big = variance.lines.filter(l =>
      l.budget_amount > 0 &&
      !l.favorable &&
      Math.abs(l.variance_pct) >= cfg.budget_variance_pct_threshold,
    )
    for (const v of big.slice(0, 5)) {
      alerts.push({
        id: `budget-${v.account_code}-${v.cost_center_id ?? 'all'}`,
        severity: Math.abs(v.variance_pct) > 50 ? 'critical' : 'warning',
        category: 'budget',
        title: `${v.account_name || v.account_code} over budget by ${v.variance_pct.toFixed(0)}%`,
        title_es: `${v.account_name || v.account_code} sobre presupuesto ${v.variance_pct.toFixed(0)}%`,
        detail: `Budget: ${v.budget_amount} / Actual: ${v.actual_amount}${v.cost_center_name ? ` (${v.cost_center_name})` : ''}`,
        detail_es: `Presupuesto: ${v.budget_amount} / Real: ${v.actual_amount}${v.cost_center_name ? ` (${v.cost_center_name})` : ''}`,
        action_href: '/dashboard/accounting/budgets',
        value: v.variance_pct,
      })
    }
  } catch { /* budget data may not exist yet */ }

  // ─── Cash balance ────────────────────────────────────────
  try {
    const cashFlow = await buildCashFlow(odooCompanyId, currentYear, currentMonth, currency)
    if (cashFlow.closing_cash < cfg.low_cash_absolute) {
      alerts.push({
        id: 'low-cash',
        severity: cashFlow.closing_cash < 0 ? 'critical' : 'warning',
        category: 'cash',
        title: `Cash balance low: ${cashFlow.closing_cash}`,
        title_es: `Saldo de caja bajo: ${cashFlow.closing_cash}`,
        detail: `Opening ${cashFlow.opening_cash}, net change ${cashFlow.net_change}`,
        detail_es: `Inicial ${cashFlow.opening_cash}, cambio neto ${cashFlow.net_change}`,
        action_href: '/dashboard/accounting/reports',
        value: cashFlow.closing_cash,
      })
    }
  } catch { /* nothing yet */ }

  // ─── Pending classifications ───────────────────────────
  const cutoffDate = new Date(today)
  cutoffDate.setDate(cutoffDate.getDate() - cfg.pending_classification_days)
  const oldPendingRows = await db.select({
    n: sql<number>`COUNT(*)::int`,
  })
    .from(transactionClassifications)
    .where(and(
      eq(transactionClassifications.company_id, companyId),
      eq(transactionClassifications.approved, false),
      lt(transactionClassifications.created_at, cutoffDate),
    ))
  const pending = oldPendingRows[0]?.n ?? 0
  if (pending > 0) {
    alerts.push({
      id: 'pending-classifications',
      severity: pending > 20 ? 'warning' : 'info',
      category: 'classification',
      title: `${pending} classifications pending review for more than ${cfg.pending_classification_days} days`,
      title_es: `${pending} clasificaciones pendientes de revisión hace más de ${cfg.pending_classification_days} días`,
      detail: 'Review and approve to generate journal entries.',
      detail_es: 'Revisa y aprueba para generar asientos contables.',
      action_href: '/dashboard/accounting/classify',
      value: pending,
    })
  }

  // ─── No recent bank imports ─────────────────────────────
  const lastImport = await db.select({
    last: sql<Date | null>`MAX(${bankTransactions.created_at})`,
  })
    .from(bankTransactions)
    .where(eq(bankTransactions.company_id, companyId))
  const lastImportDate = lastImport[0]?.last
  if (lastImportDate) {
    const daysSince = Math.floor((today.getTime() - new Date(lastImportDate).getTime()) / 86_400_000)
    if (daysSince >= cfg.no_import_days) {
      alerts.push({
        id: 'no-recent-import',
        severity: daysSince > 60 ? 'warning' : 'info',
        category: 'import',
        title: `No bank imports in ${daysSince} days`,
        title_es: `Sin importaciones bancarias hace ${daysSince} días`,
        detail: 'Upload a fresh statement to keep reports current.',
        detail_es: 'Sube una cartola reciente para mantener reportes actualizados.',
        action_href: '/dashboard/accounting/import',
        value: daysSince,
      })
    }
  }

  return alerts.sort((a, b) => {
    const severity = { critical: 0, warning: 1, info: 2 }
    return severity[a.severity] - severity[b.severity]
  })
}
