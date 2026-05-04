-- Migration 0010: Phase 03 — Revenue Share
-- Refs: docs/multitenancy/phase-03-revenue-share.md T3.1

DO $$ BEGIN CREATE TYPE "fee_type" AS ENUM ('contabilidad','remuneraciones'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "revenue_share_run_status" AS ENUM ('calculating','ready','invoiced','paid','locked'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "tenant_fees" (
  "id"           serial PRIMARY KEY,
  "tenant_id"    integer NOT NULL REFERENCES "tenants"("id")    ON DELETE CASCADE,
  "company_id"   integer NOT NULL REFERENCES "companies"("id")  ON DELETE CASCADE,
  "fee_type"     "fee_type" NOT NULL,
  "monthly_clp"  integer NOT NULL,
  "billing_day"  integer NOT NULL DEFAULT 1,
  "active"       boolean NOT NULL DEFAULT true,
  "valid_from"   date NOT NULL,
  "valid_to"     date,
  "notes"        text,
  "created_at"   timestamp with time zone DEFAULT now(),
  "updated_at"   timestamp with time zone DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_fee_unique"     ON "tenant_fees"("tenant_id","company_id","fee_type","valid_from");
CREATE        INDEX IF NOT EXISTS "tenant_fee_active_idx" ON "tenant_fees"("tenant_id","active");

CREATE TABLE IF NOT EXISTS "revenue_share_runs" (
  "id"                       serial PRIMARY KEY,
  "tenant_id"                integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "period"                   varchar(7) NOT NULL,
  "status"                   "revenue_share_run_status" NOT NULL DEFAULT 'calculating',
  "total_contabilidad_clp"   integer NOT NULL DEFAULT 0,
  "total_remuneraciones_clp" integer NOT NULL DEFAULT 0,
  "share_contabilidad_clp"   integer NOT NULL DEFAULT 0,
  "share_remuneraciones_clp" integer NOT NULL DEFAULT 0,
  "total_share_clp"          integer NOT NULL DEFAULT 0,
  "rate_contabilidad"        numeric(5,4) NOT NULL,
  "rate_remuneraciones"      numeric(5,4) NOT NULL,
  "invoice_id"               integer REFERENCES "invoices"("id"),
  "detail"                   jsonb,
  "calculated_at"            timestamp with time zone,
  "locked_at"                timestamp with time zone,
  "notes"                    text
);
CREATE UNIQUE INDEX IF NOT EXISTS "rs_run_tenant_period" ON "revenue_share_runs"("tenant_id","period");
CREATE        INDEX IF NOT EXISTS "rs_run_status_idx"    ON "revenue_share_runs"("status");
