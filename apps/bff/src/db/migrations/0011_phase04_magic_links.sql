-- Migration 0011: Phase 04 — magic-link tokens for first login / password reset.
CREATE TABLE IF NOT EXISTS "magic_links" (
  "id"          serial PRIMARY KEY,
  "tenant_id"   integer REFERENCES "tenants"("id") ON DELETE CASCADE,
  "email"       varchar(255) NOT NULL,
  "token_hash"  varchar(64) NOT NULL,
  "purpose"     varchar(32) NOT NULL,
  "expires_at"  timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "metadata"    text,
  "created_at"  timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "magic_link_hash_idx"    ON "magic_links"("token_hash");
CREATE INDEX IF NOT EXISTS "magic_link_tenant_idx"  ON "magic_links"("tenant_id");
CREATE INDEX IF NOT EXISTS "magic_link_expires_idx" ON "magic_links"("expires_at");
