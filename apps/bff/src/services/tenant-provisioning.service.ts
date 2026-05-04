/**
 * Tenant provisioning — manual creation by super-admin.
 *
 * Validates slug, ensures uniqueness, creates the tenant row.
 * Self-serve onboarding (with magic-link emails) lives in Fase 04.
 *
 * Refs: docs/multitenancy/phase-01-admin.md T1.5
 */
import { eq } from 'drizzle-orm'
import { isValidSlug, isReservedSubdomain } from '@cuentax/tenancy'
import { db } from '@/db/client'
import { tenants, plans } from '@/db/schema'
import { logger } from '@/core/logger'

const TRIAL_DAYS = 14

export interface ProvisionInput {
  slug: string
  name: string
  primary_rut?: string
  billing_email?: string
  plan_code?: string
  status?: 'trialing' | 'active'
}

export interface ProvisionedTenant {
  id: number
  slug: string
  name: string
  status: string
  plan_id: number | null
  trial_ends_at: Date | null
}

export class ProvisioningError extends Error {
  constructor(
    public code: 'invalid_slug' | 'reserved_slug' | 'slug_taken' | 'plan_not_found',
    message: string,
  ) {
    super(message)
  }
}

export async function provisionTenant(input: ProvisionInput): Promise<ProvisionedTenant> {
  const slug = input.slug.trim().toLowerCase()
  if (!isValidSlug(slug)) {
    throw new ProvisioningError('invalid_slug', `slug "${slug}" must match [a-z0-9](-?[a-z0-9])*`)
  }
  if (isReservedSubdomain(slug)) {
    throw new ProvisioningError('reserved_slug', `slug "${slug}" is reserved`)
  }

  const existing = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1)
  if (existing.length > 0) {
    throw new ProvisioningError('slug_taken', `slug "${slug}" already in use`)
  }

  let planId: number | null = null
  if (input.plan_code) {
    const planRows = await db.select().from(plans).where(eq(plans.code, input.plan_code)).limit(1)
    if (planRows.length === 0) {
      throw new ProvisioningError('plan_not_found', `plan "${input.plan_code}" does not exist`)
    }
    planId = planRows[0]!.id
  }

  const status = input.status ?? 'trialing'
  const trialEndsAt =
    status === 'trialing'
      ? new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
      : null

  const [row] = await db
    .insert(tenants)
    .values({
      slug,
      name: input.name,
      status,
      plan_id: planId,
      primary_rut: input.primary_rut ?? null,
      billing_email: input.billing_email ?? null,
      trial_ends_at: trialEndsAt,
    })
    .returning()

  if (!row) throw new Error('Failed to insert tenant')
  logger.info({ id: row.id, slug: row.slug, status: row.status }, 'tenant.provisioned')

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    plan_id: row.plan_id,
    trial_ends_at: row.trial_ends_at,
  }
}

export async function setStatus(
  slug: string,
  status: 'trialing' | 'active' | 'past_due' | 'suspended' | 'cancelled',
): Promise<ProvisionedTenant | null> {
  const [row] = await db
    .update(tenants)
    .set({ status, updated_at: new Date() })
    .where(eq(tenants.slug, slug))
    .returning()
  if (!row) return null
  logger.info({ slug, status }, 'tenant.status_changed')
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    plan_id: row.plan_id,
    trial_ends_at: row.trial_ends_at,
  }
}

export async function updateRevenueShareRates(
  slug: string,
  rates: { contabilidad?: number; remuneraciones?: number },
): Promise<{ slug: string; rate_contabilidad: string; rate_remuneraciones: string } | null> {
  const updates: Record<string, unknown> = { updated_at: new Date() }
  if (rates.contabilidad !== undefined) {
    if (rates.contabilidad < 0 || rates.contabilidad > 1) {
      throw new ProvisioningError('invalid_slug', 'contabilidad rate must be in [0, 1]')
    }
    updates.revenue_share_rate_contabilidad = rates.contabilidad.toFixed(4)
  }
  if (rates.remuneraciones !== undefined) {
    if (rates.remuneraciones < 0 || rates.remuneraciones > 1) {
      throw new ProvisioningError('invalid_slug', 'remuneraciones rate must be in [0, 1]')
    }
    updates.revenue_share_rate_remuneraciones = rates.remuneraciones.toFixed(4)
  }
  const [row] = await db
    .update(tenants)
    .set(updates)
    .where(eq(tenants.slug, slug))
    .returning()
  if (!row) return null
  return {
    slug: row.slug,
    rate_contabilidad: row.revenue_share_rate_contabilidad,
    rate_remuneraciones: row.revenue_share_rate_remuneraciones,
  }
}
