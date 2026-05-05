/**
 * API keys del tenant — issue/list/revoke con rotación.
 * Las claves se muestran UNA SOLA VEZ al crearlas; lo que persiste
 * es el sha-256 del valor + el prefijo (10 chars) para que el usuario
 * sepa cuál es cuál.
 */
import { createHash, randomBytes } from 'crypto'
import { eq, and, inArray } from 'drizzle-orm'
import { db } from '@/db/client'
import { apiKeys, companies } from '@/db/schema'

const PREFIX = 'cx_live_'

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export interface IssuedApiKey {
  id: number
  name: string
  key_prefix: string
  scopes: string[]
  expires_at: string | null
  raw_key: string  // ONLY returned at issue time
}

export async function issueApiKey(input: {
  companyId: number
  name: string
  scopes: string[]
  expiresAt?: Date | null
}): Promise<IssuedApiKey> {
  const raw = `${PREFIX}${randomBytes(24).toString('base64url')}`
  const key_hash = hashKey(raw)
  const key_prefix = raw.slice(0, 10)

  const [row] = await db
    .insert(apiKeys)
    .values({
      company_id: input.companyId,
      name:       input.name,
      key_hash,
      key_prefix,
      scopes:     input.scopes,
      expires_at: input.expiresAt ?? null,
      activo:     true,
    })
    .returning()

  if (!row) throw new Error('Failed to insert api_key')
  return {
    id:         row.id,
    name:       row.name,
    key_prefix: row.key_prefix ?? key_prefix,
    scopes:     row.scopes ?? input.scopes,
    expires_at: row.expires_at ? row.expires_at.toISOString() : null,
    raw_key:    raw,
  }
}

export async function listApiKeysForTenant(tenantId: number): Promise<Array<{
  id: number
  company_id: number
  name: string
  key_prefix: string | null
  scopes: string[]
  last_used_at: string | null
  expires_at: string | null
  activo: boolean
  created_at: string | null
}>> {
  const tenantCompanies = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.tenant_id, tenantId))
  const companyIds = tenantCompanies.map((c) => c.id)
  if (companyIds.length === 0) return []
  const rows = await db.select().from(apiKeys).where(inArray(apiKeys.company_id, companyIds))
  return rows.map((r) => ({
    id:           r.id,
    company_id:   r.company_id,
    name:         r.name,
    key_prefix:   r.key_prefix,
    scopes:       r.scopes ?? [],
    last_used_at: r.last_used_at ? r.last_used_at.toISOString() : null,
    expires_at:   r.expires_at   ? r.expires_at.toISOString()   : null,
    activo:       r.activo ?? true,
    created_at:   r.created_at   ? r.created_at.toISOString()   : null,
  }))
}

export async function revokeApiKey(input: { id: number; tenantId: number }): Promise<boolean> {
  // Validate ownership: the api_key must belong to a company under this tenant.
  const tenantCompanies = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.tenant_id, input.tenantId))
  const companyIds = tenantCompanies.map((c) => c.id)
  if (companyIds.length === 0) return false
  const result = await db
    .update(apiKeys)
    .set({ activo: false })
    .where(and(eq(apiKeys.id, input.id), inArray(apiKeys.company_id, companyIds)))
    .returning({ id: apiKeys.id })
  return result.length > 0
}

export async function rotateApiKey(input: {
  id: number
  tenantId: number
}): Promise<IssuedApiKey | null> {
  // Find the existing key + ensure it belongs to a tenant company.
  const tenantCompanies = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.tenant_id, input.tenantId))
  const companyIds = tenantCompanies.map((c) => c.id)
  if (companyIds.length === 0) return null

  const existing = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.id, input.id), inArray(apiKeys.company_id, companyIds)))
    .limit(1)
  const row = existing[0]
  if (!row) return null

  // Issue a new key against the same company + name + scopes; deactivate the old one.
  const issued = await issueApiKey({
    companyId: row.company_id,
    name:      `${row.name} (rotated)`,
    scopes:    row.scopes ?? [],
    expiresAt: row.expires_at,
  })
  await db.update(apiKeys).set({ activo: false }).where(eq(apiKeys.id, row.id))
  return issued
}

export async function findActiveKeyByValue(raw: string): Promise<{
  api_key_id: number
  company_id: number
  scopes: string[]
} | null> {
  const key_hash = hashKey(raw)
  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.key_hash, key_hash), eq(apiKeys.activo, true)))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  if (row.expires_at && row.expires_at.getTime() < Date.now()) return null
  // Best-effort touch of last_used_at (don't await)
  db.update(apiKeys).set({ last_used_at: new Date() }).where(eq(apiKeys.id, row.id)).catch(() => {})
  return { api_key_id: row.id, company_id: row.company_id, scopes: row.scopes ?? [] }
}
