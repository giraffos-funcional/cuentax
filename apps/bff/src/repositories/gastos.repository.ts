/**
 * CUENTAX — Gastos Repository (Drizzle ORM)
 * ==========================================
 * Data access layer for expenses. All queries are company-scoped (multi-tenant).
 */

import { eq, and, ilike, desc, sql, count } from 'drizzle-orm'
import { db } from '@/db/client'
import { gastos } from '@/db/schema'

type InsertGasto = typeof gastos.$inferInsert
type Gasto = typeof gastos.$inferSelect

class GastosRepository {
  async findMany(companyId: number, opts: {
    search?: string
    categoria?: string
    verificado?: boolean
    mes?: number
    year?: number
    page?: number
    limit?: number
  } = {}): Promise<{ data: Gasto[], total: number }> {
    const limit  = Math.min(opts.limit ?? 20, 200)
    const offset = ((opts.page ?? 1) - 1) * limit

    const conditions: ReturnType<typeof eq>[] = [
      eq(gastos.company_id, companyId),
    ]

    if (opts.search) {
      conditions.push(
        ilike(gastos.descripcion, `%${opts.search}%`) as any,
      )
    }
    if (opts.categoria) {
      conditions.push(eq(gastos.categoria, opts.categoria))
    }
    if (opts.verificado !== undefined) {
      conditions.push(eq(gastos.verificado, opts.verificado))
    }
    if (opts.mes && opts.year) {
      // Filter by month: fecha_documento is stored as 'YYYY-MM-DD' text
      const monthStr = String(opts.mes).padStart(2, '0')
      const startDate = `${opts.year}-${monthStr}-01`
      const endDate = opts.mes === 12
        ? `${opts.year + 1}-01-01`
        : `${opts.year}-${String(opts.mes + 1).padStart(2, '0')}-01`
      conditions.push(sql`${gastos.fecha_documento} >= ${startDate}` as any)
      conditions.push(sql`${gastos.fecha_documento} < ${endDate}` as any)
    } else if (opts.year) {
      conditions.push(sql`${gastos.fecha_documento} >= ${`${opts.year}-01-01`}` as any)
      conditions.push(sql`${gastos.fecha_documento} < ${`${opts.year + 1}-01-01`}` as any)
    }

    const whereClause = and(...conditions)

    const [data, [totalResult]] = await Promise.all([
      db.select().from(gastos).where(whereClause).orderBy(desc(gastos.created_at)).limit(limit).offset(offset),
      db.select({ count: count() }).from(gastos).where(whereClause),
    ])

    return { data, total: totalResult?.count ?? 0 }
  }

  async findById(id: number, companyId: number): Promise<Gasto | null> {
    const [gasto] = await db
      .select()
      .from(gastos)
      .where(and(eq(gastos.id, id), eq(gastos.company_id, companyId)))
      .limit(1)
    return gasto ?? null
  }

  async create(data: InsertGasto): Promise<Gasto> {
    const [g] = await db.insert(gastos).values(data).returning()
    return g
  }

  async update(id: number, companyId: number, data: Partial<InsertGasto>): Promise<Gasto | null> {
    const [g] = await db.update(gastos)
      .set({ ...data, updated_at: new Date() })
      .where(and(eq(gastos.id, id), eq(gastos.company_id, companyId)))
      .returning()
    return g ?? null
  }

  async delete(id: number, companyId: number): Promise<boolean> {
    const result = await db.delete(gastos)
      .where(and(eq(gastos.id, id), eq(gastos.company_id, companyId)))
      .returning({ id: gastos.id })
    return result.length > 0
  }

  async getStats(companyId: number, mes: number, year: number): Promise<{
    total_gastos: number
    total_neto: number
    total_iva: number
    total_exento: number
    count: number
    por_categoria: Array<{ categoria: string; total: number; count: number }>
  }> {
    const monthStr = String(mes).padStart(2, '0')
    const startDate = `${year}-${monthStr}-01`
    const endDate = mes === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(mes + 1).padStart(2, '0')}-01`

    const whereClause = and(
      eq(gastos.company_id, companyId),
      sql`${gastos.fecha_documento} >= ${startDate}`,
      sql`${gastos.fecha_documento} < ${endDate}`,
    )

    const [summaryResult] = await db
      .select({
        total_gastos: sql<number>`COALESCE(SUM(${gastos.monto_total}), 0)`,
        total_neto: sql<number>`COALESCE(SUM(${gastos.monto_neto}), 0)`,
        total_iva: sql<number>`COALESCE(SUM(${gastos.monto_iva}), 0)`,
        total_exento: sql<number>`COALESCE(SUM(${gastos.monto_exento}), 0)`,
        count: count(),
      })
      .from(gastos)
      .where(whereClause)

    const porCategoria = await db
      .select({
        categoria: gastos.categoria,
        total: sql<number>`COALESCE(SUM(${gastos.monto_total}), 0)`,
        count: count(),
      })
      .from(gastos)
      .where(whereClause)
      .groupBy(gastos.categoria)
      .orderBy(sql`SUM(${gastos.monto_total}) DESC`)

    return {
      total_gastos: Number(summaryResult?.total_gastos ?? 0),
      total_neto: Number(summaryResult?.total_neto ?? 0),
      total_iva: Number(summaryResult?.total_iva ?? 0),
      total_exento: Number(summaryResult?.total_exento ?? 0),
      count: Number(summaryResult?.count ?? 0),
      por_categoria: porCategoria.map(c => ({
        categoria: c.categoria,
        total: Number(c.total),
        count: Number(c.count),
      })),
    }
  }
}

export const gastosRepository = new GastosRepository()
