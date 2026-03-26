/**
 * CUENTAX — DTE Repository
 * Persiste y consulta DTEs en PostgreSQL.
 */

import { logger } from '@/core/logger'

// En producción usar Drizzle ORM o Prisma. Por ahora mock con postgres driver.
// La interfaz está lista para conectar cualquier ORM.

interface DTERecord {
  id?: string
  company_id: number
  tipo_dte: number
  folio?: number
  track_id?: string
  estado: string
  rut_receptor: string
  razon_social_receptor: string
  monto_total: number
  xml_firmado_b64?: string
  created_at?: string
  updated_at?: string
}

interface FindManyFilters {
  company_id: number
  status?: string
  tipo_dte?: number
  desde?: string
  hasta?: string
  page?: number
  limit?: number
}

class DTERepository {
  // TODO: Conectar con postgres cuando se configure la DB
  // private readonly db: Pool

  async save(record: DTERecord): Promise<string> {
    // TODO: INSERT INTO dte_documents (...)
    // const { rows } = await this.db.query(`INSERT INTO dte_documents (...) VALUES (...) RETURNING id`, [...])
    // return rows[0].id
    const fakeId = `dte_${Date.now()}_${Math.random().toString(36).slice(2)}`
    logger.info({ fakeId, folio: record.folio }, 'DTE persistido (mock DB)')
    return fakeId
  }

  async updateEstado(trackId: string, estado: string): Promise<void> {
    // TODO: UPDATE dte_documents SET estado = $1, updated_at = NOW() WHERE track_id = $2
    logger.info({ trackId, estado }, 'Estado DTE actualizado (mock DB)')
  }

  async findMany(filters: FindManyFilters): Promise<{ data: DTERecord[], total: number }> {
    // TODO: SELECT * FROM dte_documents WHERE company_id = $1 AND ...
    logger.debug({ filters }, 'DTE findMany (mock DB)')
    return { data: [], total: 0 }
  }

  async findByFolio(companyId: number, folio: number): Promise<DTERecord | null> {
    // TODO: SELECT * FROM dte_documents WHERE company_id = $1 AND folio = $2
    return null
  }
}

export const dteRepository = new DTERepository()
