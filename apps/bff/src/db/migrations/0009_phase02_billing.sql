-- Migration 0009: Phase 02 — Billing (Mercado Pago)
-- Subscriptions, invoices, line items, payments, dunning.
--
-- Refs: docs/multitenancy/phase-02-billing.md T2.2

-- ── Enums ────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "subscription_status" AS ENUM ('trialing','active','past_due','cancelled','paused'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "invoice_status"      AS ENUM ('draft','issued','paid','past_due','void');         EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "payment_status"      AS ENUM ('pending','approved','rejected','refunded','in_process'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "line_item_type"      AS ENUM ('subscription','overage','revenue_share_contabilidad','revenue_share_remuneraciones','adjustment'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "dunning_outcome"     AS ENUM ('success','failed','skipped'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── subscriptions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id"                       serial PRIMARY KEY,
  "tenant_id"                integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "plan_id"                  integer NOT NULL REFERENCES "plans"("id"),
  "status"                   "subscription_status" NOT NULL DEFAULT 'trialing',
  "payment_provider"         varchar(16) NOT NULL DEFAULT 'mercadopago',
  "provider_subscription_id" varchar(64),
  "payment_method_token"     varchar(255),
  "current_period_start"     timestamp with time zone,
  "current_period_end"       timestamp with time zone,
  "cancel_at_period_end"     boolean NOT NULL DEFAULT false,
  "trial_ends_at"            timestamp with time zone,
  "created_at"               timestamp with time zone DEFAULT now(),
  "updated_at"               timestamp with time zone DEFAULT now(),
  "cancelled_at"             timestamp with time zone
);
CREATE        INDEX IF NOT EXISTS "subscription_tenant_idx"       ON "subscriptions"("tenant_id");
CREATE        INDEX IF NOT EXISTS "subscription_status_idx"       ON "subscriptions"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_provider_sub_idx" ON "subscriptions"("provider_subscription_id") WHERE "provider_subscription_id" IS NOT NULL;

-- ── invoices ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "invoices" (
  "id"               serial PRIMARY KEY,
  "tenant_id"        integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "subscription_id"  integer REFERENCES "subscriptions"("id"),
  "period"           varchar(7) NOT NULL,
  "status"           "invoice_status" NOT NULL DEFAULT 'draft',
  "subtotal_clp"     integer NOT NULL DEFAULT 0,
  "iva_clp"          integer NOT NULL DEFAULT 0,
  "total_clp"        integer NOT NULL DEFAULT 0,
  "dte_id"           integer,
  "issued_at"        timestamp with time zone,
  "due_at"           timestamp with time zone,
  "paid_at"          timestamp with time zone,
  "metadata"         jsonb,
  "created_at"       timestamp with time zone DEFAULT now(),
  "updated_at"       timestamp with time zone DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_tenant_period_idx" ON "invoices"("tenant_id","period");
CREATE        INDEX IF NOT EXISTS "invoice_status_idx"        ON "invoices"("status");
CREATE        INDEX IF NOT EXISTS "invoice_due_idx"           ON "invoices"("status","due_at");

-- ── invoice_line_items ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "invoice_line_items" (
  "id"             serial PRIMARY KEY,
  "invoice_id"     integer NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE,
  "type"           "line_item_type" NOT NULL,
  "description"    text NOT NULL,
  "quantity"       integer NOT NULL DEFAULT 1,
  "unit_price_clp" integer NOT NULL DEFAULT 0,
  "amount_clp"     integer NOT NULL,
  "metadata"       jsonb
);
CREATE INDEX IF NOT EXISTS "line_item_invoice_idx" ON "invoice_line_items"("invoice_id");
CREATE INDEX IF NOT EXISTS "line_item_type_idx"    ON "invoice_line_items"("invoice_id","type");

-- ── payments ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "payments" (
  "id"              serial PRIMARY KEY,
  "invoice_id"      integer REFERENCES "invoices"("id"),
  "tenant_id"       integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "provider"        varchar(16) NOT NULL DEFAULT 'mercadopago',
  "provider_txn_id" varchar(64) NOT NULL,
  "amount_clp"      integer NOT NULL,
  "status"          "payment_status" NOT NULL,
  "failure_reason"  text,
  "raw_payload"     jsonb,
  "created_at"      timestamp with time zone DEFAULT now(),
  "updated_at"      timestamp with time zone DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "payment_provider_txn_idx" ON "payments"("provider","provider_txn_id");
CREATE        INDEX IF NOT EXISTS "payment_invoice_idx"      ON "payments"("invoice_id");
CREATE        INDEX IF NOT EXISTS "payment_tenant_idx"       ON "payments"("tenant_id");

-- ── dunning_attempts ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "dunning_attempts" (
  "id"             serial PRIMARY KEY,
  "invoice_id"     integer NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE,
  "tenant_id"      integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "attempt_number" integer NOT NULL,
  "attempted_at"   timestamp with time zone DEFAULT now(),
  "outcome"        "dunning_outcome" NOT NULL,
  "notes"          text
);
CREATE UNIQUE INDEX IF NOT EXISTS "dunning_invoice_attempt_idx" ON "dunning_attempts"("invoice_id","attempt_number");
CREATE        INDEX IF NOT EXISTS "dunning_tenant_idx"          ON "dunning_attempts"("tenant_id");
