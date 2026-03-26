/**
 * CUENTAX — Database Client (Drizzle + pg)
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'
import { config } from '@/core/config'
import { logger } from '@/core/logger'

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

pool.on('error', (err) => {
  logger.error({ err }, '❌ PostgreSQL pool error')
})

pool.on('connect', () => {
  logger.debug('PostgreSQL client connected')
})

export const db = drizzle(pool, { schema, logger: config.NODE_ENV === 'development' })

/** Verifica conectividad con la base de datos */
export async function pingDB(): Promise<boolean> {
  try {
    await pool.query('SELECT 1')
    return true
  } catch {
    return false
  }
}

export { pool }
