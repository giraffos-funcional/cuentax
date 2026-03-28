/**
 * CUENTAX — DTE Repository (Drizzle ORM — implementación real)
 * Reemplaza el mock anterior con queries reales a PostgreSQL.
 */

import { eq, and, desc, sql, gte, lte, count } from 'drizzle-orm'
import { db } from '@/db/client'
import { dteDocuments, dteStatusEnum } from '@/db/schema'
import { logger } from '@/core/logger'

type InsertDTE = {
  company_id: number
  tipo_dte: number
  folio?: number
  track_id?: string
  estado: string
  rut_receptor: string
  razon_social_receptor: string
  monto_neto?: number
  monto_iva?: number
  monto_total: number
  fecha_emision?: string
  xml_firmado_b64?: string
  items_json?: unknown
  observaciones?: string
}

type FindFilters = {
  company_id: number
  status?: string
  tipo_dte?: number
  desde?: string
  hasta?: string
  page?: number
  limit?: number
}

class DTERepository {
  async save(record: InsertDTE): Promise<string> {
    const [inserted] = await db
      .insert(dteDocuments)
      .values({
        company_id:            record.company_id,
        tipo_dte:              record.tipo_dte,
        folio:                 record.folio,
        track_id:              record.track_id,
        estado:                (record.estado as any) ?? 'borrador',
        rut_receptor:          record.rut_receptor,
        razon_social_receptor: record.razon_social_receptor,
        monto_neto:            record.monto_neto ?? 0,
        monto_iva:             record.monto_iva ?? 0,
        monto_total:           record.monto_total,
        fecha_emision:         record.fecha_emision ?? new Date().toISOString().slice(0, 10),
        xml_firmado_b64:       record.xml_firmado_b64,
        items_json:            record.items_json as any,
        observaciones:         record.observaciones,
      })
      .returning({ id: dteDocuments.id })

    logger.info({ id: inserted.id, folio: record.folio, track_id: record.track_id }, '✅ DTE guardado en DB')
    return String(inserted.id)
  }

  async updateEstado(trackId: string, estado: string): Promise<void> {
    await db
      .update(dteDocuments)
      .set({ estado: estado as any, updated_at: new Date() })
      .where(eq(dteDocuments.track_id, trackId))
    logger.info({ trackId, estado }, 'Estado DTE actualizado')
  }

  async findMany(filters: FindFilters): Promise<{ data: typeof dteDocuments.$inferSelect[], total: number }> {
    const page  = filters.page  ?? 1
    const limit = Math.min(filters.limit ?? 25, 100)
    const offset = (page - 1) * limit

    const conditions = [eq(dteDocuments.company_id, filters.company_id)]

    if (filters.status)   conditions.push(eq(dteDocuments.estado, filters.status as any))
    if (filters.tipo_dte) conditions.push(eq(dteDocuments.tipo_dte, filters.tipo_dte))
    if (filters.desde)    conditions.push(gte(dteDocuments.fecha_emision, filters.desde))
    if (filters.hasta)    conditions.push(lte(dteDocuments.fecha_emision, filters.hasta))

    const where = and(...conditions)

    const [data, [{ total }]] = await Promise.all([
      db.select().from(dteDocuments)
        .where(where)
        .orderBy(desc(dteDocuments.created_at))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(dteDocuments).where(where),
    ])

    return { data, total: Number(total) }
  }

  async findByFolio(companyId: number, folio: number) {
    const [doc] = await db
      .select()
      .from(dteDocuments)
      .where(and(eq(dteDocuments.company_id, companyId), eq(dteDocuments.folio, folio)))
      .limit(1)
    return doc ?? null
  }

  async findByTrackId(trackId: string) {
    const [doc] = await db
      .select()
      .from(dteDocuments)
      .where(eq(dteDocuments.track_id, trackId))
      .limit(1)
    return doc ?? null
  }

  /** DTEs pendientes de polling (enviados sin estado final) — para el job */
  async findPendingPolling(): Promise<typeof dteDocuments.$inferSelect[]> {
    return db
      .select()
      .from(dteDocuments)
      .where(
        and(
          eq(dteDocuments.estado, 'enviado'),
          sql`${dteDocuments.track_id} IS NOT NULL`,
        ),
      )
      .limit(50)
  }

  /** Update Odoo move ID after sync */
  async updateOdooMoveId(id: string, odooMoveId: number): Promise<void> {
    await db
      .update(dteDocuments)
      .set({ odoo_move_id: odooMoveId, updated_at: new Date() })
      .where(eq(dteDocuments.id, Number(id)))
    logger.info({ id, odooMoveId }, 'Odoo move_id linked to DTE')
  }

  /** Estadísticas del mes para el dashboard */
  async getMonthStats(companyId: number, year: number, month: number) {
    const desde = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const hasta  = `${year}-${String(month + 1).padStart(2, '0')}-31`

    const rows = await db
      .select({
        estado: dteDocuments.estado,
        count:  count(),
        total:  sql<number>`SUM(${dteDocuments.monto_total})`,
      })
      .from(dteDocuments)
      .where(and(
        eq(dteDocuments.company_id, companyId),
        gte(dteDocuments.fecha_emision, desde),
        lte(dteDocuments.fecha_emision, hasta),
      ))
      .groupBy(dteDocuments.estado)

    return rows
  }
}

export const dteRepository = new DTERepository()
