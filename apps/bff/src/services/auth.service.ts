/**
 * CUENTAX — Auth Service
 * =======================
 * Casos de uso: login, refresh, logout.
 * Genera JWT access (15m) + refresh (7d) con company context embebido.
 * Refresh tokens almacenados en Redis con blacklist support.
 */

import { createSigner, createVerifier } from 'fast-jwt'
import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { config } from '@/core/config'
import { logger } from '@/core/logger'
import { odooAuthAdapter } from '@/adapters/odoo-auth.adapter'
import { redis } from '@/adapters/redis.adapter'
import { db } from '@/db/client'
import { companies } from '@/db/schema'

const PREF_PREFIX = 'cuentax:pref:'

// ── JWT Payload Types ─────────────────────────────────────────
export interface AccessTokenPayload {
  sub: string        // user uid como string
  email: string
  name: string
  company_id: number
  company_name: string
  company_rut: string
  company_ids: number[]
  // Multi-country context
  country_code: string   // 'CL' | 'US'
  locale: string         // 'es-CL' | 'en-US'
  currency: string       // 'CLP' | 'USD'
  jti: string        // JWT ID único (para blacklist)
  type: 'access'
}

export interface RefreshTokenPayload {
  sub: string
  jti: string
  type: 'refresh'
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  expires_in: number  // segundos
  user: {
    uid: number
    name: string
    email: string
    company_id: number
    company_name: string
    company_rut: string
    company_ids: number[]
    companies: Array<{ id: number; name: string; rut: string; country_code?: string }>
    // Multi-country context
    country_code: string
    locale: string
    currency: string
  }
}

// ── Signers / Verifiers ───────────────────────────────────────
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 días
const ACCESS_TTL_SECONDS  = 15 * 60           // 15 minutos

const signAccess   = createSigner({ key: config.JWT_SECRET,         expiresIn: ACCESS_TTL_SECONDS  * 1000 })
const signRefresh  = createSigner({ key: config.JWT_REFRESH_SECRET, expiresIn: REFRESH_TTL_SECONDS * 1000 })
const verifyAccess = createVerifier({ key: config.JWT_SECRET })
const verifyRefresh = createVerifier({ key: config.JWT_REFRESH_SECRET })

const REDIS_REFRESH_PREFIX  = 'cuentax:refresh:'
const REDIS_BLACKLIST_PREFIX = 'cuentax:blacklist:'

export class AuthService {
  /**
   * Login con email/password contra Odoo.
   * Genera access + refresh tokens y guarda el refresh en Redis.
   */
  async login(
    email: string,
    password: string,
    companyRut?: string,
  ): Promise<AuthTokens | null> {
    const user = await odooAuthAdapter.authenticate(email, password)
    if (!user) return null

    // Si se especificó un RUT de empresa, validar que corresponde
    if (companyRut && user.companyRut && !user.companyRut.includes(companyRut.replace(/[.\-]/g, ''))) {
      logger.warn({ email, companyRut }, 'Company RUT mismatch')
      return null
    }

    // Check if user has a preferred (favorite) company
    const preferredId = await this._getPreferredCompany(user.uid)
    if (preferredId && preferredId !== user.companyId) {
      // Verify the preferred company is in the user's accessible list
      const companyIds = user.companyIds ?? [user.companyId]
      if (companyIds.includes(preferredId)) {
        const companyData = await this._getCompanyData(preferredId)
        if (companyData) {
          logger.info({ uid: user.uid, preferredId, defaultId: user.companyId }, 'Switching to preferred company on login')
          user.companyId = preferredId
          user.companyName = companyData.name
          user.companyRut = companyData.rut
        }
      }
    }

    return this._generateTokens(user)
  }

  /**
   * Renueva el access token usando un refresh token válido.
   * Invalida el refresh token usado (rotación) y emite uno nuevo.
   */
  async refresh(refreshToken: string): Promise<AuthTokens | null> {
    let payload: RefreshTokenPayload

    try {
      payload = verifyRefresh(refreshToken) as RefreshTokenPayload
    } catch {
      logger.warn('Invalid refresh token signature')
      return null
    }

    if (payload.type !== 'refresh') return null

    // Verificar que el refresh token existe en Redis (no fue revocado)
    const storedToken = await redis.get(`${REDIS_REFRESH_PREFIX}${payload.jti}`)
    if (!storedToken) {
      logger.warn({ jti: payload.jti }, 'Refresh token not found in Redis (expired or revoked)')
      return null
    }

    // Revocar el refresh token usado (one-time use)
    await redis.del(`${REDIS_REFRESH_PREFIX}${payload.jti}`)

    // Obtener datos actualizados del usuario desde Odoo
    const storedUser = JSON.parse(storedToken)

    return this._generateTokens(storedUser)
  }

  /**
   * Logout: revoca el refresh token y blacklistea el access token restante.
   */
  async logout(refreshToken: string, accessJti?: string): Promise<void> {
    try {
      const payload = verifyRefresh(refreshToken) as RefreshTokenPayload
      await redis.del(`${REDIS_REFRESH_PREFIX}${payload.jti}`)
      logger.info({ jti: payload.jti }, 'Refresh token revoked on logout')
    } catch {
      // Token ya expirado — OK
    }

    // Blacklistear el access token por el tiempo restante
    if (accessJti) {
      await redis.set(
        `${REDIS_BLACKLIST_PREFIX}${accessJti}`,
        '1',
        'EX',
        ACCESS_TTL_SECONDS,
      )
    }
  }

  /** Verifica si un access token JTI está en la blacklist */
  async isBlacklisted(jti: string): Promise<boolean> {
    const val = await redis.get(`${REDIS_BLACKLIST_PREFIX}${jti}`)
    return val !== null
  }

