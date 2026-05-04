-- Migration 0007: Phase 00 — Multi-tenant foundation
-- Crea tablas `tenants` y `plans`, agrega `tenant_id NULLABLE` a `companies`
-- y `audit_log`. El backfill + ALTER NOT NULL + RLS ocurren en T0.3 / T0.7
-- (migraciones posteriores).
--
-- Refs: docs/multitenancy/phase-00-foundation.md T0.2
--       Decisiones D1, D-Pricing en docs/multitenancy/decisions.md

-- ── Enum: tenant status ──────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "tenant_status" AS ENUM ('trialing', 'active', 'past_due', 'suspended', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Tabla: plans ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "plans" (
  "id"                          serial PRIMARY KEY,
  "code"                        varchar(32) NOT NULL UNIQUE,
  "name"                        text NOT NULL,
  "base_price_clp"              integer NOT NULL,
  "included_dtes"               integer NOT NULL DEFAULT 0,
  "included_companies"          integer NOT NULL DEFAULT 1,
  "overage_price_per_dte_clp"   integer NOT NULL DEFAULT 0,
  "features"                    jsonb,
  "revenue_share_enabled"       boolean NOT NULL DEFAULT true,
  "active"                      boolean NOT NULL DEFAULT true,
  "created_at"                  timestamp with time zone DEFAULT now(),
  "updated_at"                  timestamp with time zone DEFAULT now()
);

-- ── Tabla: tenants ───────────────────────────────────────────
-- D-Pricing: rates de revenue-share editables por tenant, default 20% / 20%.
CREATE TABLE IF NOT EXISTS "tenants" (
  "id"                                 serial PRIMARY KEY,
  "slug"                               varchar(63) NOT NULL,
  "name"                               text NOT NULL,
  "status"                             "tenant_status" NOT NULL DEFAULT 'trialing',
  "plan_id"                            integer REFERENCES "plans"("id"),
  "owner_user_id"                      integer,
  "primary_rut"                        varchar(12),
  "billing_email"                      varchar(255),
  "branding"                           jsonb,
  "trial_ends_at"                      timestamp with time zone,
  "revenue_share_rate_contabilidad"    numeric(5, 4) NOT NULL DEFAULT 0.2000,
  "revenue_share_rate_remuneraciones"  numeric(5, 4) NOT NULL DEFAULT 0.2000,
  "created_at"                         timestamp with time zone DEFAULT now(),
  "updated_at"                         timestamp with time zone DEFAULT now(),
  "deleted_at"                         timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_slug_idx"   ON "tenants" ("slug");
CREATE        INDEX IF NOT EXISTS "tenant_status_idx" ON "tenants" ("status");

-- ── companies.tenant_id (NULLABLE — se backfillea en T0.3) ───
ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "tenant_id" integer
  REFERENCES "tenants"("id");

CREATE INDEX IF NOT EXISTS "companies_tenant_idx" ON "companies" ("tenant_id");

-- ── audit_log.tenant_id (NULLABLE) ───────────────────────────
ALTER TABLE "audit_log"
  ADD COLUMN IF NOT EXISTS "tenant_id" integer
  REFERENCES "tenants"("id");

CREATE INDEX IF NOT EXISTS "audit_tenant_time_idx" ON "audit_log" ("tenant_id", "created_at");
