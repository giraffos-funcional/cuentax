-- Migration: Add multi-country support to CuentaX
-- Adds country_code, locale, currency, timezone, tax_id to companies
-- Adds transaction_classifications and classification_rules tables
-- All changes are ADDITIVE — no data loss, existing rows default to Chile

-- 1. Country code enum
DO $$ BEGIN
  CREATE TYPE "country_code" AS ENUM('CL', 'US');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Classification source enum
DO $$ BEGIN
  CREATE TYPE "classification_source" AS ENUM('ai', 'manual', 'rule');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Add country columns to companies
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "country_code" "country_code" NOT NULL DEFAULT 'CL';
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "locale" varchar(10) DEFAULT 'es-CL';
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "currency" varchar(5) DEFAULT 'CLP';
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "timezone" varchar(50) DEFAULT 'America/Santiago';
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "tax_id" varchar(50);
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "tax_id_type" varchar(20);
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "state" varchar(2);
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "zip_code" varchar(10);

-- 4. Make Chilean-specific columns nullable (rut was NOT NULL + UNIQUE)
ALTER TABLE "companies" ALTER COLUMN "rut" DROP NOT NULL;
ALTER TABLE "companies" ALTER COLUMN "giro" DROP NOT NULL;

-- 5. Backfill tax_id for existing Chilean companies
UPDATE "companies"
SET tax_id = rut, tax_id_type = 'rut'
WHERE rut IS NOT NULL AND tax_id IS NULL;

-- 6. Add country index
CREATE INDEX IF NOT EXISTS "companies_country_idx" ON "companies" ("country_code");

-- 7. Transaction classifications table
CREATE TABLE IF NOT EXISTS "transaction_classifications" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "bank_transaction_id" integer REFERENCES "bank_transactions"("id"),
  "original_description" text NOT NULL,
  "original_amount" numeric(15, 2) NOT NULL,
  "original_date" text,
  "classified_account_id" integer,
  "classified_account_name" text,
  "classified_category" varchar(100),
  "confidence" real,
  "classification_source" "classification_source" DEFAULT 'ai',
  "ai_reasoning" text,
  "approved" boolean DEFAULT false,
  "approved_by" integer,
  "approved_at" timestamptz,
  "odoo_move_id" integer,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "tc_company_idx" ON "transaction_classifications" ("company_id");
CREATE INDEX IF NOT EXISTS "tc_approved_idx" ON "transaction_classifications" ("company_id", "approved");
CREATE INDEX IF NOT EXISTS "tc_date_idx" ON "transaction_classifications" ("original_date");

-- 8. Classification rules table (learned vendor patterns)
CREATE TABLE IF NOT EXISTS "classification_rules" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "vendor_pattern" text NOT NULL,
  "account_id" integer NOT NULL,
  "account_name" text,
  "category" varchar(100),
  "hit_count" integer DEFAULT 0,
  "last_used_at" timestamptz,
  "created_at" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cr_company_idx" ON "classification_rules" ("company_id");
CREATE INDEX IF NOT EXISTS "cr_pattern_idx" ON "classification_rules" ("company_id", "vendor_pattern");
