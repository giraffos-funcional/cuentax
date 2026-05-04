-- ═══════════════════════════════════════════════════════════════════
-- CUENTAX — Row-Level Security Policies (Phase 00, T0.7)
-- ═══════════════════════════════════════════════════════════════════
--
-- Enables RLS on every business table. The active tenant is read from
-- the GUC `app.current_tenant`, set per-request via `withTenantTx()`.
--
-- Strategy:
--   • `companies` filters directly by tenant_id (denormalized).
--   • `audit_log` filters directly by tenant_id (denormalized).
--   • Every other tenant-scoped table joins through companies. We use
--     `current_setting(..., true)` so the policies are inert when no
--     tenant is set (returns null → all FALSE → zero rows).
--
-- Bypass:
--   • Role `cuentax_admin` (used by billing crons, migrations, support)
--     gets BYPASSRLS so it can read across tenants.
--
-- This script is idempotent (DROP POLICY IF EXISTS … CREATE POLICY …).
--
-- Refs: docs/multitenancy/phase-00-foundation.md T0.7
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ── Helpers ────────────────────────────────────────────────────────
-- Resolve the current tenant id from the request GUC. Returns NULL if
-- not set (e.g. legacy connections that haven't run withTenantTx).
CREATE OR REPLACE FUNCTION app_current_tenant()
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_tenant', true), '')::integer
$$;

-- ── Admin role with bypass ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cuentax_admin') THEN
    CREATE ROLE cuentax_admin BYPASSRLS NOLOGIN;
  ELSE
    ALTER ROLE cuentax_admin BYPASSRLS;
  END IF;
END $$;

-- ── Direct-tenant tables ───────────────────────────────────────────
ALTER TABLE companies   ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies   FORCE  ROW LEVEL SECURITY;
ALTER TABLE audit_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log   FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companies_tenant_isolation ON companies;
CREATE POLICY companies_tenant_isolation ON companies
  USING       (tenant_id = app_current_tenant())
  WITH CHECK  (tenant_id = app_current_tenant());

DROP POLICY IF EXISTS audit_log_tenant_isolation ON audit_log;
CREATE POLICY audit_log_tenant_isolation ON audit_log
  USING       (tenant_id = app_current_tenant())
  WITH CHECK  (tenant_id = app_current_tenant());

-- ── Tenant-scoped (via companies) ──────────────────────────────────
-- Macro: enable RLS + a policy that constrains rows to companies the
-- active tenant owns.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'dte_documents',
    'quotations',
    'purchase_orders',
    'contacts',
    'products',
    'caf_configs',
    'rcv_registros',
    'rcv_detalles',
    'bank_accounts',
    'bank_transactions',
    'gastos',
    'transaction_classifications',
    'classification_rules',
    'cost_centers',
    'budgets',
    'exchange_rates',
    'dtes_recibidos',
    'push_tokens',
    'api_keys',
    'webhook_endpoints'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Only act on tables that actually exist (some are optional).
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE 'skip: % (not present)', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_isolation ON %I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_tenant_isolation ON %I
        USING (
          company_id IN (
            SELECT id FROM companies WHERE tenant_id = app_current_tenant()
          )
        )
        WITH CHECK (
          company_id IN (
            SELECT id FROM companies WHERE tenant_id = app_current_tenant()
          )
        )
    $f$, t, t);
  END LOOP;
END $$;

COMMIT;
