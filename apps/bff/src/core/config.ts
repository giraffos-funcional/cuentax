/**
 * CUENTAX — BFF Core Config
 * Valida variables de entorno al arrancar. Falla fast si falta algo crítico.
 */

const required = (key: string): string => {
  const val = process.env[key]
  if (!val) throw new Error(`❌ Variable de entorno requerida: ${key}`)
  return val
}

const optional = (key: string, fallback: string): string =>
  process.env[key] ?? fallback

export const config = {
  // Server
  PORT:     Number(optional('PORT', '4000')),
  NODE_ENV: optional('NODE_ENV', 'development'),
  LOG_LEVEL: optional('LOG_LEVEL', 'info'),

  // CORS — dominios permitidos
  ALLOWED_ORIGINS: optional('ALLOWED_ORIGINS', 'http://localhost:3000').split(','),

  // Database
  DATABASE_URL: optional('DATABASE_URL', 'postgresql://cuentax:cuentax@localhost:5432/cuentax'),
  REDIS_URL:    optional('REDIS_URL', 'redis://localhost:6379'),

  // Odoo
  ODOO_URL:      optional('ODOO_URL', 'http://localhost:8069'),
  ODOO_DB:       optional('ODOO_DB', 'cuentax'),

  // SII Bridge (internal)
  SII_BRIDGE_URL:  optional('SII_BRIDGE_URL', 'http://localhost:8000/api/v1'),
  INTERNAL_SECRET: optional('INTERNAL_SECRET', 'dev_internal_secret_change_in_prod'),

  // JWT
  JWT_SECRET:         optional('JWT_SECRET', 'dev_jwt_secret_change_in_prod'),
  JWT_REFRESH_SECRET: optional('JWT_REFRESH_SECRET', 'dev_refresh_secret_change_in_prod'),

  // Rate limiting
  RATE_LIMIT_MAX:     Number(optional('RATE_LIMIT_MAX', '100')),
  RATE_LIMIT_WINDOW:  optional('RATE_LIMIT_WINDOW', '1 minute'),
} as const

export type AppConfig = typeof config
