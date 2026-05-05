/**
 * Notificaciones in-app del tenant.
 * Cron + servicios pueden insertar; UI las lee y marca leídas.
 */
import { pgTable, serial, integer, text, varchar, timestamp, boolean, index, jsonb } from 'drizzle-orm/pg-core'
import { tenants } from '@/db/schema/tenants'

export const notifications = pgTable('notifications', {
  id:          serial('id').primaryKey(),
  tenant_id:   integer('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  // Optional: if the notification is for a specific user, store the user_id; else null = tenant-wide.
  user_id:     integer('user_id'),
  level:       varchar('level', { length: 16 }).notNull(),  // 'info' | 'warning' | 'error' | 'success'
  title:       varchar('title', { length: 200 }).notNull(),
  body:        text('body'),
  href:        varchar('href', { length: 500 }),
  metadata:    jsonb('metadata'),
  read_at:     timestamp('read_at',     { withTimezone: true }),
  archived_at: timestamp('archived_at', { withTimezone: true }),
  created_at:  timestamp('created_at',  { withTimezone: true }).defaultNow(),
}, (t) => ({
  tenantUnreadIdx: index('notif_tenant_unread_idx').on(t.tenant_id, t.read_at),
  createdIdx:      index('notif_created_idx').on(t.created_at),
}))
