/**
 * Audit log writer.
 *
 * Helper around the `audit_log` table so call sites can record events
 * with consistent metadata. Tenant-scoped (uses tenant_id NOT NULL once
 * the rollout finishes; nullable today so legacy rows still fit).
 *
 * Usage:
 *   await audit({
 *     action: 'admin.tenant.suspended',
 *     tenant_id: tenant.id,
 *     actor_admin_id: req.superAdmin?.admin_id,
 *     resource: 'tenant', resource_id: tenant.id,
 *     payload: { reason: 'manual' },
 *   })
 */
import type { FastifyRequest } from 'fastify'
import { db } from '@/db/client'
import { auditLog } from '@/db/schema'
import { logger } from '@/core/logger'

export interface AuditEntry {
  action: string
  tenant_id?: number | null
  company_id?: number | null
  user_id?: number | null
  actor_admin_id?: number | null
  resource?: string
  resource_id?: number | null
  payload?: Record<string, unknown>
  ip?: string | null
  user_agent?: string | null
}

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    const merged: Record<string, unknown> = entry.payload ? { ...entry.payload } : {}
    if (entry.actor_admin_id != null) merged.actor_admin_id = entry.actor_admin_id

    await db.insert(auditLog).values({
      tenant_id:    entry.tenant_id ?? null,
      company_id:   entry.company_id ?? null,
      user_id:      entry.user_id ?? null,
      action:       entry.action,
      resource:     entry.resource ?? null,
      resource_id:  entry.resource_id ?? null,
      ip:           entry.ip ?? null,
      user_agent:   entry.user_agent ?? null,
      payload_json: Object.keys(merged).length > 0 ? merged : null,
    })
  } catch (err) {
    // Never let an audit write fail the originating request.
    logger.error({ err, action: entry.action }, 'audit.write_failed')
  }
}

/** Convenience wrapper that pulls IP/UA from a Fastify request. */
export async function auditFromRequest(
  request: FastifyRequest,
  entry: Omit<AuditEntry, 'ip' | 'user_agent'>,
): Promise<void> {
  await audit({
    ...entry,
    ip:         request.ip ?? null,
    user_agent: (request.headers['user-agent'] as string | undefined) ?? null,
  })
}
