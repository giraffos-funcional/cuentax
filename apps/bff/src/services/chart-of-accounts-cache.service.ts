/**
 * CUENTAX — Chart of Accounts Cache (Redis)
 * ============================================
 * Short-lived per-company cache to avoid fetching the full chart of accounts
 * from Odoo on every import. TTL of 5 minutes — short enough to pick up
 * changes quickly, long enough to amortize cost across batches.
 */

import { redis } from '@/adapters/redis.adapter'
import { odooAccountingAdapter } from '@/adapters/odoo-accounting.adapter'
import { logger } from '@/core/logger'

export interface ChartAccount {
  id: number
  code: string
  name: string
  account_type: string
}

const CACHE_KEY = (odooCompanyId: number) => `cuentax:chart:${odooCompanyId}`
const CACHE_TTL_SECONDS = 300  // 5 minutes

/**
 * Get the full chart of accounts for a company. Cached in Redis.
 * Returns empty array on error (caller should handle).
 */
export async function getChartOfAccounts(odooCompanyId: number): Promise<ChartAccount[]> {
  const key = CACHE_KEY(odooCompanyId)
  try {
    if (redis.status === 'ready') {
      const cached = await redis.get(key)
      if (cached) {
        try {
          return JSON.parse(cached) as ChartAccount[]
        } catch { /* fall through to refetch */ }
      }
    }
  } catch (err) {
    logger.warn({ err, odooCompanyId }, 'Chart of accounts cache read failed — refetching')
  }

  // Fetch from Odoo
  try {
    const raw = await odooAccountingAdapter.searchRead(
      'account.account',
      [['company_ids', 'in', [odooCompanyId]]],
      ['id', 'code', 'name', 'account_type'],
      { limit: 500, context: { allowed_company_ids: [odooCompanyId], company_id: odooCompanyId } },
    ) as Array<{ id: number; code: string | false; name: string; account_type: string }>

    const accounts: ChartAccount[] = raw.map(a => ({
      id: a.id,
      code: a.code === false ? '' : (a.code ?? ''),
      name: a.name ?? '',
      account_type: a.account_type ?? '',
    }))

    // Store in Redis (fire-and-forget)
    if (redis.status === 'ready') {
      redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(accounts)).catch(err => {
        logger.warn({ err, odooCompanyId }, 'Chart of accounts cache write failed')
      })
    }

    return accounts
  } catch (err) {
    logger.error({ err, odooCompanyId }, 'Failed to fetch chart of accounts from Odoo')
    return []
  }
}

/** Invalidate the cache for a company (call after setup or structural change). */
export async function invalidateChartCache(odooCompanyId: number): Promise<void> {
  try {
    if (redis.status === 'ready') {
      await redis.del(CACHE_KEY(odooCompanyId))
    }
  } catch (err) {
    logger.warn({ err, odooCompanyId }, 'Chart of accounts cache invalidate failed')
  }
}
