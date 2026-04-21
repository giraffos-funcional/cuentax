/**
 * CUENTAX — BFF Core Config
 * Valida variables de entorno al arrancar. Falla fast si falta algo crítico.
 */

const isProd = process.env.NODE_ENV === 'production'

const required = (key: string): string => {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required environment variable: ${key}`)
  return val
}

const optional = (key: string, fallback: string): string =>
  process.env[key] ?? fallback

/** In production: required and fails fast. In development: uses a weak fallback for DX convenience. */
const secret = (key: string, devFallback: string): string =>
  isProd ? required(key) : optional(key, devFallback)

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
  ODOO_URL:        optional('ODOO_URL', 'http://localhost:8069'),
  // Public Odoo URL, used for context-aware writes that don't persist through
  // the internal Docker network (e.g., Odoo 18 company-dependent fields).
  // Falls back to ODOO_URL when not set.
  ODOO_PUBLIC_URL: optional('ODOO_PUBLIC_URL', process.env.ODOO_URL ?? 'http://localhost:8069'),
  ODOO_DB:         optional('ODOO_DB', 'cuentax'),

  // SII Bridge (internal)
  SII_BRIDGE_URL:  optional('SII_BRIDGE_URL', 'http://localhost:8000/api/v1'),
  SII_BRIDGE_FALLBACK_URLS: optional('SII_BRIDGE_FALLBACK_URLS', '').split(',').filter(Boolean),
  INTERNAL_SECRET: secret('INTERNAL_SECRET', 'dev_internal_secret_change_in_prod'),

  // JWT
  JWT_SECRET:         secret('JWT_SECRET', 'dev_jwt_secret_change_in_prod'),
  JWT_REFRESH_SECRET: secret('JWT_REFRESH_SECRET', 'dev_refresh_secret_change_in_prod'),

  // Rate limiting
  RATE_LIMIT_MAX:     Number(optional('RATE_LIMIT_MAX', '100')),
  RATE_LIMIT_WINDOW:  optional('RATE_LIMIT_WINDOW', '1 minute'),
} as const

// Production secret validation — warn on weak secrets but don't crash
if (isProd) {
  const MIN_SECRET_LENGTH = 32
  const secretsToValidate = [
    ['JWT_SECRET', config.JWT_SECRET],
    ['JWT_REFRESH_SECRET', config.JWT_REFRESH_SECRET],
    ['INTERNAL_SECRET', config.INTERNAL_SECRET],
  ] as const

  for (const [name, value] of secretsToValidate) {
    if (value.length < MIN_SECRET_LENGTH) {
      console.warn(
        `WARNING: ${name} is shorter than ${MIN_SECRET_LENGTH} characters (got ${value.length}). Consider using a stronger secret.`
      )
    }
  }
}

export type AppConfig = typeof config
