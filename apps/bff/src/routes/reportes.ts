/**
 * CUENTAX — Reports Routes (BFF)
 * Genera LCV (Libros Compra/Venta) y F29 desde Odoo accounting.
 * Fallback a datos locales si Odoo no está disponible.
 * GET /api/v1/reportes/lcv?mes=2&year=2026&libro=ventas
 * GET /api/v1/reportes/f29?mes=2&year=2026
 * GET /api/v1/reportes/stats
 */
import type { FastifyInstance } from 'fastify'
import { authGuard } from '@/middlewares/auth-guard'
import { odooAccountingAdapter } from '@/adapters/odoo-accounting.adapter'
import { dteRepository } from '@/repositories/dte.repository'
import { logger } from '@/core/logger'

export async function reportesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  // ── GET /lcv ─────────────────────────────────────────────
  fastify.get('/lcv', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as { mes?: string; year?: string; libro?: string }
    const now  = new Date()
    const year = Number(q.year ?? now.getFullYear())
    const mes  = Number(q.mes  ?? now.getMonth() + 1)
    const libro = q.libro ?? 'ventas'

    // Try Odoo first
    try {
      const registros = await odooAccountingAdapter.getLCVData(
        user.company_id,
        year,
        mes,
        libro as 'ventas' | 'compras',
      )

      if (registros.length > 0) {
        const totales = registros.reduce((acc, r) => ({
          neto:  acc.neto  + r.neto,
          iva:   acc.iva   + r.iva,
          total: acc.total + r.total,
        }), { neto: 0, iva: 0, total: 0 })

        return reply.send({
          periodo: { year, mes },
          libro,
          source: 'odoo',
          registros,
          totales,
        })
      }
    } catch (err) {
      logger.warn({ err }, 'Odoo LCV unavailable, falling back to local DB')
    }

    // Fallback: local DB
    const monthStr = String(mes).padStart(2, '0')
    const desde = `${year}-${monthStr}-01`
    const hasta = `${year}-${monthStr}-31`

    const { data } = await dteRepository.findMany({
      company_id: user.company_id,
      desde,
      hasta,
      limit: 500,
    })

    const VENTAS_TIPOS = [33, 39, 41, 56, 61]
    const filtered = libro === 'ventas'
      ? data.filter(d => VENTAS_TIPOS.includes(d.tipo_dte))
      : data

    const totales = filtered.reduce((acc, d) => ({
      neto:  acc.neto  + (d.monto_neto  ?? 0),
      iva:   acc.iva   + (d.monto_iva   ?? 0),
      total: acc.total + (d.monto_total ?? 0),
    }), { neto: 0, iva: 0, total: 0 })

    return reply.send({
      periodo: { year, mes },
      libro,
      source: 'local',
      registros: filtered,
      totales,
    })
  })

  // ── GET /f29 ──────────────────────────────────────────────
  fastify.get('/f29', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as { mes?: string; year?: string }
    const now  = new Date()
    const year = Number(q.year ?? now.getFullYear())
    const mes  = Number(q.mes  ?? now.getMonth() + 1)

    // Try Odoo first
    try {
      const f29 = await odooAccountingAdapter.getF29Data(user.company_id, year, mes)

      if (f29.ventas_neto > 0 || f29.credito_fiscal > 0) {
        return reply.send({
          periodo: { year, mes },
          source: 'odoo',
          f29,
          nota: 'Valores calculados desde contabilidad Odoo. Verificar antes de presentar al SII.',
        })
      }
    } catch (err) {
      logger.warn({ err }, 'Odoo F29 unavailable, falling back to local calculation')
    }

    // Fallback: local calculation
    const stats = await dteRepository.getMonthStats(user.company_id, year, mes - 1)
    const aceptados = stats.filter(s => s.estado === 'aceptado' || s.estado === 'enviado')
    const ventas_neto  = aceptados.reduce((s, r) => s + Number(r.total), 0)
    const debito_iva   = Math.round(ventas_neto * 0.19)
    const credito_iva  = 0
    const ppm = Math.round(ventas_neto * 0.015)
    const total_pagar  = debito_iva - credito_iva + ppm

    return reply.send({
      periodo: { year, mes },
      source: 'local',
      f29: {
        ventas_neto,
        debito_fiscal: debito_iva,
        credito_fiscal: credito_iva,
        ppm_1_5pct: ppm,
        total_a_pagar: total_pagar,
      },
      nota: 'Valores calculados desde DTEs locales. Conecte Odoo para datos contables precisos.',
    })
  })

  // ── GET /stats ────────────────────────────────────────────
  fastify.get('/stats', async (req, reply) => {
    const user = (req as any).user
    const now  = new Date()
    const year = now.getFullYear()
    const mes  = now.getMonth() + 1

    // Try Odoo for monthly stats
    try {
      const odooStats = await odooAccountingAdapter.getMonthlyStats(user.company_id, year, mes)

      if (odooStats.total_emitidos > 0) {
        return reply.send({
          mes_actual: { year, mes },
          source: 'odoo',
          ...odooStats,
        })
      }
    } catch (err) {
      logger.warn({ err }, 'Odoo stats unavailable, falling back to local')
    }

    // Fallback: local DB
    const stats = await dteRepository.getMonthStats(user.company_id, year, mes - 1)
    const byEstado = Object.fromEntries(
      stats.map(s => [s.estado, { count: Number(s.count), total: Number(s.total) }])
    )

    return reply.send({
      mes_actual: { year, mes },
      source: 'local',
      por_estado: byEstado,
      total_aceptados: (byEstado as any).aceptado?.total ?? 0,
      total_emitidos:  Object.values(byEstado).reduce((s, v: any) => s + v.total, 0),
    })
  })
}
