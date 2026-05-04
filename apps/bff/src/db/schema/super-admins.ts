/**
 * CUENTAX — Super Admins Schema
 * ==============================
 * Cross-tenant operators (Cuentax internal staff). Separate from tenant
 * users (which live in Odoo). These accounts authenticate at admin.cuentax.cl
 * and can provision tenants, impersonate, view metrics.
 *
 * Phase 01 — see docs/multitenancy/phase-01-admin.md T1.2
 */
import {
  pgTable, serial, text, varchar, timestamp,
  pgEnum, uniqueIndex, boolean,
} from 'drizzle-orm/pg-core'

export const superAdminRoleEnum = pgEnum('super_admin_role', [
  'owner',    // full access including DDL & impersonate
  'support',  // read + impersonate, no delete
  'finance',  // billing-related views only
])

export const superAdmins = pgTable('super_admins', {
  id:                     serial('id').primaryKey(),
  email:                  varchar('email', { length: 255 }).notNull(),
  // scrypt: hash + salt + params encoded as `scrypt$N$r$p$saltHex$hashHex`
  password_hash:          text('password_hash').notNull(),
  name:                   text('name'),
  role:                   superAdminRoleEnum('role').notNull().default('support'),
  totp_secret_enc:        text('totp_secret_enc'),     // base32 secret (AES-encrypted)
  totp_enabled:           boolean('totp_enabled').notNull().default(false),
  active:                 boolean('active').notNull().default(true),
  last_login_at:          timestamp('last_login_at', { withTimezone: true }),
  created_at:             timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at:             timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  emailIdx: uniqueIndex('super_admin_email_idx').on(t.email),
}))
