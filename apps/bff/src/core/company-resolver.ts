import { db } from '@/db/client'
import { companies } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { logger } from '@/core/logger'

// In-memory cache: odooId -> localId
const odooToLocalCache = new Map<number, number>()
const localToOdooCache = new Map<number, number>()

/**
 * Get the LOCAL database company ID for a given Odoo company ID.
 * Used before any local DB query/insert where company_id is a FK to companies table.
 */
export async function getLocalCompanyId(odooCompanyId: number): Promise<number> {
  // Check cache first
  const cached = odooToLocalCache.get(odooCompanyId)
  if (cached) return cached

  // Query local DB
  const [company] = await db.select({ id: companies.id, odoo_id: companies.odoo_company_id })
    .from(companies)
    .where(eq(companies.odoo_company_id, odooCompanyId))
    .limit(1)

  if (company) {
    odooToLocalCache.set(odooCompanyId, company.id)
    localToOdooCache.set(company.id, odooCompanyId)
    return company.id
  }

  // Fallback: maybe odoo_company_id IS the local id (legacy data or same IDs)
  const [fallback] = await db.select({ id: companies.id, odoo_id: companies.odoo_company_id })
    .from(companies)
    .where(eq(companies.id, odooCompanyId))
    .limit(1)

  if (fallback) {
    odooToLocalCache.set(odooCompanyId, fallback.id)
    return fallback.id
  }

  // Last resort: return the odooCompanyId as-is (may be the same)
  logger.warn({ odooCompanyId }, 'Could not resolve local company ID, using odoo ID as fallback')
  return odooCompanyId
}

/**
 * Get the Odoo company ID for a given local database company ID.
 */
export async function getOdooCompanyId(localCompanyId: number): Promise<number> {
  const cached = localToOdooCache.get(localCompanyId)
  if (cached) return cached

  const [company] = await db.select({ id: companies.id, odoo_id: companies.odoo_company_id })
    .from(companies)
    .where(eq(companies.id, localCompanyId))
    .limit(1)

  if (company && company.odoo_id) {
    localToOdooCache.set(localCompanyId, company.odoo_id)
    odooToLocalCache.set(company.odoo_id, localCompanyId)
    return company.odoo_id
  }

  return localCompanyId
}

/** Clear the cache (useful after company creation) */
export function clearCompanyCache() {
  odooToLocalCache.clear()
  localToOdooCache.clear()
}
