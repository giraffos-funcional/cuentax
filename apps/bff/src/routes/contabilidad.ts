/**
 * CUENTAX — Contabilidad Routes (BFF)
 * Plan de cuentas, libro diario, libro mayor, balance, resultados y conciliación bancaria desde Odoo.
 * GET /api/v1/contabilidad/plan-cuentas
 * GET /api/v1/contabilidad/libro-diario?mes=2&year=2026
 * GET /api/v1/contabilidad/libro-mayor?account_id=1&mes=2&year=2026
 * GET /api/v1/contabilidad/balance?year=2026&mes=2
 * GET /api/v1/contabilidad/resultados?year=2026&mes=2
 * GET /api/v1/contabilidad/conciliacion?journal_id=1&mes=2&year=2026
 */
import type { FastifyInstance } from 'fastify'
import { authGuard } from '@/middlewares/auth-guard'
import { odooAccountingAdapter } from '@/adapters/odoo-accounting.adapter'
import { logger } from '@/core/logger'

export async function contabilidadRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  // ── GET /plan-cuentas ─────────────────────────────────────
  fastify.get('/plan-cuentas', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as {
      search?: string
      type?: string
      page?: string
      limit?: string
    }
    const page  = Number(q.page  ?? 1)
    const limit = Number(q.limit ?? 50)
    const offset = (page - 1) * limit

    const domain: any[] = [['company_id', '=', user.company_id]]
    if (q.type) {
      domain.push(['account_type', '=', q.type])
    }
    if (q.search) {
      domain.push('|', ['code', 'ilike', q.search], ['name', 'ilike', q.search])
    }

    try {
      const cuentas = await odooAccountingAdapter.searchRead(
        'account.account',
        domain,
        ['code', 'name', 'account_type', 'current_balance', 'reconcile', 'company_id'],
        { order: 'code asc', limit, offset },
      )

      const total = await odooAccountingAdapter.searchCount('account.account', domain)

      return reply.send({
        source: 'odoo',
        cuentas,
        total,
        page,
        limit,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching plan de cuentas from Odoo')
      return reply.send({
        source: 'error',
        cuentas: [],
        total: 0,
        page,
        limit,
      })
    }
  })

  // ── GET /libro-diario ─────────────────────────────────────
  fastify.get('/libro-diario', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as {
      mes?: string
      year?: string
      journal?: string
      state?: string
      page?: string
      limit?: string
    }
    const now    = new Date()
    const year   = Number(q.year  ?? now.getFullYear())
    const mes    = Number(q.mes   ?? now.getMonth() + 1)
    const page   = Number(q.page  ?? 1)
    const limit  = Number(q.limit ?? 50)
    const offset = (page - 1) * limit

    const monthStr = String(mes).padStart(2, '0')
    const lastDay  = new Date(year, mes, 0).getDate()
    const desde    = `${year}-${monthStr}-01`
    const hasta    = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`

    const domain: any[] = [
      ['company_id', '=', user.company_id],
      ['date', '>=', desde],
      ['date', '<=', hasta],
    ]
    if (q.journal) {
      domain.push(['journal_id', '=', Number(q.journal)])
    }
    if (q.state) {
      domain.push(['state', '=', q.state])
    }

    try {
      const moves = await odooAccountingAdapter.searchRead(
        'account.move',
        domain,
        ['name', 'date', 'journal_id', 'ref', 'amount_total', 'state', 'move_type', 'line_ids'],
        { order: 'date desc, id desc', limit, offset },
      )

      const total = await odooAccountingAdapter.searchCount('account.move', domain)

      // Fetch lines for each move
      const moveIds = moves.map((m: any) => m.id)
      let lineasPorMove: Record<number, any[]> = {}

      if (moveIds.length > 0) {
        const lineas = await odooAccountingAdapter.searchRead(
          'account.move.line',
          [['move_id', 'in', moveIds]],
          ['move_id', 'account_id', 'name', 'debit', 'credit', 'partner_id'],
          {},
        )
        for (const linea of lineas) {
          const mid = Array.isArray(linea.move_id) ? linea.move_id[0] : linea.move_id
          if (!lineasPorMove[mid]) lineasPorMove[mid] = []
          lineasPorMove[mid].push(linea)
        }
      }

      const asientos = moves.map((m: any) => ({
        ...m,
        lineas: lineasPorMove[m.id] ?? [],
      }))

      return reply.send({
        source: 'odoo',
        periodo: { year, mes },
        asientos,
        total,
        page,
        limit,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching libro diario from Odoo')
      return reply.send({
        source: 'error',
        periodo: { year, mes },
        asientos: [],
        total: 0,
        page,
        limit,
      })
    }
  })

  // ── GET /libro-mayor ──────────────────────────────────────
  fastify.get('/libro-mayor', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as {
      account_id?: string
      mes?: string
      year?: string
      page?: string
      limit?: string
    }

    if (!q.account_id) {
      return reply.status(400).send({ error: 'account_id es requerido' })
    }

    const now    = new Date()
    const year   = Number(q.year  ?? now.getFullYear())
    const mes    = Number(q.mes   ?? now.getMonth() + 1)
    const page   = Number(q.page  ?? 1)
    const limit  = Number(q.limit ?? 50)
    const offset = (page - 1) * limit

    const monthStr = String(mes).padStart(2, '0')
    const lastDay  = new Date(year, mes, 0).getDate()
    const desde    = `${year}-${monthStr}-01`
    const hasta    = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`
    const accountId = Number(q.account_id)

    const domain: any[] = [
      ['account_id', '=', accountId],
      ['date', '>=', desde],
      ['date', '<=', hasta],
      ['company_id', '=', user.company_id],
    ]

    try {
      const movimientos = await odooAccountingAdapter.searchRead(
        'account.move.line',
        domain,
        ['date', 'move_id', 'name', 'debit', 'credit', 'balance', 'partner_id', 'ref'],
        { order: 'date asc' },
      )

      // Fetch account info
      const cuentaData = await odooAccountingAdapter.searchRead(
        'account.account',
        [['id', '=', accountId]],
        ['code', 'name'],
        { limit: 1 },
      )
      const cuenta = cuentaData[0] ?? { code: '', name: '' }

      // Calculate running balance
      let saldo_inicial = 0
      let running = saldo_inicial
      const movimientosConSaldo = movimientos.map((m: any) => {
        running = running + (m.debit ?? 0) - (m.credit ?? 0)
        return { ...m, saldo_acumulado: running }
      })
      const saldo_final = running

      return reply.send({
        source: 'odoo',
        periodo: { year, mes },
        cuenta: { code: cuenta.code, name: cuenta.name },
        movimientos: movimientosConSaldo,
        saldo_inicial,
        saldo_final,
        page,
        limit,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching libro mayor from Odoo')
      return reply.send({
        source: 'error',
        periodo: { year, mes },
        cuenta: { code: '', name: '' },
        movimientos: [],
        saldo_inicial: 0,
        saldo_final: 0,
        page,
        limit,
      })
    }
  })

  // ── GET /balance ──────────────────────────────────────────
  fastify.get('/balance', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as { year?: string; mes?: string }
    const now  = new Date()
    const year = Number(q.year ?? now.getFullYear())
    const mes  = Number(q.mes  ?? now.getMonth() + 1)

    const monthStr = String(mes).padStart(2, '0')
    const lastDay  = new Date(year, mes, 0).getDate()
    const hasta    = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`

    const domain: any[] = [
      ['company_id', '=', user.company_id],
      ['date', '<=', hasta],
      ['parent_state', '=', 'posted'],
    ]

    try {
      const groups = await odooAccountingAdapter.readGroup(
        'account.move.line',
        domain,
        ['balance:sum'],
        ['account_id'],
      )

      // Fetch account types for all accounts
      const accountIds = groups.map((g: any) =>
        Array.isArray(g.account_id) ? g.account_id[0] : g.account_id,
      )

      const accountsData = accountIds.length > 0
        ? await odooAccountingAdapter.searchRead(
            'account.account',
            [['id', 'in', accountIds]],
            ['id', 'account_type'],
            {},
          )
        : []

      const accountTypeMap: Record<number, string> = {}
      for (const a of accountsData) {
        accountTypeMap[a.id] = a.account_type ?? ''
      }

      let activoCorriente      = 0
      let activoNoCorriente    = 0
      let pasivoCorriente      = 0
      let pasivoNoCorriente    = 0
      let patrimonio           = 0
      let resultado            = 0

      for (const g of groups) {
        const aid     = Array.isArray(g.account_id) ? g.account_id[0] : g.account_id
        const tipo    = accountTypeMap[aid] ?? ''
        const balance = g.balance ?? 0

        if (tipo.includes('asset') || tipo.includes('receivable')) {
          if (tipo.includes('non_current') || tipo.includes('fixed')) {
            activoNoCorriente += balance
          } else {
            activoCorriente += balance
          }
        } else if (tipo.includes('liability') || tipo.includes('payable')) {
          if (tipo.includes('non_current')) {
            pasivoNoCorriente += balance
          } else {
            pasivoCorriente += balance
          }
        } else if (tipo === 'equity') {
          patrimonio += balance
        } else if (tipo.includes('income') || tipo.includes('expense')) {
          resultado += balance
        }
      }

      const totalActivos  = activoCorriente + activoNoCorriente
      const totalPasivos  = pasivoCorriente + pasivoNoCorriente
      const totalPatrimonio = patrimonio + resultado
      const cuadra = Math.abs(totalActivos - (totalPasivos + totalPatrimonio)) < 0.01

      return reply.send({
        source: 'odoo',
        periodo: { year, mes },
        activos: {
          corrientes:     activoCorriente,
          no_corrientes:  activoNoCorriente,
          total:          totalActivos,
        },
        pasivos: {
          corrientes:     pasivoCorriente,
          no_corrientes:  pasivoNoCorriente,
          total:          totalPasivos,
        },
        patrimonio: {
          capital:    patrimonio,
          resultado,
          total:      totalPatrimonio,
        },
        cuadra,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching balance from Odoo')
      return reply.send({
        source: 'error',
        periodo: { year, mes },
        activos:   { corrientes: 0, no_corrientes: 0, total: 0 },
        pasivos:   { corrientes: 0, no_corrientes: 0, total: 0 },
        patrimonio: { capital: 0, resultado: 0, total: 0 },
        cuadra: false,
      })
    }
  })

  // ── GET /resultados ───────────────────────────────────────
  fastify.get('/resultados', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as { year?: string; mes?: string }
    const now  = new Date()
    const year = Number(q.year ?? now.getFullYear())
    const mes  = Number(q.mes  ?? now.getMonth() + 1)

    const monthStr = String(mes).padStart(2, '0')
    const lastDay  = new Date(year, mes, 0).getDate()
    const desde    = `${year}-01-01`
    const hasta    = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`

    const domain: any[] = [
      ['company_id', '=', user.company_id],
      ['date', '>=', desde],
      ['date', '<=', hasta],
      ['parent_state', '=', 'posted'],
      ['account_id.account_type', 'in', ['income', 'income_other', 'expense', 'expense_depreciation', 'expense_direct_cost']],
    ]

    try {
      const groups = await odooAccountingAdapter.readGroup(
        'account.move.line',
        domain,
        ['balance:sum'],
        ['account_id'],
      )

      const accountIds = groups.map((g: any) =>
        Array.isArray(g.account_id) ? g.account_id[0] : g.account_id,
      )

      const accountsData = accountIds.length > 0
        ? await odooAccountingAdapter.searchRead(
            'account.account',
            [['id', 'in', accountIds]],
            ['id', 'account_type', 'name'],
            {},
          )
        : []

      const accountTypeMap: Record<number, string> = {}
      for (const a of accountsData) {
        accountTypeMap[a.id] = a.account_type ?? ''
      }

      let ventas          = 0
      let otrosIngresos   = 0
      let costoVentas     = 0
      let administrativos = 0
      let financieros     = 0

      for (const g of groups) {
        const aid     = Array.isArray(g.account_id) ? g.account_id[0] : g.account_id
        const tipo    = accountTypeMap[aid] ?? ''
        const balance = g.balance ?? 0

        if (tipo === 'income') {
          ventas += Math.abs(balance)
        } else if (tipo === 'income_other') {
          otrosIngresos += Math.abs(balance)
        } else if (tipo === 'expense_direct_cost') {
          costoVentas += Math.abs(balance)
        } else if (tipo === 'expense_depreciation') {
          financieros += Math.abs(balance)
        } else if (tipo === 'expense') {
          administrativos += Math.abs(balance)
        }
      }

      const totalIngresos  = ventas + otrosIngresos
      const totalGastos    = costoVentas + administrativos + financieros
      const utilidadBruta  = ventas - costoVentas
      const utilidadNeta   = totalIngresos - totalGastos

      return reply.send({
        source: 'odoo',
        periodo: { year, mes },
        ingresos: {
          ventas,
          otros:  otrosIngresos,
          total:  totalIngresos,
        },
        gastos: {
          costo_ventas:   costoVentas,
          administrativos,
          financieros,
          total:          totalGastos,
        },
        resultado: {
          utilidad_bruta: utilidadBruta,
          utilidad_neta:  utilidadNeta,
        },
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching resultados from Odoo')
      return reply.send({
        source: 'error',
        periodo: { year, mes },
        ingresos: { ventas: 0, otros: 0, total: 0 },
        gastos:   { costo_ventas: 0, administrativos: 0, financieros: 0, total: 0 },
        resultado: { utilidad_bruta: 0, utilidad_neta: 0 },
      })
    }
  })

  // ── GET /conciliacion ─────────────────────────────────────
  fastify.get('/conciliacion', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as {
      journal_id?: string
      mes?: string
      year?: string
      page?: string
      limit?: string
    }

    if (!q.journal_id) {
      return reply.status(400).send({ error: 'journal_id es requerido' })
    }

    const now      = new Date()
    const year     = Number(q.year      ?? now.getFullYear())
    const mes      = Number(q.mes       ?? now.getMonth() + 1)
    const page     = Number(q.page      ?? 1)
    const limit    = Number(q.limit     ?? 50)
    const offset   = (page - 1) * limit
    const journalId = Number(q.journal_id)

    const monthStr = String(mes).padStart(2, '0')
    const lastDay  = new Date(year, mes, 0).getDate()
    const desde    = `${year}-${monthStr}-01`
    const hasta    = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`

    const statementDomain: any[] = [
      ['journal_id', '=', journalId],
      ['date', '>=', desde],
      ['date', '<=', hasta],
      ['company_id', '=', user.company_id],
    ]

    const unreconcilDomain: any[] = [
      ['account_id.reconcile', '=', true],
      ['reconciled', '=', false],
      ['journal_id', '=', journalId],
      ['company_id', '=', user.company_id],
    ]

    try {
      const [extracto, sinConciliar] = await Promise.all([
        odooAccountingAdapter.searchRead(
          'account.bank.statement.line',
          statementDomain,
          ['date', 'payment_ref', 'amount', 'is_reconciled', 'partner_id'],
          { order: 'date desc', limit, offset },
        ),
        odooAccountingAdapter.searchRead(
          'account.move.line',
          unreconcilDomain,
          ['date', 'move_id', 'name', 'debit', 'credit', 'partner_id'],
          { order: 'date desc' },
        ),
      ])

      const total_extracto       = extracto.reduce((s: number, l: any) => s + (l.amount ?? 0), 0)
      const total_sin_conciliar  = sinConciliar.reduce(
        (s: number, l: any) => s + (l.debit ?? 0) - (l.credit ?? 0),
        0,
      )

      return reply.send({
        source: 'odoo',
        periodo: { year, mes },
        extracto,
        sin_conciliar:       sinConciliar,
        total_extracto,
        total_sin_conciliar,
        page,
        limit,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching conciliacion from Odoo')
      return reply.send({
        source: 'error',
        periodo: { year, mes },
        extracto:            [],
        sin_conciliar:       [],
        total_extracto:      0,
        total_sin_conciliar: 0,
        page,
        limit,
      })
    }
  })
}
