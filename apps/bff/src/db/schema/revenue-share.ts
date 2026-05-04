/**
 * CUENTAX — Revenue Share Schema (Phase 03)
 * ==========================================
 * `tenant_fees`: el contador declara honorarios mensuales por PYME (company)
 *                separados en contabilidad / remuneraciones.
 * `revenue_share_runs`: snapshot mensual del cálculo, con detalle por PYME
 *                       y los rates aplicados (los rates viven en tenants y
 *                       se snapshotean acá al cierre — D-Pricing).
 *
 * Refs: docs/multitenancy/phase-03-revenue-share.md T3.1
 */
import {
  pgTable, serial, text, integer, boolean, timestamp,
  jsonb, varchar, date, decimal, uniqueIndex, index, pgEnum,
} from 'drizzle-orm/pg-core'
import { tenants } from '@/db/schema/tenants'
import { companies } from '@/db/schema'
import { invoices } from '@/db/schema/billing'

export const feeTypeEnum = pgEnum('fee_type', ['contabilidad', 'remuneraciones'])

export const revenueShareRunStatusEnum = pgEnum('revenue_share_run_status', [
  'calculating',
  'ready',
  'invoiced',
  'paid',
  'locked',
])

// ══════════════════════════════════════════════════════════════
// TENANT FEES (declared by accountant per PYME per fee type)
// ══════════════════════════════════════════════════════════════
export const tenantFees = pgTable('tenant_fees', {
  id:              serial('id').primaryKey(),
  tenant_id:       integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  company_id:      integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  fee_type:        feeTypeEnum('fee_type').notNull(),
  monthly_clp:     integer('monthly_clp').notNull(),
  billing_day:     integer('billing_day').notNull().default(1),
  active:          boolean('active').notNull().default(true),
  valid_from:      date('valid_from', { mode: 'string' }).notNull(),
  valid_to:        date('valid_to',   { mode: 'string' }),
  notes:           text('notes'),
  created_at:      timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at:      timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  tenantCompanyTypeIdx: uniqueIndex('tenant_fee_unique')
    .on(t.tenant_id, t.company_id, t.fee_type, t.valid_from),
  tenantActiveIdx: index('tenant_fee_active_idx').on(t.tenant_id, t.active),
}))

// ══════════════════════════════════════════════════════════════
// REVENUE SHARE RUNS (monthly snapshot per tenant)
// ══════════════════════════════════════════════════════════════
export const revenueShareRuns = pgTable('revenue_share_runs', {
  id:                          serial('id').primaryKey(),
  tenant_id:                   integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  period:                      varchar('period', { length: 7 }).notNull(),  // YYYY-MM
  status:                      revenueShareRunStatusEnum('status').notNull().default('calculating'),
  total_contabilidad_clp:      integer('total_contabilidad_clp').notNull().default(0),
  total_remuneraciones_clp:    integer('total_remuneraciones_clp').notNull().default(0),
  share_contabilidad_clp:      integer('share_contabilidad_clp').notNull().default(0),
  share_remuneraciones_clp:    integer('share_remuneraciones_clp').notNull().default(0),
  total_share_clp:             integer('total_share_clp').notNull().default(0),
  // Snapshot of the rate at calculation time (the source-of-truth value
  // is in `tenants` but it can be edited; this row is immutable once locked).
  rate_contabilidad:           decimal('rate_contabilidad',   { precision: 5, scale: 4 }).notNull(),
  rate_remuneraciones:         decimal('rate_remuneraciones', { precision: 5, scale: 4 }).notNull(),
  invoice_id:                  integer('invoice_id').references(() => invoices.id),
  detail:                      jsonb('detail'),  // [{company_id, fee_type, monthly_clp, share_clp}, ...]
  calculated_at:               timestamp('calculated_at', { withTimezone: true }),
  locked_at:                   timestamp('locked_at',     { withTimezone: true }),
  notes:                       text('notes'),
}, (t) => ({
  tenantPeriodIdx: uniqueIndex('rs_run_tenant_period').on(t.tenant_id, t.period),
  statusIdx:       index('rs_run_status_idx').on(t.status),
}))
