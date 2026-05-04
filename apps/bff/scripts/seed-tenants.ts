/**
 * T0.4 — Seed de planes y tenants demo.
 *
 * Inserta los 3 planes base (`starter`, `pro`, `business`) y dos tenants
 * de demostración (`demo`, `acme`). Idempotente.
 *
 * Uso:
 *   pnpm --filter @cuentax/bff exec tsx scripts/seed-tenants.ts
 */
import { pool } from '@/db/client'
import { logger } from '@/core/logger'

interface PlanSeed {
  code: string
  name: string
  base_price_clp: number
  included_dtes: number
  included_companies: number
  overage_price_per_dte_clp: number
  features: Record<string, unknown>
}

const PLANS: readonly PlanSeed[] = [
  {
    code: 'starter',
    name: 'Starter',
    base_price_clp: 19_000,
    included_dtes: 100,
    included_companies: 3,
    overage_price_per_dte_clp: 80,
    features: { revenue_share: true, support: 'email' },
  },
  {
    code: 'pro',
    name: 'Pro',
    base_price_clp: 49_000,
    included_dtes: 500,
    included_companies: 10,
    overage_price_per_dte_clp: 60,
    features: { revenue_share: true, support: 'email+chat' },
  },
  {
    code: 'business',
    name: 'Business',
    base_price_clp: 99_000,
    included_dtes: 2_000,
    included_companies: 50,
    overage_price_per_dte_clp: 40,
    features: { revenue_share: true, support: 'priority' },
  },
]

interface TenantSeed {
  slug: string
  name: string
  plan_code: string
  primary_rut: string
  billing_email: string
}

const TENANTS: readonly TenantSeed[] = [
  {
    slug: 'demo',
    name: 'Demo Contadores',
    plan_code: 'starter',
    primary_rut: '76123456-7',
    billing_email: 'demo+billing@cuentax.cl',
  },
  {
    slug: 'acme',
    name: 'ACME Despacho',
    plan_code: 'pro',
    primary_rut: '77654321-K',
    billing_email: 'acme+billing@cuentax.cl',
  },
]

async function upsertPlans(): Promise<void> {
  for (const p of PLANS) {
    await pool.query(
      `INSERT INTO plans
        (code, name, base_price_clp, included_dtes, included_companies,
         overage_price_per_dte_clp, features, revenue_share_enabled, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, true)
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         base_price_clp = EXCLUDED.base_price_clp,
         included_dtes = EXCLUDED.included_dtes,
         included_companies = EXCLUDED.included_companies,
         overage_price_per_dte_clp = EXCLUDED.overage_price_per_dte_clp,
         features = EXCLUDED.features,
         updated_at = now()`,
      [
        p.code,
        p.name,
        p.base_price_clp,
        p.included_dtes,
        p.included_companies,
        p.overage_price_per_dte_clp,
        JSON.stringify(p.features),
      ],
    )
  }
  logger.info({ count: PLANS.length }, 'Plans upserted')
}

async function upsertTenants(): Promise<void> {
  for (const t of TENANTS) {
    const planRow = await pool.query<{ id: number }>(
      'SELECT id FROM plans WHERE code = $1 LIMIT 1',
      [t.plan_code],
    )
    const planId = planRow.rows[0]?.id
    if (!planId) {
      throw new Error(`Plan ${t.plan_code} not found — run plans seed first`)
    }
    await pool.query(
      `INSERT INTO tenants
        (slug, name, status, plan_id, primary_rut, billing_email)
       VALUES ($1, $2, 'active', $3, $4, $5)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         plan_id = EXCLUDED.plan_id,
         primary_rut = EXCLUDED.primary_rut,
         billing_email = EXCLUDED.billing_email,
         updated_at = now()`,
      [t.slug, t.name, planId, t.primary_rut, t.billing_email],
    )
  }
  logger.info({ count: TENANTS.length }, 'Tenants upserted')
}

async function main(): Promise<void> {
  await upsertPlans()
  await upsertTenants()
  logger.info('✅ Seed complete')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'Seed failed')
    process.exit(1)
  })
