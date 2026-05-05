-- Migration 0012:
--   1. notifications table (in-app)
--   2. audit_log immutability via trigger (block UPDATE/DELETE except by cuentax_admin)

CREATE TABLE IF NOT EXISTS "notifications" (
  "id"          serial PRIMARY KEY,
  "tenant_id"   integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id"     integer,
  "level"       varchar(16) NOT NULL,
  "title"       varchar(200) NOT NULL,
  "body"        text,
  "href"        varchar(500),
  "metadata"    jsonb,
  "read_at"     timestamp with time zone,
  "archived_at" timestamp with time zone,
  "created_at"  timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "notif_tenant_unread_idx" ON "notifications"("tenant_id","read_at");
CREATE INDEX IF NOT EXISTS "notif_created_idx"       ON "notifications"("created_at");

-- ── Audit immutability ───────────────────────────────────────
-- Block UPDATE/DELETE on audit_log unless the role is cuentax_admin
-- (used by maintenance scripts). Application connections cannot mutate
-- existing audit rows, only INSERT new ones.
CREATE OR REPLACE FUNCTION audit_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user = 'cuentax_admin' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

DROP TRIGGER IF EXISTS audit_log_no_delete ON audit_log;
CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
