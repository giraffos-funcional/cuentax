/**
 * Tenant-scoped transaction helper.
 *
 * Wrap a unit of work in a single connection's transaction so that
 * `SET LOCAL app.current_tenant = $tenantId` is honored by every query
 * inside the callback (this is what RLS policies read).
 *
 * Usage:
 *   await withTenantTx(tenantId, async (tx) => {
 *     // tx is a Drizzle DB bound to the same connection.
 *     // Any query run via `tx.select()...` will see RLS enforced.
 *   })
 *
 * Adoption is incremental: existing routes that filter by company_id at
 * the app layer continue to work. New tenant-scoped code paths (admin,
 * billing, revenue-share) should opt into this helper.
 *
 * Refs: docs/multitenancy/phase-00-foundation.md T0.6, T0.7
 */
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { PoolClient } from 'pg'
import * as schema from '@/db/schema'
import { pool } from '@/db/client'

export type TenantTx = NodePgDatabase<typeof schema>

const SETTING_KEY = 'app.current_tenant'

export async function withTenantTx<T>(
  tenantId: number,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new Error(`Invalid tenantId: ${tenantId}`)
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SET LOCAL ${SETTING_KEY} = $1`, [String(tenantId)])
    const tx: TenantTx = drizzle(client as PoolClient, { schema })
    const result = await fn(tx)
    await client.query('COMMIT')
    return result
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* ignore rollback errors */
    }
    throw err
  } finally {
    client.release()
  }
}
