/**
 * CUENTAX — Reports Routes (BFF)
 * Genera LCV (Libros Compra/Venta) y F29 desde los DTEs de la DB.
 * GET /api/v1/reportes/lcv?mes=2&year=2026&libro=ventas
 * GET /api/v1/reportes/f29?mes=2&year=2026
 * GET /api/v1/reportes/stats
 */
import type { FastifyInstance } from 'fastify'
import { authGuard } from '@/middlewares/auth-guard'
import { dteRepository } from '@/repositories/dte.repository'

const TIPO_LIBRO_MAP: Record<string, number[]> = {
  ventas: [33, 39, 41, 56, 61],
  compras: [],  // futuro: documentos recibidos
}

export async function reportesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  // ── GET /lcv ─────────────────────────────────────────────
  fastify.get('/lcv', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as { mes?: string; year?: string; libro?: string }
    const now  = new Date()
    const year = Number(q.year ?? now.getFullYear())
    const mes  = Number(q.mes  ?? now.getMonth())
    const libro = q.libro ?? 'ventas'

    const monthStr = String(mes + 1).padStart(2, '0')
    const desde = `${year}-${monthStr}-01`
    const hasta = `${year}-${monthStr}-31`

    const { data } = await dteRepository.findMany({
      company_id: user.company_id,
      desde,
      hasta,
      limit: 500,
    })

    // Filtrar por tipo de libro
    const tiposLibro = TIPO_LIBRO_MAP[libro] ?? []
    const filtered = tiposLibro.length > 0
      ? data.filter(d => tiposLibro.includes(d.tipo_dte))
      : data

    const totales = filtered.reduce((acc, d) => ({
      neto:  acc.neto  + (d.monto_neto  ?? 0),
      iva:   acc.iva   + (d.monto_iva   ?? 0),
      total: acc.total + (d.monto_total ?? 0),
    }), { neto: 0, iva: 0, total: 0 })

    return reply.send({
      periodo: { year, mes: mes + 1, desde, hasta },
      libro,
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
    const mes  = Number(q.mes  ?? now.getMonth())

    const monthStr = String(mes + 1).padStart(2, '0')
    const stats = await dteRepository.getMonthStats(user.company_id, year, mes)

    // Calcular F29
    const aceptados = stats.filter(s => s.estado === 'aceptado' || s.estado === 'enviado')
    const ventas_neto  = aceptados.reduce((s, r) => s + Number(r.total), 0)
    const debito_iva   = Math.round(ventas_neto * 0.19)
    const credito_iva  = 0  // TODO: crédito fiscal de compras
    const ppm = Math.round(ventas_neto * 0.015)
    const total_pagar  = debito_iva - credito_iva + ppm

    return reply.send({
      periodo: { year, mes: mes + 1 },
      f29: {
        ventas_neto,
        debito_fiscal: debito_iva,
        credito_fiscal: credito_iva,
        ppm_1_5pct: ppm,
        total_a_pagar: total_pagar,
      },
      nota: 'Valores calculados desde DTEs aceptados. Verificar antes de presentar al SII.',
    })
  })

  // ── GET /stats ────────────────────────────────────────────
  fastify.get('/stats', async (req, reply) => {
    const user = (req as any).user
    const now  = new Date()
    const stats = await dteRepository.getMonthStats(user.company_id, now.getFullYear(), now.getMonth())

    const byEstado = Object.fromEntries(stats.map(s => [s.estado, { count: Number(s.count), total: Number(s.total) }]))

    return reply.send({
      mes_actual: { year: now.getFullYear(), mes: now.getMonth() + 1 },
      por_estado: byEstado,
      total_aceptados: byEstado.aceptado?.total ?? 0,
      total_emitidos:  Object.values(byEstado).reduce((s, v: any) => s + v.total, 0),
    })
  })
}
