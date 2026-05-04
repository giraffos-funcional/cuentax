/**
 * T0.3 — Backfill legacy tenant + ALTER NOT NULL.
 *
 * Crea un tenant `legacy` (slug=`app`) y asigna todas las companies y rows
 * de audit_log existentes a ese tenant. Después puede correrse con
 * `--enforce-not-null` para hacer ALTER COLUMN tenant_id SET NOT NULL.
 *
 * Idempotente: corre múltiples veces sin efecto si ya está backfilleado.
 *
 * Uso:
 *   pnpm --filter @cuentax/bff exec tsx scripts/backfill-tenants.ts
 *   pnpm --filter @cuentax/bff exec tsx scripts/backfill-tenants.ts --enforce-not-null
 */
import { pool } from '@/db/client'
import { logger } from '@/core/logger'

const LEGACY_SLUG = 'app'
const LEGACY_NAME = 'Legacy (pre-tenancy)'

async function ensureLegacyTenant(): Promise<number> {
  const sel = await pool.query<{ id: number }>(
    'SELECT id FROM tenants WHERE slug = $1 LIMIT 1',
    [LEGACY_SLUG],
  )
  if (sel.rows[0]?.id) return Number(sel.rows[0].id)

  const ins = await pool.query<{ id: number }>(
    `INSERT INTO tenants (slug, name, status)
     VALUES ($1, $2, 'active')
     RETURNING id`,
    [LEGACY_SLUG, LEGACY_NAME],
  )
  return Number(ins.rows[0].id)
}

async function backfill(tenantId: number): Promise<{ companies: number; auditLog: number }> {
  const c = await pool.query(
    'UPDATE companies SET tenant_id = $1 WHERE tenant_id IS NULL',
    [tenantId],
  )
  const a = await pool.query(
    'UPDATE audit_log SET tenant_id = $1 WHERE tenant_id IS NULL',
    [tenantId],
  )
  return {
    companies: c.rowCount ?? 0,
    auditLog: a.rowCount ?? 0,
  }
}

async function enforceNotNull(): Promise<void> {
  const missing = await pool.query<{ companies_null: string; audit_null: string }>(
    `SELECT
       (SELECT count(*) FROM companies WHERE tenant_id IS NULL) AS companies_null,
       (SELECT count(*) FROM audit_log WHERE tenant_id IS NULL) AS audit_null`,
  )
  const row = missing.rows[0]
  if (Number(row.companies_null) > 0 || Number(row.audit_null) > 0) {
    throw new Error(
      `Cannot enforce NOT NULL: companies_null=${row.companies_null} audit_null=${row.audit_null}`,
    )
  }
  await pool.query('ALTER TABLE companies ALTER COLUMN tenant_id SET NOT NULL')
  await pool.query('ALTER TABLE audit_log ALTER COLUMN tenant_id SET NOT NULL')
  logger.info('✅ tenant_id NOT NULL enforced on companies + audit_log')
}

async function main(): Promise<void> {
  const enforce = process.argv.includes('--enforce-not-null')

  const tenantId = await ensureLegacyTenant()
  logger.info({ tenantId, slug: LEGACY_SLUG }, 'Legacy tenant ready')

  const counts = await backfill(tenantId)
  logger.info(counts, 'Backfill complete')

  if (enforce) {
    await enforceNotNull()
  } else {
    logger.info('Skipped NOT NULL enforcement (pass --enforce-not-null to apply)')
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'Backfill failed')
    process.exit(1)
  })

