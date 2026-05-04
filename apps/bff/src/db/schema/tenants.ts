/**
 * CUENTAX — Tenants & Plans Schema
 * =================================
 * Multi-tenant foundation. Tenant = contador / despacho contable.
 * Each tenant holds N companies (PYMEs).
 *
 * Phase 00 — see docs/multitenancy/phase-00-foundation.md
 */

import {
  pgTable, serial, text, integer, boolean, timestamp,
  jsonb, uniqueIndex, index, pgEnum, varchar, decimal,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ── Enums ─────────────────────────────────────────────────────
export const tenantStatusEnum = pgEnum('tenant_status', [
  'trialing',
  'active',
  'past_due',
  'suspended',
  'cancelled',
])

// ══════════════════════════════════════════════════════════════
// PLANS (catalog of subscription plans)
// ══════════════════════════════════════════════════════════════
export const plans = pgTable('plans', {
  id:                                serial('id').primaryKey(),
  code:                              varchar('code', { length: 32 }).notNull().unique(),
  name:                              text('name').notNull(),
  base_price_clp:                    integer('base_price_clp').notNull(),
  included_dtes:                     integer('included_dtes').notNull().default(0),
  included_companies:                integer('included_companies').notNull().default(1),
  overage_price_per_dte_clp:         integer('overage_price_per_dte_clp').notNull().default(0),
  features:                          jsonb('features'),
  // Per D-Pricing: revenue-share rates live on `tenants` (editable per-tenant).
  // The plan only flags whether revenue-share applies at all.
  revenue_share_enabled:             boolean('revenue_share_enabled').notNull().default(true),
  active:                            boolean('active').notNull().default(true),
  created_at:                        timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at:                        timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// ══════════════════════════════════════════════════════════════
// TENANTS (one row per contador / despacho)
// ══════════════════════════════════════════════════════════════
export const tenants = pgTable('tenants', {
  id:                                serial('id').primaryKey(),
  slug:                              varchar('slug', { length: 63 }).notNull(),
  name:                              text('name').notNull(),
  status:                            tenantStatusEnum('status').notNull().default('trialing'),
  plan_id:                           integer('plan_id').references(() => plans.id),
  owner_user_id:                     integer('owner_user_id'),
  primary_rut:                       varchar('primary_rut', { length: 12 }),
  billing_email:                     varchar('billing_email', { length: 255 }),
  branding:                          jsonb('branding'),
  trial_ends_at:                     timestamp('trial_ends_at', { withTimezone: true }),
  // Revenue-share editable per tenant (default 20% / 20%, see D-Pricing).
  revenue_share_rate_contabilidad:   decimal('revenue_share_rate_contabilidad', { precision: 5, scale: 4 })
    .notNull()
    .default('0.2000'),
  revenue_share_rate_remuneraciones: decimal('revenue_share_rate_remuneraciones', { precision: 5, scale: 4 })
    .notNull()
    .default('0.2000'),
  created_at:                        timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at:                        timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deleted_at:                        timestamp('deleted_at', { withTimezone: true }),
}, (t) => ({
  slugIdx:   uniqueIndex('tenant_slug_idx').on(t.slug),
  statusIdx: index('tenant_status_idx').on(t.status),
}))

export const plansRelations = relations(plans, ({ many }) => ({
  tenants: many(tenants),
}))

export const tenantsRelations = relations(tenants, ({ one }) => ({
  plan: one(plans, { fields: [tenants.plan_id], references: [plans.id] }),
}))
