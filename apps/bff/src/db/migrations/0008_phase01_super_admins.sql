-- Migration 0008: Phase 01 — Super Admins
-- Tabla cross-tenant para operadores internos de Cuentax (no son users de tenant).
--
-- Refs: docs/multitenancy/phase-01-admin.md T1.2

DO $$ BEGIN
  CREATE TYPE "super_admin_role" AS ENUM ('owner', 'support', 'finance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "super_admins" (
  "id"                serial PRIMARY KEY,
  "email"             varchar(255) NOT NULL,
  "password_hash"     text NOT NULL,
  "name"              text,
  "role"              "super_admin_role" NOT NULL DEFAULT 'support',
  "totp_secret_enc"   text,
  "totp_enabled"      boolean NOT NULL DEFAULT false,
  "active"            boolean NOT NULL DEFAULT true,
  "last_login_at"     timestamp with time zone,
  "created_at"        timestamp with time zone DEFAULT now(),
  "updated_at"        timestamp with time zone DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "super_admin_email_idx" ON "super_admins" (LOWER("email"));
