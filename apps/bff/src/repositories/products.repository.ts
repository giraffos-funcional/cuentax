/**
 * CUENTAX — Products Repository (Drizzle ORM)
 */
import { eq, and, ilike, desc } from 'drizzle-orm'
import { db } from '@/db/client'
import { products } from '@/db/schema'

type InsertProduct = typeof products.$inferInsert
type Product = typeof products.$inferSelect

class ProductsRepository {
  async findMany(companyId: number, opts: {
    search?: string
    exento?: boolean
    page?: number
    limit?: number
  } = {}): Promise<{ data: Product[], total: number }> {
    const limit  = Math.min(opts.limit ?? 50, 200)
    const offset = ((opts.page ?? 1) - 1) * limit

    const conditions = [
      eq(products.company_id, companyId),
      eq(products.activo, true),
    ] as any[]

    if (opts.search) conditions.push(ilike(products.nombre, `%${opts.search}%`))
    if (opts.exento !== undefined) conditions.push(eq(products.exento, opts.exento))

    const where = and(...conditions)

    const [data, all] = await Promise.all([
      db.select().from(products).where(where).orderBy(desc(products.created_at)).limit(limit).offset(offset),
      db.select().from(products).where(where),
    ])

    return { data, total: all.length }
  }

  async create(data: InsertProduct): Promise<Product> {
    const [p] = await db.insert(products).values(data).returning()
    return p
  }

  async update(id: number, companyId: number, data: Partial<InsertProduct>): Promise<Product | null> {
    const [p] = await db.update(products)
      .set(data)
      .where(and(eq(products.id, id), eq(products.company_id, companyId)))
      .returning()
    return p ?? null
  }

  async softDelete(id: number, companyId: number): Promise<void> {
    await db.update(products)
      .set({ activo: false })
      .where(and(eq(products.id, id), eq(products.company_id, companyId)))
  }
}

export const productsRepository = new ProductsRepository()
