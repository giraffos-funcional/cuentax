-- Migration 0005: Budgets + Exchange Rates
-- Enables budget-vs-actual tracking per cost center and multi-currency support.

-- ═══════════════════════════════════════════════════════════
-- Budgets: monthly planning per (account_code, cost_center?)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "budgets" (
  "id"             serial PRIMARY KEY,
  "company_id"     integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "cost_center_id" integer REFERENCES "cost_centers"("id") ON DELETE SET NULL,
  "account_code"   varchar(50)  NOT NULL,
  "account_name"   varchar(200),
  "year"           integer NOT NULL,
  "month"          integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  "amount"         numeric(15,2) NOT NULL,
  "notes"          text,
  "created_at"     timestamptz DEFAULT now(),
  "updated_at"     timestamptz DEFAULT now()
);

CREATE INDEX        IF NOT EXISTS "bd_company_idx" ON "budgets" ("company_id");
CREATE INDEX        IF NOT EXISTS "bd_period_idx"  ON "budgets" ("company_id", "year", "month");
CREATE UNIQUE INDEX IF NOT EXISTS "bd_unique_idx"  ON "budgets" ("company_id", "year", "month", "account_code", "cost_center_id");

-- ═══════════════════════════════════════════════════════════
-- Exchange Rates: multi-currency support
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "exchange_rates" (
  "id"              serial PRIMARY KEY,
  "company_id"      integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "date"            date NOT NULL,
  "from_currency"   varchar(5) NOT NULL,
  "to_currency"     varchar(5) NOT NULL,
  "rate"            numeric(18,8) NOT NULL,   -- 1 from_currency = <rate> to_currency
  "source"          varchar(30),              -- 'manual' | 'sbif' | 'fixer' | etc
  "created_at"      timestamptz DEFAULT now()
);

CREATE INDEX        IF NOT EXISTS "er_company_idx"   ON "exchange_rates" ("company_id");
CREATE INDEX        IF NOT EXISTS "er_pair_idx"      ON "exchange_rates" ("company_id", "from_currency", "to_currency", "date" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "er_unique_idx"    ON "exchange_rates" ("company_id", "date", "from_currency", "to_currency");
