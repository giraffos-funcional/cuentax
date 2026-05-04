/**
 * CUENTAX — Billing Schema
 * =========================
 * Subscriptions, invoices, payments, dunning. Multi-tenant scoped.
 *
 * Phase 02 — see docs/multitenancy/phase-02-billing.md
 */
import {
  pgTable, serial, text, integer, boolean, timestamp,
  jsonb, varchar, uniqueIndex, index, pgEnum,
} from 'drizzle-orm/pg-core'
import { tenants, plans } from '@/db/schema/tenants'

// ── Enums ─────────────────────────────────────────────────────
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing', 'active', 'past_due', 'cancelled', 'paused',
])

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft', 'issued', 'paid', 'past_due', 'void',
])

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending', 'approved', 'rejected', 'refunded', 'in_process',
])

export const lineItemTypeEnum = pgEnum('line_item_type', [
  'subscription',
  'overage',
  'revenue_share_contabilidad',
  'revenue_share_remuneraciones',
  'adjustment',
])

export const dunningOutcomeEnum = pgEnum('dunning_outcome', [
  'success', 'failed', 'skipped',
])

// ══════════════════════════════════════════════════════════════
// SUBSCRIPTIONS
// ══════════════════════════════════════════════════════════════
export const subscriptions = pgTable('subscriptions', {
  id:                       serial('id').primaryKey(),
  tenant_id:                integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  plan_id:                  integer('plan_id').notNull().references(() => plans.id),
  status:                   subscriptionStatusEnum('status').notNull().default('trialing'),
  // Provider reference (Mercado Pago `preapproval` id)
  payment_provider:         varchar('payment_provider', { length: 16 }).notNull().default('mercadopago'),
  provider_subscription_id: varchar('provider_subscription_id', { length: 64 }),
  payment_method_token:     varchar('payment_method_token', { length: 255 }),
  current_period_start:     timestamp('current_period_start', { withTimezone: true }),
  current_period_end:       timestamp('current_period_end', { withTimezone: true }),
  cancel_at_period_end:     boolean('cancel_at_period_end').notNull().default(false),
  trial_ends_at:            timestamp('trial_ends_at', { withTimezone: true }),
  created_at:               timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at:               timestamp('updated_at', { withTimezone: true }).defaultNow(),
  cancelled_at:             timestamp('cancelled_at', { withTimezone: true }),
}, (t) => ({
  tenantIdx:       index('subscription_tenant_idx').on(t.tenant_id),
  statusIdx:       index('subscription_status_idx').on(t.status),
  providerSubIdx:  uniqueIndex('subscription_provider_sub_idx').on(t.provider_subscription_id),
}))

// ══════════════════════════════════════════════════════════════
// INVOICES
// ══════════════════════════════════════════════════════════════
export const invoices = pgTable('invoices', {
  id:               serial('id').primaryKey(),
  tenant_id:        integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  subscription_id:  integer('subscription_id').references(() => subscriptions.id),
  period:           varchar('period', { length: 7 }).notNull(),  // YYYY-MM
  status:           invoiceStatusEnum('status').notNull().default('draft'),
  subtotal_clp:     integer('subtotal_clp').notNull().default(0),
  iva_clp:          integer('iva_clp').notNull().default(0),
  total_clp:        integer('total_clp').notNull().default(0),
  dte_id:           integer('dte_id'),  // FK soft to dte_documents (Cuentax invoicing tenant)
  issued_at:        timestamp('issued_at', { withTimezone: true }),
  due_at:           timestamp('due_at', { withTimezone: true }),
  paid_at:          timestamp('paid_at', { withTimezone: true }),
  metadata:         jsonb('metadata'),
  created_at:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  tenantPeriodIdx: uniqueIndex('invoice_tenant_period_idx').on(t.tenant_id, t.period),
  statusIdx:       index('invoice_status_idx').on(t.status),
  dueIdx:          index('invoice_due_idx').on(t.status, t.due_at),
}))

// ══════════════════════════════════════════════════════════════
// INVOICE LINE ITEMS
// ══════════════════════════════════════════════════════════════
export const invoiceLineItems = pgTable('invoice_line_items', {
  id:               serial('id').primaryKey(),
  invoice_id:       integer('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  type:             lineItemTypeEnum('type').notNull(),
  description:      text('description').notNull(),
  quantity:         integer('quantity').notNull().default(1),
  unit_price_clp:   integer('unit_price_clp').notNull().default(0),
  amount_clp:       integer('amount_clp').notNull(),
  metadata:         jsonb('metadata'),
}, (t) => ({
  invoiceIdx: index('line_item_invoice_idx').on(t.invoice_id),
  typeIdx:    index('line_item_type_idx').on(t.invoice_id, t.type),
}))

// ══════════════════════════════════════════════════════════════
// PAYMENTS (one row per provider transaction)
// ══════════════════════════════════════════════════════════════
export const payments = pgTable('payments', {
  id:               serial('id').primaryKey(),
  invoice_id:       integer('invoice_id').references(() => invoices.id),
  tenant_id:        integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  provider:         varchar('provider', { length: 16 }).notNull().default('mercadopago'),
  provider_txn_id:  varchar('provider_txn_id', { length: 64 }).notNull(),
  amount_clp:       integer('amount_clp').notNull(),
  status:           paymentStatusEnum('status').notNull(),
  failure_reason:   text('failure_reason'),
  raw_payload:      jsonb('raw_payload'),
  created_at:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  // Idempotency: provider_txn_id (e.g. MP payment.id) is unique
  providerTxnIdx: uniqueIndex('payment_provider_txn_idx').on(t.provider, t.provider_txn_id),
  invoiceIdx:     index('payment_invoice_idx').on(t.invoice_id),
  tenantIdx:      index('payment_tenant_idx').on(t.tenant_id),
}))

// ══════════════════════════════════════════════════════════════
// DUNNING ATTEMPTS
// ══════════════════════════════════════════════════════════════
export const dunningAttempts = pgTable('dunning_attempts', {
  id:               serial('id').primaryKey(),
  invoice_id:       integer('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  tenant_id:        integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  attempt_number:   integer('attempt_number').notNull(),
  attempted_at:     timestamp('attempted_at', { withTimezone: true }).defaultNow(),
  outcome:          dunningOutcomeEnum('outcome').notNull(),
  notes:            text('notes'),
}, (t) => ({
  invoiceAttemptIdx: uniqueIndex('dunning_invoice_attempt_idx').on(t.invoice_id, t.attempt_number),
  tenantIdx:         index('dunning_tenant_idx').on(t.tenant_id),
}))
