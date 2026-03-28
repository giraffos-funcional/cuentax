/**
 * CUENTAX — Indicators Routes (BFF)
 * ==================================
 * Previred indicator sync and retrieval.
 * POST /api/v1/indicators/sync    - Trigger manual Previred scrape
 * GET  /api/v1/indicators/current - Get current month's indicators from Odoo
 */
import type { FastifyInstance } from 'fastify'
import { authGuard } from '@/middlewares/auth-guard'
import { odooAccountingAdapter } from '@/adapters/odoo-accounting.adapter'
import { scrapePreviredIndicators } from '@/jobs/previred-scraper'
import { logger } from '@/core/logger'

export async function indicatorsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  // ── POST /sync ──────────────────────────────────────────────
  // Triggers the Previred scraper manually for the authenticated company
  fastify.post('/sync', async (req, reply) => {
    const user = (req as any).user
    const companyId: number = user.company_id

    logger.info({ companyId, userId: user.uid }, 'Manual Previred indicator sync triggered')

    try {
      const result = await scrapePreviredIndicators(companyId)

      if (!result.success) {
        return reply.status(502).send({
          source: 'previred',
          error: 'scrape_failed',
          message: result.error ?? 'Failed to fetch indicators from Previred',
        })
      }

      return reply.send({
        source: 'previred',
        success: true,
        odoo_synced: result.odooSynced,
        indicators: result.indicators
          ? {
              month: result.indicators.month,
              year: result.indicators.year,
              uf: result.indicators.uf,
              utm: result.indicators.utm,
              uta: result.indicators.uta,
              imm: result.indicators.imm,
              tope_imponible_afp: result.indicators.tope_imponible_afp,
              tope_imponible_ips: result.indicators.tope_imponible_ips,
              tope_seg_cesantia: result.indicators.tope_seg_cesantia,
              afp_rates_count: result.indicators.afp_rates.length,
              asignacion_familiar_tramos: result.indicators.asignacion_familiar.length,
            }
          : null,
      })
    } catch (err) {
      logger.error({ err, companyId }, 'Error in manual Previred sync')
      return reply.status(500).send({
        source: 'error',
        error: 'internal_error',
        message: 'Error al sincronizar indicadores de Previred',
      })
    }
  })

  // ── GET /current ────────────────────────────────────────────
  // Returns the current month's indicators from Odoo
  fastify.get('/current', async (req, reply) => {
    const user = (req as any).user
    const companyId: number = user.company_id

    const q = req.query as { month?: string; year?: string }
    const now = new Date()
    const month = Number(q.month ?? now.getMonth() + 1)
    const year = Number(q.year ?? now.getFullYear())

    try {
      const results = await odooAccountingAdapter.searchRead(
        'l10n_cl.indicators',
        [
          ['month', '=', month],
          ['year', '=', year],
          ['company_id', '=', companyId],
        ],
        [
          'id', 'month', 'year', 'uf', 'utm', 'uta', 'imm',
          'tope_imponible_afp', 'tope_imponible_salud',
          'tope_seg_cesantia', 'company_id',
        ],
        { limit: 1 },
      )

      if (results.length === 0) {
        return reply.status(404).send({
          source: 'odoo',
          error: 'not_found',
          message: `No se encontraron indicadores para ${month}/${year}. Ejecute POST /sync para obtenerlos de Previred.`,
          periodo: { month, year },
        })
      }

      const record = results[0] as Record<string, unknown>

      return reply.send({
        source: 'odoo',
        periodo: { month, year },
        indicators: {
          id: record['id'],
          month: record['month'],
          year: record['year'],
          uf: record['uf'],
          utm: record['utm'],
          uta: record['uta'],
          imm: record['imm'],
          tope_imponible_afp: record['tope_imponible_afp'],
          tope_imponible_salud: record['tope_imponible_salud'],
          tope_seg_cesantia: record['tope_seg_cesantia'],
          company_id: record['company_id'],
        },
      })
    } catch (err) {
      logger.error({ err, companyId, month, year }, 'Error fetching indicators from Odoo')
      return reply.send({
        source: 'error',
        periodo: { month, year },
        indicators: null,
      })
    }
  })

  // ── GET /full ───────────────────────────────────────────────
  // Returns the full scraped data (including AFP rates, asignacion familiar)
  // without syncing to Odoo. Useful for preview/debugging.
  fastify.get('/full', async (req, reply) => {
    const user = (req as any).user

    logger.info({ userId: user.uid }, 'Full Previred indicator fetch requested')

    try {
      const result = await scrapePreviredIndicators()

      if (!result.success || !result.indicators) {
        return reply.status(502).send({
          source: 'previred',
          error: 'scrape_failed',
          message: result.error ?? 'Failed to fetch indicators from Previred',
        })
      }

      return reply.send({
        source: 'previred',
        indicators: result.indicators,
      })
    } catch (err) {
      logger.error({ err }, 'Error in full Previred fetch')
      return reply.status(500).send({
        source: 'error',
        error: 'internal_error',
        message: 'Error al obtener indicadores de Previred',
      })
    }
  })
}
