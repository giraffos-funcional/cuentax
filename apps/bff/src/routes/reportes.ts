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
import { getLocalCompanyId } from '@/core/company-resolver'
import { generateLCVPDF } from '@/services/lcv-pdf.service'

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

    // Fallback: local DB — resolve to local company ID
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const monthStr = String(mes).padStart(2, '0')
    const desde = `${year}-${monthStr}-01`
    const hasta = `${year}-${monthStr}-31`

    const { data } = await dteRepository.findMany({
      company_id: localCompanyId,
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

  // ── GET /lcv/pdf ──────────────────────────────────────────
  fastify.get('/lcv/pdf', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as { mes?: string; year?: string; libro?: string }
    const now = new Date()
    const year = Number(q.year ?? now.getFullYear())
    const mes = Number(q.mes ?? now.getMonth() + 1)
    const libro = (q.libro ?? 'ventas') as 'ventas' | 'compras'

    // Get LCV data (reuse existing logic — try Odoo, fallback to local)
    let registros: any[] = []
    try {
      registros = await odooAccountingAdapter.getLCVData(user.company_id, year, mes, libro)
    } catch (err) {
      logger.warn({ err }, 'Odoo LCV unavailable for PDF, falling back to local')
    }

    // Fallback to local DB if Odoo returned nothing
    if (registros.length === 0) {
      try {
        const localCompanyId = await getLocalCompanyId(user.company_id)
        const monthStr = String(mes).padStart(2, '0')
        const desde = `${year}-${monthStr}-01`
        const hasta = `${year}-${monthStr}-31`

        const { data } = await dteRepository.findMany({
          company_id: localCompanyId,
          desde,
          hasta,
          limit: 500,
        })

        const VENTAS_TIPOS = [33, 39, 41, 56, 61]
        const filtered = libro === 'ventas'
          ? data.filter(d => VENTAS_TIPOS.includes(d.tipo_dte))
          : data

        registros = filtered.map(d => ({
          tipo_dte: String(d.tipo_dte ?? ''),
          folio: String(d.folio ?? ''),
          fecha: d.fecha_emision ?? '',
          rut_receptor: d.rut_receptor ?? '',
          razon_social_receptor: d.razon_social_receptor ?? '',
          neto: d.monto_neto ?? 0,
          iva: d.monto_iva ?? 0,
          total: d.monto_total ?? 0,
        }))
      } catch (localErr) {
        logger.warn({ err: localErr }, 'Local DB fallback failed for LCV PDF')
      }
    }

    const totales = registros.reduce((acc, r) => ({
      neto: acc.neto + (r.neto ?? r.monto_neto ?? 0),
      iva: acc.iva + (r.iva ?? r.monto_iva ?? 0),
      total: acc.total + (r.total ?? r.monto_total ?? 0),
    }), { neto: 0, iva: 0, total: 0 })

    const pdfBuffer = await generateLCVPDF({
      company_name: user.company_name ?? '',
      company_rut: user.company_rut ?? '',
      company_address: '',
      libro,
      periodo: { year, mes },
      registros: registros.map(r => ({
        tipo_dte: r.tipo_dte ?? String(r.tipo ?? ''),
        folio: r.folio ?? String(r.l10n_latam_document_number ?? ''),
        fecha: r.fecha_emision ?? r.fecha ?? '',
        rut_receptor: r.rut_receptor ?? r.rut ?? '',
        razon_social_receptor: r.razon_social_receptor ?? r.receptor ?? '',
        neto: r.monto_neto ?? r.neto ?? r.amount_untaxed ?? 0,
        iva: r.monto_iva ?? r.iva ?? r.amount_tax ?? 0,
        total: r.monto_total ?? r.total ?? r.amount_total ?? 0,
      })),
      totales,
    })

    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', `inline; filename="LCV_${libro}_${year}_${mes}.pdf"`)
    return reply.send(pdfBuffer)
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

    // Fallback: local calculation — resolve to local company ID
    const localCompanyIdF29 = await getLocalCompanyId(user.company_id)
    const stats = await dteRepository.getMonthStats(localCompanyIdF29, year, mes - 1)
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

    // Fallback: local DB — resolve to local company ID
    const localCompanyIdStats = await getLocalCompanyId(user.company_id)
    const stats = await dteRepository.getMonthStats(localCompanyIdStats, year, mes - 1)
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