  /**
   * Switch active company for the authenticated user.
   * Validates access and issues new tokens with updated company context.
   */
  async switchCompany(
    currentUser: { sub: string; email: string; name: string; company_ids: number[] },
    newCompanyId: number,
  ): Promise<AuthTokens | null> {
    if (!currentUser.company_ids.includes(newCompanyId)) {
      logger.warn({ userId: currentUser.sub, newCompanyId }, 'Switch to unauthorized company')
      return null
    }

    const companyData = await this._getCompanyData(newCompanyId)
    if (!companyData) return null

    const user = {
      uid: Number(currentUser.sub),
      name: currentUser.name,
      email: currentUser.email,
      companyId: newCompanyId,
      companyName: companyData.name,
      companyRut: companyData.rut,
      companyIds: currentUser.company_ids,
      companies: [{ id: newCompanyId, name: companyData.name, rut: companyData.rut }],
      countryCode: companyData.country_code,
      locale: companyData.locale,
      currency: companyData.currency,
    }

    return this._generateTokens(user)
  }

  /** Get user's preferred company ID from Redis, or null */
  private async _getPreferredCompany(uid: number): Promise<number | null> {
    try {
      const val = await redis.get(`${PREF_PREFIX}${uid}:company`)
      return val ? Number(val) : null
    } catch {
      return null
    }
  }

  private async _getCompanyData(companyId: number): Promise<{
    name: string; rut: string;
    country_code: string; locale: string; currency: string;
  } | null> {
    try {
      const [company] = await db.select().from(companies)
        .where(eq(companies.odoo_company_id, companyId)).limit(1)
      if (company) return {
        name: company.razon_social,
        rut: company.rut ?? '',
        country_code: company.country_code ?? 'CL',
        locale: company.locale ?? 'es-CL',
        currency: company.currency ?? 'CLP',
      }
      return null
    } catch { return null }
  }

  /** Generate tokens for a specific company (used by company switch) */
  async generateTokensForCompany(user: {
    uid: number | string
    name: string
    email: string
    company_id: number
    company_name: string
    company_rut: string
    country_code?: string
    locale?: string
    currency?: string
  }): Promise<AuthTokens> {
    return this._generateTokens({
      uid: typeof user.uid === 'string' ? Number(user.uid) : user.uid,
      name: user.name,
      email: user.email,
      companyId: user.company_id,
      companyName: user.company_name,
      companyRut: user.company_rut,
      countryCode: user.country_code,
      locale: user.locale,
      currency: user.currency,
    })
  }

  // ── Private ────────────────────────────────────────────────
  private async _generateTokens(user: {
    uid: number
    name: string
    email: string
    companyId: number
    companyName: string
    companyRut: string
    companyIds?: number[]
    companies?: Array<{ id: number; name: string; rut: string; country_code?: string }>
    // Multi-country fields (optional, defaults to Chile for backward compat)
    countryCode?: string
    locale?: string
    currency?: string
  }): Promise<AuthTokens> {
    const accessJti  = randomUUID()
    const refreshJti = randomUUID()

    const resolvedCompanyIds = user.companyIds ?? [user.companyId]
    const resolvedCompanies  = user.companies  ?? [{ id: user.companyId, name: user.companyName, rut: user.companyRut }]
    const resolvedCountry    = user.countryCode ?? 'CL'
    const resolvedLocale     = user.locale ?? (resolvedCountry === 'US' ? 'en-US' : 'es-CL')
    const resolvedCurrency   = user.currency ?? (resolvedCountry === 'US' ? 'USD' : 'CLP')

    const accessPayload: AccessTokenPayload = {
      sub: String(user.uid),
      email: user.email,
      name: user.name,
      company_id: user.companyId,
      company_name: user.companyName,
      company_rut: user.companyRut,
      company_ids: resolvedCompanyIds,
      country_code: resolvedCountry,
      locale: resolvedLocale,
      currency: resolvedCurrency,
      jti: accessJti,
      type: 'access',
    }

    const refreshPayload: RefreshTokenPayload = {
      sub: String(user.uid),
      jti: refreshJti,
      type: 'refresh',
    }

    const accessToken  = signAccess(accessPayload)
    const refreshToken = signRefresh(refreshPayload)

    // Guardar refresh token en Redis con TTL
    await redis.set(
      `${REDIS_REFRESH_PREFIX}${refreshJti}`,
      JSON.stringify({
        uid: user.uid,
        name: user.name,
        email: user.email,
        companyId: user.companyId,
        companyName: user.companyName,
        companyRut: user.companyRut,
        companyIds: resolvedCompanyIds,
        companies: resolvedCompanies,
        countryCode: resolvedCountry,
        locale: resolvedLocale,
        currency: resolvedCurrency,
      }),
      'EX',
      REFRESH_TTL_SECONDS,
    )

    logger.info({ uid: user.uid, companyId: user.companyId, country: resolvedCountry, companyCount: resolvedCompanyIds.length }, 'Auth tokens generated')

    return {
      access_token:  accessToken,
      refresh_token: refreshToken,
      expires_in:    ACCESS_TTL_SECONDS,
      user: {
        uid:          user.uid,
        name:         user.name,
        email:        user.email,
        company_id:   user.companyId,
        company_name: user.companyName,
        company_rut:  user.companyRut,
        company_ids:  resolvedCompanyIds,
        companies:    resolvedCompanies,
        country_code: resolvedCountry,
        locale:       resolvedLocale,
        currency:     resolvedCurrency,
      },
    }
  }
}

export const authService = new AuthService()
