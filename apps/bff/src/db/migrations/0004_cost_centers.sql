-- Migration: Cost Centers (analytic accounts)
-- Adds cost_centers table + cost_center_id FK on transaction_classifications.
-- Generic feature: works for Airbnb properties, construction projects, law
-- firm cases, retail stores, departments, etc. Each row mirrors an Odoo
-- account.analytic.account with the addition of keyword matching.

CREATE TABLE IF NOT EXISTS "cost_centers" (
  "id"               serial PRIMARY KEY,
  "company_id"       integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "odoo_analytic_id" integer NOT NULL,
  "odoo_plan_id"     integer,
  "plan_name"        varchar(100),
  "name"             varchar(200) NOT NULL,
  "code"             varchar(50),
  "keywords"         jsonb NOT NULL DEFAULT '[]'::jsonb,
  "airbnb_listing"   varchar(200),
  "parent_id"        integer,
  "active"           boolean DEFAULT true,
  "notes"            text,
  "created_at"       timestamptz DEFAULT now(),
  "updated_at"       timestamptz DEFAULT now()
);

CREATE INDEX        IF NOT EXISTS "cc_company_idx"          ON "cost_centers" ("company_id");
CREATE UNIQUE INDEX IF NOT EXISTS "cc_company_odoo_idx"     ON "cost_centers" ("company_id", "odoo_analytic_id");
CREATE INDEX        IF NOT EXISTS "cc_active_idx"           ON "cost_centers" ("company_id", "active");
CREATE INDEX        IF NOT EXISTS "cc_airbnb_listing_idx"   ON "cost_centers" ("company_id", "airbnb_listing");

-- Self-referencing FK for hierarchy (after table creation to avoid ordering issues)
DO $$ BEGIN
  ALTER TABLE "cost_centers"
    ADD CONSTRAINT "cc_parent_fk" FOREIGN KEY ("parent_id")
    REFERENCES "cost_centers"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add cost_center_id column to transaction_classifications
ALTER TABLE "transaction_classifications"
  ADD COLUMN IF NOT EXISTS "cost_center_id" integer;

-- Add FK (nullable, SET NULL on delete so we don't lose classifications)
DO $$ BEGIN
  ALTER TABLE "transaction_classifications"
    ADD CONSTRAINT "tc_cost_center_fk" FOREIGN KEY ("cost_center_id")
    REFERENCES "cost_centers"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "tc_cost_center_idx" ON "transaction_classifications" ("cost_center_id");
