/**
 * CUENTAX — Push Tokens Schema (Drizzle ORM)
 * =============================================
 * Stores Expo push notification tokens per device.
 * Multi-tenant: company_id scoped, unique per (company, user, device).
 */

import {
  pgTable, serial, integer, varchar, boolean,
  timestamp, uniqueIndex, index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { companies } from '@/db/schema'

// ══════════════════════════════════════════════════════════════
// PUSH TOKENS (Expo Push Notification tokens)
// ══════════════════════════════════════════════════════════════
export const pushTokens = pgTable('push_tokens', {
  id:               serial('id').primaryKey(),
  company_id:       integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  user_id:          integer('user_id').notNull(),
  expo_push_token:  varchar('expo_push_token', { length: 255 }).notNull(),
  device_id:        varchar('device_id', { length: 255 }).notNull(),
  platform:         varchar('platform', { length: 20 }).notNull(), // 'ios' | 'android'
  active:           boolean('active').default(true),
  created_at:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  companyUserDeviceIdx: uniqueIndex('push_tokens_company_user_device_idx').on(t.company_id, t.user_id, t.device_id),
  companyActiveIdx:     index('push_tokens_company_active_idx').on(t.company_id, t.active),
}))

export const pushTokensRelations = relations(pushTokens, ({ one }) => ({
  company: one(companies, { fields: [pushTokens.company_id], references: [companies.id] }),
}))
