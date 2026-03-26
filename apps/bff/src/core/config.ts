/**
 * Configuración centralizada del BFF.
 * Valida todas las variables de entorno al arrancar.
 * Error claro si falta alguna variable crítica en producción.
 */

import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Odoo 18
  ODOO_URL: z.string().url(),
  ODOO_DB: z.string(),
  ODOO_ADMIN_PASSWORD: z.string(),

  // SII Bridge
  SII_BRIDGE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string(),

  // CORS
  WEB_URL: z.string().default('http://localhost:3000'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const config = parsed.data
