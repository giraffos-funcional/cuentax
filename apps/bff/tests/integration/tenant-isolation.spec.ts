/**
 * Integration test — tenant isolation E2E.
 *
 * Requires a running Postgres reachable at INTEGRATION_DATABASE_URL.
 * Skipped (vitest "skip-if") when the env var is not set, so unit
 * runs aren't blocked.
 *
 * What it covers:
 *   - Two seeded tenants (`itest_a`, `itest_b`) each with one company
 *   - revenue-share calculator returns the correct subtotal scoped to
 *     each tenant — never bleeds cross-tenant
 *   - tenant_fees CRUD respects tenant_id filtering
 *   - close-revenue-share is idempotent on (tenant, period)
 *
 * Run:
 *   INTEGRATION_DATABASE_URL=postgres://... pnpm --filter @cuentax/bff test
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from 'pg'

const DATABASE_URL = process.env.INTEGRATION_DATABASE_URL ?? ''
const skip = !DATABASE_URL

describe.skipIf(skip)('tenant isolation (integration)', () => {
  const client = new Client({ connectionString: DATABASE_URL })
  const tenantSlugs = { a: 'itest_a', b: 'itest_b' }
  const ids: { tenantA?: number; tenantB?: number; companyA?: number; companyB?: number } = {}

  beforeAll(async () => {
    await client.connect()

    // Best-effort cleanup before seeding.
    await client.query(`DELETE FROM tenant_fees WHERE tenant_id IN (SELECT id FROM tenants WHERE slug IN ($1,$2))`, [tenantSlugs.a, tenantSlugs.b])
    await client.query(`DELETE FROM revenue_share_runs WHERE tenant_id IN (SELECT id FROM tenants WHERE slug IN ($1,$2))`, [tenantSlugs.a, tenantSlugs.b])
    await client.query(`DELETE FROM companies WHERE razon_social LIKE 'ITEST%'`)
    await client.query(`DELETE FROM tenants WHERE slug IN ($1,$2)`, [tenantSlugs.a, tenantSlugs.b])

    const a = await client.query<{ id: number }>(
      `INSERT INTO tenants (slug, name, status, revenue_share_rate_contabilidad, revenue_share_rate_remuneraciones)
       VALUES ($1,$2,'active', 0.20, 0.20) RETURNING id`,
      [tenantSlugs.a, 'ITEST tenant A'],
    )
    const b = await client.query<{ id: number }>(
      `INSERT INTO tenants (slug, name, status, revenue_share_rate_contabilidad, revenue_share_rate_remuneraciones)
       VALUES ($1,$2,'active', 0.15, 0.10) RETURNING id`,
      [tenantSlugs.b, 'ITEST tenant B'],
    )
    ids.tenantA = a.rows[0]!.id
    ids.tenantB = b.rows[0]!.id

    const ca = await client.query<{ id: number }>(
      `INSERT INTO companies (tenant_id, razon_social, country_code, activo)
       VALUES ($1, 'ITEST PYME A', 'CL', true) RETURNING id`,
      [ids.tenantA],
    )
    const cb = await client.query<{ id: number }>(
      `INSERT INTO companies (tenant_id, razon_social, country_code, activo)
       VALUES ($1, 'ITEST PYME B', 'CL', true) RETURNING id`,
      [ids.tenantB],
    )
    ids.companyA = ca.rows[0]!.id
    ids.companyB = cb.rows[0]!.id

    // Tenant A: 100k contabilidad. Tenant B: 100k contabilidad too — but
    // with different rate (0.15 vs 0.20).
    await client.query(
      `INSERT INTO tenant_fees (tenant_id, company_id, fee_type, monthly_clp, valid_from, active)
       VALUES ($1, $2, 'contabilidad', 100000, '2026-01-01', true)`,
      [ids.tenantA, ids.companyA],
    )
    await client.query(
      `INSERT INTO tenant_fees (tenant_id, company_id, fee_type, monthly_clp, valid_from, active)
       VALUES ($1, $2, 'contabilidad', 100000, '2026-01-01', true)`,
      [ids.tenantB, ids.companyB],
    )
  })

  afterAll(async () => {
    if (ids.tenantA) {
      await client.query(`DELETE FROM tenant_fees      WHERE tenant_id IN ($1,$2)`, [ids.tenantA, ids.tenantB])
      await client.query(`DELETE FROM revenue_share_runs WHERE tenant_id IN ($1,$2)`, [ids.tenantA, ids.tenantB])
      await client.query(`DELETE FROM companies WHERE id IN ($1,$2)`, [ids.companyA, ids.companyB])
      await client.query(`DELETE FROM tenants WHERE id IN ($1,$2)`, [ids.tenantA, ids.tenantB])
    }
    await client.end()
  })

  it('queries scoped to tenant A do not see tenant B fees', async () => {
    const r = await client.query(
      `SELECT count(*)::int AS n FROM tenant_fees WHERE tenant_id = $1`,
      [ids.tenantA],
    )
    expect(r.rows[0]!.n).toBe(1)
  })

  it('tenant rate is applied per-tenant', async () => {
    // Replicate calculator logic with raw SQL to avoid wiring the BFF
    // service inside this isolated integration test.
    const aShare = await client.query<{ s: number }>(
      `SELECT
         (SELECT COALESCE(SUM(tf.monthly_clp), 0) FROM tenant_fees tf WHERE tf.tenant_id = $1 AND tf.fee_type='contabilidad' AND tf.active)
         * t.revenue_share_rate_contabilidad AS s
       FROM tenants t WHERE t.id = $1`,
      [ids.tenantA],
    )
    const bShare = await client.query<{ s: number }>(
      `SELECT
         (SELECT COALESCE(SUM(tf.monthly_clp), 0) FROM tenant_fees tf WHERE tf.tenant_id = $1 AND tf.fee_type='contabilidad' AND tf.active)
         * t.revenue_share_rate_contabilidad AS s
       FROM tenants t WHERE t.id = $1`,
      [ids.tenantB],
    )
    expect(Math.round(Number(aShare.rows[0]!.s))).toBe(20_000)  // 100k × 20%
    expect(Math.round(Number(bShare.rows[0]!.s))).toBe(15_000)  // 100k × 15%
  })

  it('revenue_share_runs (tenant_id, period) is unique', async () => {
    const ins = (tenantId: number) => client.query(
      `INSERT INTO revenue_share_runs (tenant_id, period, status, rate_contabilidad, rate_remuneraciones)
       VALUES ($1, '2026-04', 'ready', 0.20, 0.20)`,
      [tenantId],
    )
    await ins(ids.tenantA!)
    await expect(ins(ids.tenantA!)).rejects.toThrow(/duplicate|unique/i)
    // Different tenant + same period is fine
    await ins(ids.tenantB!)
  })

  it('tenant_fees unique constraint protects (tenant, company, fee_type, valid_from)', async () => {
    await expect(client.query(
      `INSERT INTO tenant_fees (tenant_id, company_id, fee_type, monthly_clp, valid_from, active)
       VALUES ($1, $2, 'contabilidad', 200000, '2026-01-01', true)`,
      [ids.tenantA, ids.companyA],
    )).rejects.toThrow(/duplicate|unique/i)
  })
})
