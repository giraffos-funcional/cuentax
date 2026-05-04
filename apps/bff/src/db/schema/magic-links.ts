/**
 * Magic-link tokens for first-login + password reset (Phase 04).
 * Single-use tokens (consumed_at), 24h TTL by default.
 */
import { pgTable, serial, integer, varchar, text, timestamp, index } from 'drizzle-orm/pg-core'
import { tenants } from '@/db/schema/tenants'

export const magicLinks = pgTable('magic_links', {
  id:          serial('id').primaryKey(),
  tenant_id:   integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  email:       varchar('email', { length: 255 }).notNull(),
  token_hash:  varchar('token_hash', { length: 64 }).notNull(),  // sha-256 hex
  purpose:     varchar('purpose', { length: 32 }).notNull(),     // 'first_login' | 'password_reset'
  expires_at:  timestamp('expires_at',  { withTimezone: true }).notNull(),
  consumed_at: timestamp('consumed_at', { withTimezone: true }),
  metadata:    text('metadata'),
  created_at:  timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  hashIdx:    index('magic_link_hash_idx').on(t.token_hash),
  tenantIdx:  index('magic_link_tenant_idx').on(t.tenant_id),
  expiresIdx: index('magic_link_expires_idx').on(t.expires_at),
}))
