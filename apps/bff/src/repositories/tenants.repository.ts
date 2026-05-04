/**
 * CUENTAX — Tenants Repository
 * Lookup helpers for the multi-tenant subdomain resolver.
 */
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { tenants } from '@/db/schema'

export type TenantRow = typeof tenants.$inferSelect

class TenantsRepository {
  async findBySlug(slug: string): Promise<TenantRow | null> {
    const rows = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1)
    return rows[0] ?? null
  }

  async findById(id: number): Promise<TenantRow | null> {
    const rows = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1)
    return rows[0] ?? null
  }
}

export const tenantsRepository = new TenantsRepository()
