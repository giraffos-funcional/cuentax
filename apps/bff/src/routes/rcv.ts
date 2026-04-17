/**
 * CUENTAX — RCV Routes (Registro de Compras y Ventas)
 * =====================================================
 * API endpoints for RCV sync and data retrieval.
 *
 * Endpoints:
 *   POST /rcv/sync          — Manual sync for a specific period
 *   GET  /rcv/:tipo         — Get RCV data (compras or ventas)
 *   GET  /rcv/status        — Get sync status for all periods
 *   PUT  /rcv/credentials   — Save SII credentials for RCV sync
 *   POST /rcv/test-credentials — Test SII login
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { authGuard } from '@/middlewares/auth-guard'
import { db } from '@/db/client'
import { companies, rcvRegistros, rcvDetalles } from '@/db/schema'
import { encrypt, decrypt } from '@/core/crypto'
import { logger } from '@/core/logger'
import { getLocalCompanyId } from '@/core/company-resolver'
import { syncRCVFull, createSIISession, type SIISession } from '@/services/rcv-sync.service'
import { triggerManualRCVSync } from '@/jobs/rcv-sync'

// ── Schemas ─────────────────────────────────────────────────────

const syncSchema = z.object({
  mes: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2030),
})

const syncRangeSchema = z.object({
  mesDesde: z.number().int().min(1).max(12),
  mesFin: z.number().int().min(1).max(12),
  yearDesde: z.number().int().min(2020).max(2030),
  yearFin: z.number().int().min(2020).max(2030),
})

const credentialsSchema = z.object({
  sii_user: z.string().min(8, 'RUT requerido (ej: 12345678-9)'),
  sii_password: z.string().min(4, 'Clave tributaria requerida'),
  auto_sync: z.boolean().optional().default(false),
})

// ── Routes ──────────────────────────────────────────────────────

export async function rcvRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  // ── PUT /credentials — Save SII web credentials ────────────
  fastify.put('/credentials', async (req, reply) => {
    const body = credentialsSchema.parse(req.body)
    const user = (req as any).user
    const companyId = await getLocalCompanyId(user.company_id)

    if (!companyId) {
      return reply.status(404).send({ error: 'Company not found' })
    }

    // Encrypt password before storing
    const encryptedPassword = encrypt(body.sii_password)

    await db.update(companies)
      .set({
        sii_user: body.sii_user,
        sii_password_enc: encryptedPassword,
        sii_rcv_auto_sync: body.auto_sync,
        updated_at: new Date(),
      })
      .where(eq(companies.id, companyId))

    logger.info({ companyId }, 'SII RCV credentials updated')

    return reply.send({
      message: 'Credenciales SII guardadas correctamente',
      auto_sync: body.auto_sync,
    })
  })

  // ── GET /credentials — Get credential status (no password) ──
  fastify.get('/credentials', async (req, reply) => {
    const user = (req as any).user
    const companyId = await getLocalCompanyId(user.company_id)

    if (!companyId) {
      return reply.status(404).send({ error: 'Company not found' })
    }

    const [company] = await db.select({
      sii_user: companies.sii_user,
      has_password: companies.sii_password_enc,
      auto_sync: companies.sii_rcv_auto_sync,
      last_sync: companies.sii_rcv_last_sync,
    })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)

    return reply.send({
      sii_user: company?.sii_user ?? null,
      has_password: !!company?.has_password,
      auto_sync: company?.auto_sync ?? false,
      last_sync: company?.last_sync ?? null,
    })
  })

  // ── POST /test-credentials — Test SII login ────────────────
  fastify.post('/test-credentials', async (req, reply) => {
    const user = (req as any).user
    const companyId = await getLocalCompanyId(user.company_id)

    if (!companyId) {
      return reply.status(404).send({ error: 'Company not found' })
    }

    const [company] = await db.select().from(companies)
      .where(eq(companies.id, companyId)).limit(1)

    if (!company?.sii_user || !company?.sii_password_enc) {
      return reply.status(400).send({ error: 'SII credentials not configured' })
    }

    let session: SIISession | null = null
    try {
      const siiPassword = decrypt(company.sii_password_enc)
      session = await createSIISession(company.rut ?? '', company.sii_user, siiPassword)

      return reply.send({ success: true, message: 'Conexion exitosa con el SII' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return reply.status(400).send({
        success: false,
        error: message.includes('invalid credentials')
          ? 'Clave tributaria incorrecta'
          : `Error de conexion: ${message}`,
      })
    } finally {
      if (session) {
        try { await session.browser.close() } catch { /* ignore */ }
      }
    }
  })

  // ── POST /sync — Manual sync trigger ───────────────────────
  fastify.post('/sync', async (req, reply) => {
    const body = syncSchema.parse(req.body)
    const user = (req as any).user
    const companyId = await getLocalCompanyId(user.company_id)

    if (!companyId) {
      return reply.status(404).send({ error: 'Company not found' })
    }

    // Check credentials exist
    const [company] = await db.select({
      sii_user: companies.sii_user,
      has_password: companies.sii_password_enc,
    })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)

    if (!company?.sii_user || !company?.has_password) {
      return reply.status(400).send({
        error: 'Debes configurar tus credenciales del SII antes de sincronizar',
      })
    }

    // Trigger via BullMQ (async, non-blocking)
    try {
      const jobId = await triggerManualRCVSync(companyId, body.mes, body.year)

      return reply.send({
        message: `Sincronizacion del RCV ${body.mes}/${body.year} iniciada`,
        jobId,
        mes: body.mes,
        year: body.year,
      })
    } catch {
      // Fallback: run synchronously if queue not available
      logger.warn('BullMQ queue not available, running RCV sync inline')
      const result = await syncRCVFull(companyId, body.mes, body.year)
      return reply.send({
        message: 'Sincronizacion completada',
        ...result,
      })
    }
  })

  // ── POST /sync-range — Sync multiple months ────────────────
  fastify.post('/sync-range', async (req, reply) => {
    const body = syncRangeSchema.parse(req.body)
    const user = (req as any).user
    const companyId = await getLocalCompanyId(user.company_id)

    if (!companyId) {
      return reply.status(404).send({ error: 'Company not found' })
    }

    const [company] = await db.select({
      sii_user: companies.sii_user,
      has_password: companies.sii_password_enc,
    })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)

    if (!company?.sii_user || !company?.has_password) {
      return reply.status(400).send({
        error: 'Debes configurar tus credenciales del SII antes de sincronizar',
      })
    }

    // Build list of months to sync
    const months: Array<{ mes: number; year: number }> = []
    let y = body.yearDesde
    let m = body.mesDesde
    while (y < body.yearFin || (y === body.yearFin && m <= body.mesFin)) {
      months.push({ mes: m, year: y })
      m++
      if (m > 12) { m = 1; y++ }
    }

    if (months.length === 0 || months.length > 24) {
      return reply.status(400).send({ error: 'Rango invalido (max 24 meses)' })
    }

    // Queue each month as a separate job
    const jobs: Array<{ mes: number; year: number; jobId?: string }> = []
    for (const period of months) {
      try {
        const jobId = await triggerManualRCVSync(companyId, period.mes, period.year)
        jobs.push({ ...period, jobId })
      } catch {
        // Fallback inline if queue unavailable — only for first month to avoid blocking
        if (jobs.length === 0) {
          logger.warn('BullMQ not available, running first month inline')
          await syncRCVFull(companyId, period.mes, period.year)
          jobs.push({ ...period, jobId: 'inline' })
        }
      }
    }

    return reply.send({
      message: `Sincronizacion de ${months.length} meses iniciada (${body.mesDesde}/${body.yearDesde} a ${body.mesFin}/${body.yearFin})`,
      totalMeses: months.length,
      jobs,
    })
  })

  // ── GET /:tipo — Get RCV data ──────────────────────────────
  fastify.get<{ Params: { tipo: string }; Querystring: { mes?: string; year?: string } }>(
    '/:tipo',
    async (req, reply) => {
      const { tipo } = req.params
      if (tipo !== 'compras' && tipo !== 'ventas') {
        return reply.status(400).send({ error: 'Tipo must be "compras" or "ventas"' })
      }

      const user = (req as any).user
      const companyId = await getLocalCompanyId(user.company_id)
      if (!companyId) {
        return reply.status(404).send({ error: 'Company not found' })
      }

      const now = new Date()
      const mes = req.query.mes ? parseInt(req.query.mes) : now.getMonth() + 1
      const year = req.query.year ? parseInt(req.query.year) : now.getFullYear()

      // Get registro
      const [registro] = await db.select().from(rcvRegistros)
        .where(and(
          eq(rcvRegistros.company_id, companyId),
          eq(rcvRegistros.tipo, tipo),
          eq(rcvRegistros.year, year),
          eq(rcvRegistros.mes, mes),
        ))
        .limit(1)

      if (!registro) {
        return reply.send({
          registro: null,
          detalles: [],
          mes,
          year,
          tipo,
          message: 'No hay datos sincronizados para este periodo',
        })
      }

      // Get detalles
      const detalles = await db.select().from(rcvDetalles)
        .where(eq(rcvDetalles.rcv_id, registro.id))

      return reply.send({
        registro: {
          id: registro.id,
          tipo: registro.tipo,
          mes: registro.mes,
          year: registro.year,
          total_neto: registro.total_neto,
          total_iva: registro.total_iva,
          total_exento: registro.total_exento,
          total_registros: registro.total_registros,
          sync_status: registro.sync_status,
          sync_date: registro.sync_date,
          sync_error: registro.sync_error,
        },
        detalles,
        mes,
        year,
        tipo,
      })
    },
  )

  // ── GET /status — Sync status overview ─────────────────────
  fastify.get('/status', async (req, reply) => {
    const user = (req as any).user
    const companyId = await getLocalCompanyId(user.company_id)

    if (!companyId) {
      return reply.status(404).send({ error: 'Company not found' })
    }

    // Get last 6 months of syncs
    const registros = await db.select().from(rcvRegistros)
      .where(eq(rcvRegistros.company_id, companyId))
      .orderBy(desc(rcvRegistros.year), desc(rcvRegistros.mes))
      .limit(24)

    // Get credential status
    const [company] = await db.select({
      sii_user: companies.sii_user,
      has_password: companies.sii_password_enc,
      auto_sync: companies.sii_rcv_auto_sync,
      last_sync: companies.sii_rcv_last_sync,
    })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)

    return reply.send({
      credentials: {
        configured: !!(company?.sii_user && company?.has_password),
        auto_sync: company?.auto_sync ?? false,
        last_sync: company?.last_sync ?? null,
      },
      registros: registros.map(r => ({
        id: r.id,
        tipo: r.tipo,
        mes: r.mes,
        year: r.year,
        total_registros: r.total_registros,
        total_neto: r.total_neto,
        total_iva: r.total_iva,
        sync_status: r.sync_status,
        sync_date: r.sync_date,
        sync_error: r.sync_error,
      })),
    })
  })
}
