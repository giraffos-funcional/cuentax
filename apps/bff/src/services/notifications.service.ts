import { eq, and, desc, isNull, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { notifications } from '@/db/schema'

export type NotificationLevel = 'info' | 'warning' | 'error' | 'success'

export interface NotificationInput {
  tenant_id: number
  user_id?: number | null
  level: NotificationLevel
  title: string
  body?: string
  href?: string
  metadata?: Record<string, unknown>
}

export async function notify(input: NotificationInput): Promise<{ id: number }> {
  const [row] = await db.insert(notifications).values({
    tenant_id: input.tenant_id,
    user_id:   input.user_id ?? null,
    level:     input.level,
    title:     input.title,
    body:      input.body ?? null,
    href:      input.href ?? null,
    metadata:  input.metadata ?? null,
  }).returning({ id: notifications.id })
  return { id: row!.id }
}

export async function listForTenant(tenantId: number, opts: { unread_only?: boolean; limit?: number } = {}) {
  const limit = Math.min(opts.limit ?? 50, 200)
  const where = opts.unread_only
    ? and(eq(notifications.tenant_id, tenantId), isNull(notifications.read_at), isNull(notifications.archived_at))
    : and(eq(notifications.tenant_id, tenantId), isNull(notifications.archived_at))
  const rows = await db.select().from(notifications).where(where).orderBy(desc(notifications.created_at)).limit(limit)
  return rows
}

export async function unreadCount(tenantId: number): Promise<number> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM notifications
    WHERE tenant_id = ${tenantId} AND read_at IS NULL AND archived_at IS NULL
  `)
  return Number(((r as any).rows?.[0] ?? (r as any)[0])?.n ?? 0)
}

export async function markRead(tenantId: number, id: number): Promise<boolean> {
  const r = await db.update(notifications)
    .set({ read_at: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.tenant_id, tenantId)))
    .returning({ id: notifications.id })
  return r.length > 0
}

export async function markAllRead(tenantId: number): Promise<number> {
  const r = await db.update(notifications)
    .set({ read_at: new Date() })
    .where(and(eq(notifications.tenant_id, tenantId), isNull(notifications.read_at)))
    .returning({ id: notifications.id })
  return r.length
}

export async function archive(tenantId: number, id: number): Promise<boolean> {
  const r = await db.update(notifications)
    .set({ archived_at: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.tenant_id, tenantId)))
    .returning({ id: notifications.id })
  return r.length > 0
}
