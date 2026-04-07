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
import { z } from 'zod'
import { authGuard } from '@/middlewares/auth-guard'
import { odooAccountingAdapter } from '@/adapters/odoo-accounting.adapter'
import { logger } from '@/core/logger'
import { generateBalancePDF } from '@/services/balance-pdf.service'
import { generateResultadosPDF } from '@/services/resultados-pdf.service'
import { generateLibroDiarioPDF } from '@/services/libro-diario-pdf.service'
import { generateLibroMayorPDF } from '@/services/libro-mayor-pdf.service'
import { parseStatement } from '@/services/bank-import.service'
import { findMatches } from '@/services/bank-matching.service'
import { generateForecast, type CashFlowPeriod, type CashFlowForecastData } from '@/services/cashflow-forecast.service'

// ---------------------------------------------------------------------------
// Zod schemas for transactional endpoints
// ---------------------------------------------------------------------------

const ACCOUNT_TYPES = [
  'asset_receivable', 'asset_cash', 'asset_current', 'asset_non_current',
  'asset_prepayments', 'asset_fixed',
  'liability_payable', 'liability_credit_card', 'liability_current', 'liability_non_current',
  'equity', 'equity_unaffected',
  'income', 'income_other',
  'expense', 'expense_depreciation', 'expense_direct_cost',
  'off_balance',
] as const

const cuentaSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1),
  account_type: z.enum(ACCOUNT_TYPES),
  reconcile: z.boolean().optional().default(false),
})

const importCuentasSchema = z.object({
  accounts: z.array(cuentaSchema).min(1),
})

const lineaSchema = z.object({
  account_id: z.number().positive(),
  name: z.string().optional().default(''),
  debit: z.number().min(0).default(0),
  credit: z.number().min(0).default(0),
  partner_id: z.number().optional(),
})

const asientoSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  journal_id: z.number().positive(),
  ref: z.string().optional(),
  narration: z.string().optional(),
  line_ids: z.array(lineaSchema).min(2),
}).refine(data => {
  const totalDebit = data.line_ids.reduce((s, l) => s + l.debit, 0)
  const totalCredit = data.line_ids.reduce((s, l) => s + l.credit, 0)
  return Math.abs(totalDebit - totalCredit) < 0.01
}, { message: 'El asiento no cuadra: Debe != Haber' })

const importCartolaSchema = z.object({
  journal_id: z.number().positive(),
  name: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  balance_start: z.number().default(0),
  balance_end_real: z.number().default(0),
  lines: z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    payment_ref: z.string().min(1),
    amount: z.number(),
    partner_id: z.number().optional(),
  })).min(1),
})

const reconcileSchema = z.object({
  statement_line_ids: z.array(z.number().positive()).min(1),
})

const journalSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(5),
  type: z.enum(['sale', 'purchase', 'bank', 'cash', 'general']),
})

const setupSchema = z.object({
  journals: z.array(journalSchema).optional(),
  accounts: z.array(cuentaSchema).optional(),
})

export async function contabilidadRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  // ── GET /journals ────────────────────────────────────────
  fastify.get('/journals', async (req, reply) => {
    const user = (req as any).user
    try {
      const journals = await odooAccountingAdapter.searchRead(
        'account.journal',
        [['company_id', '=', user.company_id]],
        ['id', 'name', 'type', 'code'],
        { order: 'name asc' },
      )
      const mapped = (journals as any[]).map((j: any) => ({
        id: j.id,
        nombre: j.name,
        tipo: j.type,
        codigo: j.code,
      }))
      return reply.send({ source: 'odoo', journals: mapped })
    } catch (err) {
      logger.error({ err }, 'Error fetching journals from Odoo')
      return reply.send({ source: 'error', journals: [], message: 'Error cargando diarios contables' })
    }
  })

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

    // Odoo 18: account.account no longer has company_id (accounts are shared across companies)
    const domain: any[] = []
    if (q.type) {
      domain.push(['account_type', '=', q.type])
    }
    if (q.search) {
      domain.push('|', ['code', 'ilike', q.search], ['name', 'ilike', q.search])
    }

    try {
      // Odoo 18: search_read on account.account fails with ValueError.
      // Use search + read instead.
      const [ids, total] = await Promise.all([
        odooAccountingAdapter.search('account.account', domain, { order: 'code asc', limit, offset }),
        odooAccountingAdapter.searchCount('account.account', domain),
      ])

      const cuentas = await odooAccountingAdapter.read(
        'account.account',
        ids,
        ['id', 'code', 'name', 'account_type', 'reconcile'],
      )

      // Map Odoo field names to Spanish for frontend consistency
      const mapped = (cuentas as any[]).map((c: any) => ({
        id: c.id,
        codigo: c.code ?? '',
        nombre: c.name ?? '',
        tipo: c.account_type ?? '',
        saldo: 0, // current_balance not available via read; computed separately if needed
        reconciliable: c.reconcile ?? false,
      }))

      return reply.send({
        source: 'odoo',
        cuentas: mapped,
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
        message: 'Error cargando plan de cuentas',
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
        for (const linea of lineas as any[]) {
          const mid = Array.isArray(linea.move_id) ? linea.move_id[0] : linea.move_id
          if (!lineasPorMove[mid]) lineasPorMove[mid] = []
          lineasPorMove[mid].push(linea)
        }
      }

      const asientos = moves.map((m: any) => {
        const lineas = (lineasPorMove[m.id] ?? []).map((l: any) => ({
          id: l.id,
          cuenta: l.account_id ? (Array.isArray(l.account_id) ? l.account_id[1] : l.account_id) : '-',
          descripcion: l.name ?? '',
          debe: l.debit ?? 0,
          haber: l.credit ?? 0,
          partner: l.partner_id ? (Array.isArray(l.partner_id) ? l.partner_id[1] : l.partner_id) : null,
        }))
        const totalDebe = lineas.reduce((s: number, l: any) => s + l.debe, 0)
        const totalHaber = lineas.reduce((s: number, l: any) => s + l.haber, 0)
        return {
          id: m.id,
          fecha: m.date ?? '',
          numero: m.name ?? '',
          referencia: m.ref ?? '',
          diario: m.journal_id ? (Array.isArray(m.journal_id) ? m.journal_id[1] : m.journal_id) : '',
          debe: totalDebe,
          haber: totalHaber,
          estado: m.state ?? 'draft',
          tipo: m.move_type ?? '',
          lineas,
        }
      })

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
        message: 'Error cargando libro diario',
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
      // Calculate opening balance from all prior movements
      const priorDomain: any[] = [
        ['account_id', '=', accountId],
        ['date', '<', desde],
        ['company_id', '=', user.company_id],
        ['parent_state', '=', 'posted'],
      ]
      const priorGroups = await odooAccountingAdapter.readGroup(
        'account.move.line',
        priorDomain,
        ['debit:sum', 'credit:sum'],
        ['account_id'],
      )
      const priorData = (priorGroups as any[])[0]
      const saldo_inicial = priorData
        ? (priorData.debit ?? 0) - (priorData.credit ?? 0)
        : 0

      const movimientos = await odooAccountingAdapter.searchRead(
        'account.move.line',
        domain,
        ['date', 'move_id', 'name', 'debit', 'credit', 'balance', 'partner_id', 'ref'],
        { order: 'date asc' },
      )

      // Fetch account info (Odoo 18: use read, not searchRead for account.account)
      const cuentaData = await odooAccountingAdapter.read(
        'account.account',
        [accountId],
        ['code', 'name', 'account_type'],
      )
      const raw = (cuentaData as any[])[0] ?? { code: '', name: '', account_type: '' }
      const cuenta = { codigo: raw.code, nombre: raw.name, tipo: raw.account_type }
      let running: number = saldo_inicial
      const movimientosConSaldo = (movimientos as any[]).map((m: any) => {
        const debe = m.debit ?? 0
        const haber = m.credit ?? 0
        running = running + debe - haber
        return {
          fecha: m.date,
          documento: m.move_id?.[1] ?? m.ref ?? '',
          descripcion: m.name ?? '',
          debe,
          haber,
          saldo_acumulado: running,
          partner: m.partner_id?.[1] ?? '',
        }
      })
      const saldo_final = running

      return reply.send({
        source: 'odoo',
        periodo: { year, mes },
        cuenta,
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
        cuenta: { codigo: '', nombre: '', tipo: '' },
        movimientos: [],
        saldo_inicial: 0,
        saldo_final: 0,
        page,
        limit,
        message: 'Error cargando libro mayor',
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

      // Odoo 18: use read instead of searchRead for account.account
      const accountsData = accountIds.length > 0
        ? await odooAccountingAdapter.read(
            'account.account',
            accountIds,
            ['id', 'account_type'],
          )
        : []

      const accountTypeMap: Record<number, string> = {}
      for (const a of accountsData as any[]) {
        accountTypeMap[a.id] = a.account_type ?? ''
      }

      let activoCorriente      = 0
      let activoNoCorriente    = 0
      let pasivoCorriente      = 0
      let pasivoNoCorriente    = 0
      let patrimonio           = 0
      let resultado            = 0

      for (const g of groups as any[]) {
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
        } else if (tipo.includes('equity')) {
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
        message: 'Error cargando balance general',
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

      // Odoo 18: use read instead of searchRead for account.account
      const accountsData = accountIds.length > 0
        ? await odooAccountingAdapter.read(
            'account.account',
            accountIds,
            ['id', 'account_type', 'name'],
          )
        : []

      const accountTypeMap: Record<number, string> = {}
      for (const a of accountsData as any[]) {
        accountTypeMap[a.id] = a.account_type ?? ''
      }

      let ventas          = 0
      let otrosIngresos   = 0
      let costoVentas     = 0
      let administrativos = 0
      let depreciacion    = 0

      for (const g of groups as any[]) {
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
          depreciacion += Math.abs(balance)
        } else if (tipo === 'expense') {
          administrativos += Math.abs(balance)
        }
      }

      const totalIngresos  = ventas + otrosIngresos
      const totalGastos    = costoVentas + administrativos + depreciacion
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
          depreciacion,
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
        gastos:   { costo_ventas: 0, administrativos: 0, depreciacion: 0, total: 0 },
        resultado: { utilidad_bruta: 0, utilidad_neta: 0 },
        message: 'Error cargando estado de resultados',
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

      const mappedExtracto = extracto.map((l: any) => ({
        id: l.id,
        fecha: l.date ?? '',
        referencia: l.payment_ref ?? '',
        monto: l.amount ?? 0,
        conciliado: l.is_reconciled ?? false,
        partner: l.partner_id ? (Array.isArray(l.partner_id) ? l.partner_id[1] : l.partner_id) : null,
      }))

      const mappedSinConciliar = sinConciliar.map((l: any) => ({
        id: l.id,
        fecha: l.date ?? '',
        documento: l.move_id ? (Array.isArray(l.move_id) ? l.move_id[1] : l.move_id) : '',
        descripcion: l.name ?? '',
        monto: (l.debit ?? 0) - (l.credit ?? 0),
        partner: l.partner_id ? (Array.isArray(l.partner_id) ? l.partner_id[1] : l.partner_id) : null,
      }))

      const total_extracto       = mappedExtracto.reduce((s: number, l: any) => s + l.monto, 0)
      const total_sin_conciliar  = mappedSinConciliar.reduce((s: number, l: any) => s + l.monto, 0)

      return reply.send({
        source: 'odoo',
        periodo: { year, mes },
        extracto: mappedExtracto,
        sin_conciliar: mappedSinConciliar,
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
        message: 'Error cargando conciliación bancaria',
      })
    }
  })

  // =========================================================================
  // Transactional endpoints — Plan de Cuentas CRUD
  // =========================================================================

  // ── POST /plan-cuentas ──────────────────────────────────────
  fastify.post('/plan-cuentas', async (req, reply) => {
    const parse = cuentaSchema.safeParse(req.body)
    if (!parse.success) return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten().fieldErrors })
    const id = await odooAccountingAdapter.create('account.account', parse.data)
    if (!id) return reply.status(502).send({ error: 'odoo_error', message: 'Error creando cuenta en Odoo' })
    return reply.status(201).send({ id })
  })

  // ── POST /plan-cuentas/import ───────────────────────────────
  fastify.post('/plan-cuentas/import', async (req, reply) => {
    const parse = importCuentasSchema.safeParse(req.body)
    if (!parse.success) return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten().fieldErrors })
    const ids = await odooAccountingAdapter.createBatch('account.account', parse.data.accounts)
    if (ids.length === 0) return reply.status(502).send({ error: 'odoo_error', message: 'Error importando cuentas en Odoo' })
    return reply.status(201).send({ created: ids.length, ids })
  })

  // ── PUT /plan-cuentas/:id ───────────────────────────────────
  fastify.put('/plan-cuentas/:id', async (req, reply) => {
    const id = Number((req.params as any).id)
    const parse = cuentaSchema.partial().safeParse(req.body)
    if (!parse.success) return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten().fieldErrors })
    const ok = await odooAccountingAdapter.write('account.account', [id], parse.data)
    if (!ok) return reply.status(502).send({ error: 'odoo_error', message: 'Error actualizando cuenta' })
    return reply.send({ ok: true })
  })

  // ── DELETE /plan-cuentas/:id ────────────────────────────────
  fastify.delete('/plan-cuentas/:id', async (req, reply) => {
    const id = Number((req.params as any).id)
    const ok = await odooAccountingAdapter.unlink('account.account', [id])
    if (!ok) return reply.status(502).send({ error: 'odoo_error', message: 'Error eliminando cuenta (puede tener movimientos asociados)' })
    return reply.send({ ok: true })
  })

  // =========================================================================
  // Transactional endpoints — Asientos contables (Journal Entries)
  // =========================================================================

  // ── POST /asientos ──────────────────────────────────────────
  fastify.post('/asientos', async (req, reply) => {
    const user = (req as any).user
    const parse = asientoSchema.safeParse(req.body)
    if (!parse.success) return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten() })
    const { date, journal_id, ref, narration, line_ids } = parse.data
    const moveId = await odooAccountingAdapter.create('account.move', {
      move_type: 'entry',
      date,
      journal_id,
      ref: ref ?? '',
      narration: narration ?? '',
      company_id: user.company_id,
      line_ids: line_ids.map(l => [0, 0, {
        account_id: l.account_id,
        name: l.name,
        debit: l.debit,
        credit: l.credit,
        partner_id: l.partner_id || false,
      }]),
    })
    if (!moveId) return reply.status(502).send({ error: 'odoo_error', message: 'Error creando asiento en Odoo' })
    logger.info({ moveId }, 'Journal entry created')
    return reply.status(201).send({ id: moveId })
  })

  // ── PUT /asientos/:id ──────────────────────────────────────
  fastify.put('/asientos/:id', async (req, reply) => {
    const user = (req as any).user
    const id = Number((req.params as any).id)
    const parse = asientoSchema.safeParse(req.body)
    if (!parse.success) return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten() })
    const { date, journal_id, ref, narration, line_ids } = parse.data
    // First clear existing lines, then add new ones
    const existing = await odooAccountingAdapter.searchRead('account.move.line', [['move_id', '=', id]], ['id'], {})
    const existingIds = (existing as any[]).map((l: any) => l.id)
    const deleteCommands = existingIds.map((lid: number) => [2, lid, 0])
    const createCommands = line_ids.map(l => [0, 0, {
      account_id: l.account_id,
      name: l.name,
      debit: l.debit,
      credit: l.credit,
      partner_id: l.partner_id || false,
    }])
    const ok = await odooAccountingAdapter.write('account.move', [id], {
      date, journal_id, ref: ref ?? '', narration: narration ?? '',
      line_ids: [...deleteCommands, ...createCommands],
    })
    if (!ok) return reply.status(502).send({ error: 'odoo_error', message: 'Error actualizando asiento' })
    return reply.send({ ok: true })
  })

  // ── POST /asientos/:id/post ─────────────────────────────────
  fastify.post('/asientos/:id/post', async (req, reply) => {
    const id = Number((req.params as any).id)
    const result = await odooAccountingAdapter.callMethod('account.move', 'action_post', [id])
    if (result === null) return reply.status(502).send({ error: 'odoo_error', message: 'Error publicando asiento' })
    return reply.send({ ok: true })
  })

  // ── POST /asientos/:id/draft ────────────────────────────────
  fastify.post('/asientos/:id/draft', async (req, reply) => {
    const id = Number((req.params as any).id)
    const result = await odooAccountingAdapter.callMethod('account.move', 'button_draft', [id])
    if (result === null) return reply.status(502).send({ error: 'odoo_error', message: 'Error revirtiendo asiento a borrador' })
    return reply.send({ ok: true })
  })

  // ── DELETE /asientos/:id ────────────────────────────────────
  fastify.delete('/asientos/:id', async (req, reply) => {
    const id = Number((req.params as any).id)
    const ok = await odooAccountingAdapter.unlink('account.move', [id])
    if (!ok) return reply.status(502).send({ error: 'odoo_error', message: 'Error eliminando asiento (solo borradores pueden eliminarse)' })
    return reply.send({ ok: true })
  })

  // =========================================================================
  // Transactional endpoints — Cartola bancaria (Bank Statements)
  // =========================================================================

  // ── POST /cartola/import ────────────────────────────────────
  fastify.post('/cartola/import', async (req, reply) => {
    const user = (req as any).user
    const parse = importCartolaSchema.safeParse(req.body)
    if (!parse.success) return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten() })
    const { journal_id, name, date, balance_start, balance_end_real, lines } = parse.data
    const statementId = await odooAccountingAdapter.create('account.bank.statement', {
      name,
      date,
      journal_id,
      balance_start,
      balance_end_real,
      company_id: user.company_id,
      line_ids: lines.map(l => [0, 0, {
        date: l.date,
        payment_ref: l.payment_ref,
        amount: l.amount,
        journal_id,
        partner_id: l.partner_id || false,
      }]),
    })
    if (!statementId) return reply.status(502).send({ error: 'odoo_error', message: 'Error importando cartola en Odoo' })
    logger.info({ statementId, lines: lines.length }, 'Bank statement imported')
    return reply.status(201).send({ id: statementId, lines_imported: lines.length })
  })

  // ── GET /cartola/statements ─────────────────────────────────
  fastify.get('/cartola/statements', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as { journal_id?: string }
    const domain: any[] = [['company_id', '=', user.company_id]]
    if (q.journal_id) domain.push(['journal_id', '=', Number(q.journal_id)])
    try {
      const statements = await odooAccountingAdapter.searchRead(
        'account.bank.statement',
        domain,
        ['id', 'name', 'date', 'journal_id', 'balance_start', 'balance_end_real'],
        { order: 'date desc', limit: 100 },
      )
      return reply.send({ source: 'odoo', statements })
    } catch (err) {
      logger.error({ err }, 'Error fetching bank statements')
      return reply.send({ source: 'error', statements: [], message: 'Error cargando cartolas' })
    }
  })

  // =========================================================================
  // Transactional endpoints — Statement Lines CRUD
  // =========================================================================

  // ── PUT /cartola/lineas/:id — edit a statement line ─────────
  fastify.put('/cartola/lineas/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as { date?: string; payment_ref?: string; amount?: number }

    const vals: Record<string, unknown> = {}
    if (body.date) vals['date'] = body.date
    if (body.payment_ref !== undefined) vals['payment_ref'] = body.payment_ref
    if (body.amount !== undefined) vals['amount'] = body.amount

    if (Object.keys(vals).length === 0) {
      return reply.status(400).send({ error: 'No fields to update' })
    }

    const ok = await odooAccountingAdapter.write('account.bank.statement.line', [Number(id)], vals)
    if (!ok) return reply.status(502).send({ error: 'odoo_error', message: 'Error actualizando linea' })
    return reply.send({ ok: true, id: Number(id) })
  })

  // ── DELETE /cartola/lineas/:id — delete a statement line ────
  fastify.delete('/cartola/lineas/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const ok = await odooAccountingAdapter.unlink('account.bank.statement.line', [Number(id)])
    if (!ok) return reply.status(502).send({ error: 'odoo_error', message: 'Error eliminando linea' })
    return reply.send({ ok: true })
  })

  // ── POST /cartola/lineas — add a statement line ─────────────
  fastify.post('/cartola/lineas', async (req, reply) => {
    const user = (req as any).user
    const body = req.body as { journal_id: number; date: string; payment_ref: string; amount: number; statement_id?: number }

    if (!body.journal_id || !body.date || !body.payment_ref || body.amount === undefined) {
      return reply.status(400).send({ error: 'journal_id, date, payment_ref y amount son requeridos' })
    }

    const vals: Record<string, unknown> = {
      journal_id: body.journal_id,
      date: body.date,
      payment_ref: body.payment_ref,
      amount: body.amount,
      company_id: user.company_id,
    }
    if (body.statement_id) vals['statement_id'] = body.statement_id

    const lineId = await odooAccountingAdapter.create('account.bank.statement.line', vals)
    if (!lineId) return reply.status(502).send({ error: 'odoo_error', message: 'Error creando linea' })
    return reply.status(201).send({ ok: true, id: lineId })
  })

  // =========================================================================
  // Transactional endpoints — Conciliacion (Reconciliation)
  // =========================================================================

  // ── POST /conciliacion/reconcile ────────────────────────────
  fastify.post('/conciliacion/reconcile', async (req, reply) => {
    const parse = reconcileSchema.safeParse(req.body)
    if (!parse.success) return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten() })
    const result = await odooAccountingAdapter.callMethod(
      'account.bank.statement.line', 'action_auto_reconcile', parse.data.statement_line_ids,
    )
    if (result === null) return reply.status(502).send({ error: 'odoo_error', message: 'Error conciliando lineas' })
    return reply.send({ ok: true })
  })

  // ── POST /conciliacion/auto ─────────────────────────────────
  fastify.post('/conciliacion/auto', async (req, reply) => {
    const user = (req as any).user
    const q = req.body as { journal_id: number }
    if (!q.journal_id) return reply.status(400).send({ error: 'journal_id es requerido' })
    // Get all unreconciled statement lines for this journal
    const lines = await odooAccountingAdapter.search(
      'account.bank.statement.line',
      [['journal_id', '=', q.journal_id], ['is_reconciled', '=', false], ['company_id', '=', user.company_id]],
      { limit: 500 },
    )
    if (lines.length === 0) return reply.send({ reconciled: 0, message: 'No hay lineas pendientes' })
    const result = await odooAccountingAdapter.callMethod(
      'account.bank.statement.line', 'action_auto_reconcile', lines,
    )
    return reply.send({ ok: true, lines_processed: lines.length })
  })

  // =========================================================================
  // Transactional endpoints — Libro Auxiliar (Partner Balances)
  // =========================================================================

  // ── GET /auxiliar ───────────────────────────────────────────
  fastify.get('/auxiliar', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as { type?: string; mes?: string; year?: string }
    const accountType = q.type ?? 'asset_receivable'
    const now = new Date()
    const year = Number(q.year ?? now.getFullYear())
    const mes = Number(q.mes ?? now.getMonth() + 1)
    const monthStr = String(mes).padStart(2, '0')
    const lastDay = new Date(year, mes, 0).getDate()
    const hasta = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`

    try {
      const groups = await odooAccountingAdapter.readGroup(
        'account.move.line',
        [
          ['account_id.account_type', '=', accountType],
          ['parent_state', '=', 'posted'],
          ['company_id', '=', user.company_id],
          ['date', '<=', hasta],
        ],
        ['debit:sum', 'credit:sum', 'balance:sum'],
        ['partner_id'],
      )
      const partners = (groups as any[])
        .filter((g: any) => g.partner_id)
        .map((g: any) => ({
          id: Array.isArray(g.partner_id) ? g.partner_id[0] : g.partner_id,
          nombre: Array.isArray(g.partner_id) ? g.partner_id[1] : '',
          debe: g.debit ?? 0,
          haber: g.credit ?? 0,
          saldo: g.balance ?? 0,
        }))
        .sort((a: any, b: any) => Math.abs(b.saldo) - Math.abs(a.saldo))
      return reply.send({ source: 'odoo', partners, tipo: accountType })
    } catch (err) {
      logger.error({ err }, 'Error fetching auxiliar')
      return reply.send({ source: 'error', partners: [], tipo: accountType, message: 'Error cargando libro auxiliar' })
    }
  })

  // ── GET /auxiliar/:partner_id ───────────────────────────────
  fastify.get('/auxiliar/:partner_id', async (req, reply) => {
    const user = (req as any).user
    const partnerId = Number((req.params as any).partner_id)
    const q = req.query as { type?: string; mes?: string; year?: string }
    const accountType = q.type ?? 'asset_receivable'
    const now = new Date()
    const year = Number(q.year ?? now.getFullYear())
    const mes = Number(q.mes ?? now.getMonth() + 1)
    const monthStr = String(mes).padStart(2, '0')
    const lastDay = new Date(year, mes, 0).getDate()
    const hasta = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`

    try {
      const lines = await odooAccountingAdapter.searchRead(
        'account.move.line',
        [
          ['partner_id', '=', partnerId],
          ['account_id.account_type', '=', accountType],
          ['parent_state', '=', 'posted'],
          ['company_id', '=', user.company_id],
          ['date', '<=', hasta],
        ],
        ['date', 'move_id', 'name', 'ref', 'debit', 'credit', 'balance', 'reconciled'],
        { order: 'date asc', limit: 500 },
      )
      let running = 0
      const movimientos = (lines as any[]).map((l: any) => {
        running += (l.debit ?? 0) - (l.credit ?? 0)
        return {
          fecha: l.date,
          documento: l.move_id?.[1] ?? '',
          descripcion: l.name ?? '',
          ref: l.ref ?? '',
          debe: l.debit ?? 0,
          haber: l.credit ?? 0,
          saldo_acumulado: running,
          conciliado: l.reconciled ?? false,
        }
      })
      return reply.send({ source: 'odoo', partner_id: partnerId, tipo: accountType, movimientos, saldo_final: running })
    } catch (err) {
      logger.error({ err }, 'Error fetching auxiliar detail')
      return reply.send({ source: 'error', partner_id: partnerId, tipo: accountType, movimientos: [], saldo_final: 0, message: 'Error cargando detalle auxiliar' })
    }
  })

  // =========================================================================
  // Transactional endpoints — Journals & Setup
  // =========================================================================

  // ── POST /journals ──────────────────────────────────────────
  fastify.post('/journals', async (req, reply) => {
    const user = (req as any).user
    const parse = journalSchema.safeParse(req.body)
    if (!parse.success) return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten().fieldErrors })
    const id = await odooAccountingAdapter.create('account.journal', {
      ...parse.data,
      company_id: user.company_id,
    })
    if (!id) return reply.status(502).send({ error: 'odoo_error', message: 'Error creando diario contable' })
    return reply.status(201).send({ id })
  })

  // ── POST /setup ─────────────────────────────────────────────
  fastify.post('/setup', async (req, reply) => {
    const user = (req as any).user
    const parse = setupSchema.safeParse(req.body)
    if (!parse.success) return reply.status(400).send({ error: 'validation_error', details: parse.error.flatten() })
    const results: { journals_created: number; accounts_created: number } = { journals_created: 0, accounts_created: 0 }
    // Create journals
    if (parse.data.journals?.length) {
      for (const j of parse.data.journals) {
        const id = await odooAccountingAdapter.create('account.journal', {
          ...j,
          company_id: user.company_id,
        })
        if (id) results.journals_created++
      }
    }
    // Create accounts
    if (parse.data.accounts?.length) {
      const ids = await odooAccountingAdapter.createBatch('account.account', parse.data.accounts)
      results.accounts_created = ids.length
    }
    logger.info({ results }, 'Company accounting setup completed')
    return reply.status(201).send(results)
  })

  // =========================================================================
  // PDF Export Endpoints
  // =========================================================================

  // ── GET /balance/pdf ────────────────────────────────────────
  fastify.get('/balance/pdf', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as { year?: string; mes?: string }
    const year = Number(q.year ?? new Date().getFullYear())
    const mes = Number(q.mes ?? new Date().getMonth() + 1)

    try {
      const dataRes = await fastify.inject({
        method: 'GET',
        url: `/api/v1/contabilidad/balance?year=${year}&mes=${mes}`,
        headers: { authorization: req.headers.authorization },
      })
      const data = JSON.parse(dataRes.body)

      const pdf = await generateBalancePDF({
        company_name: user.company_name ?? '',
        company_rut: user.company_rut ?? '',
        periodo: { year, mes },
        activos: data.activos ?? { corrientes: 0, no_corrientes: 0, total: 0 },
        pasivos: data.pasivos ?? { corrientes: 0, no_corrientes: 0, total: 0 },
        patrimonio: data.patrimonio ?? { capital: 0, resultado: 0, total: 0 },
        cuadra: data.cuadra ?? false,
      })

      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', `inline; filename="Balance_${year}_${mes}.pdf"`)
      return reply.send(pdf)
    } catch (err) {
      logger.error({ err }, 'Error generating balance PDF')
      return reply.status(500).send({ error: 'Error generando PDF de balance' })
    }
  })

  // ── GET /resultados/pdf ─────────────────────────────────────
  fastify.get('/resultados/pdf', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as { year?: string; mes?: string }
    const year = Number(q.year ?? new Date().getFullYear())
    const mes = Number(q.mes ?? new Date().getMonth() + 1)

    try {
      const dataRes = await fastify.inject({
        method: 'GET',
        url: `/api/v1/contabilidad/resultados?year=${year}&mes=${mes}`,
        headers: { authorization: req.headers.authorization },
      })
      const data = JSON.parse(dataRes.body)

      const pdf = await generateResultadosPDF({
        company_name: user.company_name ?? '',
        company_rut: user.company_rut ?? '',
        periodo: { year, mes },
        ingresos: data.ingresos ?? { ventas: 0, otros: 0, total: 0 },
        gastos: data.gastos ?? { costo_ventas: 0, administrativos: 0, depreciacion: 0, total: 0 },
        resultado: data.resultado ?? { utilidad_bruta: 0, utilidad_neta: 0 },
      })

      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', `inline; filename="Estado_Resultados_${year}_${mes}.pdf"`)
      return reply.send(pdf)
    } catch (err) {
      logger.error({ err }, 'Error generating resultados PDF')
      return reply.status(500).send({ error: 'Error generando PDF de estado de resultados' })
    }
  })

  // ── GET /libro-diario/pdf ───────────────────────────────────
  fastify.get('/libro-diario/pdf', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as { mes?: string; year?: string }
    const year = Number(q.year ?? new Date().getFullYear())
    const mes = Number(q.mes ?? new Date().getMonth() + 1)

    try {
      // Fetch all journal entries for the period (no pagination for PDF)
      const dataRes = await fastify.inject({
        method: 'GET',
        url: `/api/v1/contabilidad/libro-diario?mes=${mes}&year=${year}&limit=9999`,
        headers: { authorization: req.headers.authorization },
      })
      const data = JSON.parse(dataRes.body)
      const asientos = (data.asientos ?? []).map((a: any) => ({
        name: a.numero ?? a.name ?? '',
        date: a.fecha ?? a.date ?? '',
        journal_name: a.diario ?? a.journal_name ?? '',
        state: a.estado ?? a.state ?? 'draft',
        lines: (a.lineas ?? a.lines ?? []).map((l: any) => ({
          account_code: l.account_code ?? '',
          account_name: l.cuenta ?? l.account_name ?? '',
          debit: l.debe ?? l.debit ?? 0,
          credit: l.haber ?? l.credit ?? 0,
          name: l.descripcion ?? l.name ?? '',
        })),
      }))

      const pdf = await generateLibroDiarioPDF({
        company_name: user.company_name ?? '',
        company_rut: user.company_rut ?? '',
        periodo: { year, mes },
        asientos,
      })

      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', `inline; filename="Libro_Diario_${year}_${mes}.pdf"`)
      return reply.send(pdf)
    } catch (err) {
      logger.error({ err }, 'Error generating libro diario PDF')
      return reply.status(500).send({ error: 'Error generando PDF de libro diario' })
    }
  })

  // ── GET /libro-mayor/pdf ────────────────────────────────────
  fastify.get('/libro-mayor/pdf', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as { account_id?: string; mes?: string; year?: string }

    if (!q.account_id) {
      return reply.status(400).send({ error: 'account_id es requerido' })
    }

    const year = Number(q.year ?? new Date().getFullYear())
    const mes = Number(q.mes ?? new Date().getMonth() + 1)
    const accountId = q.account_id

    try {
      // Fetch all movements for the period (no pagination for PDF)
      const dataRes = await fastify.inject({
        method: 'GET',
        url: `/api/v1/contabilidad/libro-mayor?account_id=${accountId}&mes=${mes}&year=${year}&limit=9999`,
        headers: { authorization: req.headers.authorization },
      })
      const data = JSON.parse(dataRes.body)

      const movimientos = (data.movimientos ?? []).map((m: any) => ({
        date: m.fecha ?? m.date ?? '',
        move_name: m.documento ?? m.move_name ?? '',
        partner: m.partner ?? '',
        debit: m.debe ?? m.debit ?? 0,
        credit: m.haber ?? m.credit ?? 0,
        name: m.descripcion ?? m.name ?? '',
      }))

      const pdf = await generateLibroMayorPDF({
        company_name: user.company_name ?? '',
        company_rut: user.company_rut ?? '',
        periodo: { year, mes },
        cuenta: {
          code: data.cuenta?.codigo ?? data.cuenta?.code ?? '',
          name: data.cuenta?.nombre ?? data.cuenta?.name ?? '',
        },
        movimientos,
        saldo_inicial: data.saldo_inicial ?? 0,
        saldo_final: data.saldo_final ?? 0,
      })

      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', `inline; filename="Libro_Mayor_${accountId}_${year}_${mes}.pdf"`)
      return reply.send(pdf)
    } catch (err) {
      logger.error({ err }, 'Error generating libro mayor PDF')
      return reply.status(500).send({ error: 'Error generando PDF de libro mayor' })
    }
  })

  // ── POST /conciliacion/import-file ────────────────────────
  fastify.post('/conciliacion/import-file', async (req, reply) => {
    const body = req.body as { content: string; format: 'ofx' | 'csv'; bank?: string; journal_id: number }

    if (!body.content || !body.format || !body.journal_id) {
      return reply.status(400).send({ error: 'content, format, and journal_id are required' })
    }

    const result = parseStatement(body.content, body.format, body.bank)

    // Create statement lines in Odoo
    const user = (req as any).user
    let created = 0
    for (const line of result.lines) {
      try {
        await odooAccountingAdapter.create('account.bank.statement.line', {
          journal_id: body.journal_id,
          date: line.date,
          payment_ref: line.description,
          amount: line.amount,
          company_id: user.company_id,
        })
        created++
      } catch (err) {
        logger.warn({ err, line }, 'Failed to create statement line')
        result.errors.push(`Failed to create line: ${line.date} ${line.description} ${line.amount}`)
      }
    }

    return reply.send({
      parsed: result.lines.length,
      created,
      errors: result.errors,
      bank: result.bank,
      format: result.format,
    })
  })

  // ── POST /conciliacion/auto-match ─────────────────────────
  fastify.post('/conciliacion/auto-match', async (req, reply) => {
    const user = (req as any).user
    const body = req.body as { journal_id: number; mes?: number; year?: number }

    if (!body.journal_id) {
      return reply.status(400).send({ error: 'journal_id is required' })
    }

    const now = new Date()
    const year = body.year ?? now.getFullYear()
    const mes = body.mes ?? now.getMonth() + 1

    // Fetch reconciliation data using the same logic as GET /conciliacion
    const monthStr = String(mes).padStart(2, '0')
    const lastDay = new Date(year, mes, 0).getDate()
    const desde = `${year}-${monthStr}-01`
    const hasta = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`

    try {
      const [extractoRaw, sinConciliarRaw] = await Promise.all([
        odooAccountingAdapter.searchRead(
          'account.bank.statement.line',
          [
            ['journal_id', '=', body.journal_id],
            ['date', '>=', desde],
            ['date', '<=', hasta],
            ['company_id', '=', user.company_id],
          ],
          ['date', 'payment_ref', 'amount', 'is_reconciled', 'partner_id'],
          { order: 'date desc' },
        ),
        odooAccountingAdapter.searchRead(
          'account.move.line',
          [
            ['account_id.reconcile', '=', true],
            ['reconciled', '=', false],
            ['journal_id', '=', body.journal_id],
            ['company_id', '=', user.company_id],
          ],
          ['date', 'move_id', 'name', 'debit', 'credit', 'partner_id'],
          { order: 'date desc' },
        ),
      ])

      const extracto = (extractoRaw as any[]).map((l: any) => ({
        id: l.id,
        fecha: l.date ?? '',
        referencia: l.payment_ref ?? '',
        monto: l.amount ?? 0,
        conciliado: l.is_reconciled ?? false,
        partner: l.partner_id ? (Array.isArray(l.partner_id) ? l.partner_id[1] : l.partner_id) : null,
      }))

      const sinConciliar = (sinConciliarRaw as any[]).map((l: any) => ({
        id: l.id,
        fecha: l.date ?? '',
        documento: l.move_id ? (Array.isArray(l.move_id) ? l.move_id[1] : l.move_id) : '',
        descripcion: l.name ?? '',
        monto: (l.debit ?? 0) - (l.credit ?? 0),
        partner: l.partner_id ? (Array.isArray(l.partner_id) ? l.partner_id[1] : l.partner_id) : null,
      }))

      const suggestions = findMatches(extracto, sinConciliar)

      return reply.send({
        suggestions,
        total_matches: suggestions.length,
        avg_confidence: suggestions.length > 0
          ? Math.round(suggestions.reduce((s, m) => s + m.confidence, 0) / suggestions.length)
          : 0,
      })
    } catch (err) {
      logger.error({ err }, 'Error in auto-match')
      return reply.status(500).send({ error: 'Error buscando coincidencias' })
    }
  })

  // ── POST /conciliacion/apply-matches ──────────────────────
  fastify.post('/conciliacion/apply-matches', async (req, reply) => {
    const body = req.body as { matches: Array<{ statement_line_id: number; move_line_id: number }> }

    if (!body.matches?.length) {
      return reply.status(400).send({ error: 'matches array required' })
    }

    let reconciled = 0
    const errors: string[] = []

    for (const match of body.matches) {
      try {
        // Use Odoo's reconciliation method on the statement line
        await odooAccountingAdapter.callMethod(
          'account.bank.statement.line',
          'action_auto_reconcile',
          [match.statement_line_id],
        )
        reconciled++
      } catch (err) {
        logger.warn({ err, match }, 'Failed to reconcile match')
        errors.push(`Failed to reconcile statement ${match.statement_line_id} with move ${match.move_line_id}`)
      }
    }

    return reply.send({ reconciled, total: body.matches.length, errors })
  })

  // ══════════════════════════════════════════════════════════
  // Centros de Costo (Analytic Accounts)
  // ══════════════════════════════════════════════════════════

  // ── GET /centros-costo ────────────────────────────────────
  fastify.get('/centros-costo', async (req, reply) => {
    const user = (req as any).user
    try {
      const centros = await odooAccountingAdapter.searchRead(
        'account.analytic.account',
        [['company_id', 'in', [user.company_id, false]]],
        ['name', 'code', 'company_id', 'active', 'balance'],
        { order: 'code asc, name asc' },
      )
      return reply.send({
        source: 'odoo',
        centros: (centros as any[]).map((c: any) => ({
          id: c.id,
          name: c.name ?? '',
          code: c.code ?? '',
          balance: c.balance ?? 0,
          active: c.active ?? true,
        })),
        total: (centros as any[]).length,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching centros de costo')
      return reply.send({ source: 'error', centros: [], total: 0 })
    }
  })

  // ── POST /centros-costo ───────────────────────────────────
  fastify.post('/centros-costo', async (req, reply) => {
    const user = (req as any).user
    const body = req.body as { name: string; code?: string }
    if (!body.name) return reply.status(400).send({ error: 'name is required' })

    try {
      const id = await odooAccountingAdapter.create('account.analytic.account', {
        name: body.name,
        code: body.code ?? '',
        company_id: user.company_id,
      })
      return reply.status(201).send({ id })
    } catch (err) {
      logger.error({ err }, 'Error creating centro de costo')
      return reply.status(502).send({ error: 'Error creating analytic account' })
    }
  })

  // ── PUT /centros-costo/:id ────────────────────────────────
  fastify.put('/centros-costo/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as { name?: string; code?: string; active?: boolean }

    try {
      await odooAccountingAdapter.write('account.analytic.account', [Number(id)], body)
      return reply.send({ success: true })
    } catch (err) {
      logger.error({ err }, 'Error updating centro de costo')
      return reply.status(502).send({ error: 'Error updating analytic account' })
    }
  })

  // ── GET /centros-costo/:id/movimientos ────────────────────
  fastify.get('/centros-costo/:id/movimientos', async (req, reply) => {
    const user = (req as any).user
    const { id } = req.params as { id: string }
    const q = req.query as { mes?: string; year?: string }
    const now = new Date()
    const year = Number(q.year ?? now.getFullYear())
    const mes = Number(q.mes ?? now.getMonth() + 1)

    const monthStr = String(mes).padStart(2, '0')
    const lastDay = new Date(year, mes, 0).getDate()
    const desde = `${year}-${monthStr}-01`
    const hasta = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`

    try {
      const lines = await odooAccountingAdapter.searchRead(
        'account.analytic.line',
        [
          ['account_id', '=', Number(id)],
          ['company_id', '=', user.company_id],
          ['date', '>=', desde],
          ['date', '<=', hasta],
        ],
        ['date', 'name', 'amount', 'general_account_id', 'move_line_id', 'partner_id'],
        { order: 'date desc' },
      )

      const movimientos = (lines as any[]).map((l: any) => ({
        id: l.id,
        date: l.date ?? '',
        name: l.name ?? '',
        amount: l.amount ?? 0,
        account: Array.isArray(l.general_account_id) ? l.general_account_id[1] : '',
        partner: Array.isArray(l.partner_id) ? l.partner_id[1] : '',
      }))

      const total = movimientos.reduce((s: number, m: any) => s + m.amount, 0)

      return reply.send({
        source: 'odoo',
        periodo: { year, mes },
        movimientos,
        total,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching analytic lines')
      return reply.send({ source: 'error', movimientos: [], total: 0 })
    }
  })

  // ── GET /centros-costo/reporte ────────────────────────────
  fastify.get('/centros-costo/reporte', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as { year?: string; mes?: string }
    const now = new Date()
    const year = Number(q.year ?? now.getFullYear())
    const mes = Number(q.mes ?? now.getMonth() + 1)

    const monthStr = String(mes).padStart(2, '0')
    const lastDay = new Date(year, mes, 0).getDate()
    const desde = `${year}-${monthStr}-01`
    const hasta = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`

    try {
      const groups = await odooAccountingAdapter.readGroup(
        'account.analytic.line',
        [
          ['company_id', '=', user.company_id],
          ['date', '>=', desde],
          ['date', '<=', hasta],
        ],
        ['amount:sum'],
        ['account_id'],
      )

      const reporte = (groups as any[]).map((g: any) => ({
        centro_id: Array.isArray(g.account_id) ? g.account_id[0] : g.account_id,
        centro_name: Array.isArray(g.account_id) ? g.account_id[1] : '',
        total: g.amount ?? 0,
        count: g.account_id_count ?? 0,
      }))

      const gran_total = reporte.reduce((s: number, r: any) => s + r.total, 0)

      return reply.send({
        source: 'odoo',
        periodo: { year, mes },
        reporte,
        gran_total,
      })
    } catch (err) {
      logger.error({ err }, 'Error generating cost center report')
      return reply.send({ source: 'error', reporte: [], gran_total: 0 })
    }
  })

  // ══════════════════════════════════════════════════════════
  // Flujo de Caja (Cash Flow)
  // ══════════════════════════════════════════════════════════

  // ── GET /flujo-caja ───────────────────────────────────────
  fastify.get('/flujo-caja', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as { months?: string }
    const monthsAhead = Number(q.months ?? 6)
    const now = new Date()

    try {
      // 1. Get current bank balance from bank journals
      const bankJournals = await odooAccountingAdapter.searchRead(
        'account.journal',
        [['type', '=', 'bank'], ['company_id', '=', user.company_id]],
        ['id'],
        {},
      )

      let saldo_actual = 0
      if ((bankJournals as any[]).length > 0) {
        const journalIds = (bankJournals as any[]).map((j: any) => j.id)
        // Sum all bank statement lines
        const bankGroups = await odooAccountingAdapter.readGroup(
          'account.bank.statement.line',
          [['journal_id', 'in', journalIds], ['company_id', '=', user.company_id]],
          ['amount:sum'],
          [],
        )
        saldo_actual = (bankGroups as any[])[0]?.amount ?? 0
      }

      // 2. Get accounts receivable and payable totals
      const [receivableGroups, payableGroups] = await Promise.all([
        odooAccountingAdapter.readGroup(
          'account.move.line',
          [
            ['company_id', '=', user.company_id],
            ['account_id.account_type', '=', 'asset_receivable'],
            ['reconciled', '=', false],
            ['parent_state', '=', 'posted'],
          ],
          ['balance:sum'],
          [],
        ),
        odooAccountingAdapter.readGroup(
          'account.move.line',
          [
            ['company_id', '=', user.company_id],
            ['account_id.account_type', '=', 'liability_payable'],
            ['reconciled', '=', false],
            ['parent_state', '=', 'posted'],
          ],
          ['balance:sum'],
          [],
        ),
      ])

      const por_cobrar = Math.abs((receivableGroups as any[])[0]?.balance ?? 0)
      const por_pagar = Math.abs((payableGroups as any[])[0]?.balance ?? 0)

      // 3. Build historical data (last 6 months)
      const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
      const historico: CashFlowPeriod[] = []

      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const y = d.getFullYear()
        const m = d.getMonth() + 1
        const monthStr = String(m).padStart(2, '0')
        const lastDay = new Date(y, m, 0).getDate()
        const desde = `${y}-${monthStr}-01`
        const hasta = `${y}-${monthStr}-${String(lastDay).padStart(2, '0')}`

        // Get income and expenses for this month
        const groups = await odooAccountingAdapter.readGroup(
          'account.move.line',
          [
            ['company_id', '=', user.company_id],
            ['date', '>=', desde],
            ['date', '<=', hasta],
            ['parent_state', '=', 'posted'],
          ],
          ['balance:sum'],
          ['account_id'],
        )

        // Map account types
        const accountIds = (groups as any[]).map((g: any) => Array.isArray(g.account_id) ? g.account_id[0] : g.account_id)
        const accountsData = accountIds.length > 0
          ? await odooAccountingAdapter.read('account.account', accountIds, ['id', 'account_type'])
          : []

        const typeMap: Record<number, string> = {}
        for (const a of accountsData as any[]) typeMap[a.id] = a.account_type ?? ''

        let ingresos = 0
        let gastos = 0

        for (const g of groups as any[]) {
          const aid = Array.isArray(g.account_id) ? g.account_id[0] : g.account_id
          const tipo = typeMap[aid] ?? ''
          const bal = g.balance ?? 0

          if (tipo.includes('income')) ingresos += Math.abs(bal)
          else if (tipo.includes('expense')) gastos += Math.abs(bal)
        }

        // Get payroll for this month
        let remuneraciones = 0
        try {
          const payrollGroups = await odooAccountingAdapter.readGroup(
            'hr.payslip',
            [
              ['company_id', '=', user.company_id],
              ['state', '=', 'done'],
              ['date_from', '>=', desde],
              ['date_to', '<=', hasta],
            ],
            ['net_wage:sum'],
            [],
          )
          remuneraciones = (payrollGroups as any[])[0]?.net_wage ?? 0
        } catch { /* HR module might not be available */ }

        historico.push({
          month: m,
          year: y,
          label: `${MONTH_NAMES[m - 1]} ${y}`,
          ingresos: Math.round(ingresos),
          gastos_fijos: Math.round(gastos * 0.6),  // Estimate 60% fixed
          gastos_variables: Math.round(gastos * 0.4), // Estimate 40% variable
          remuneraciones: Math.round(remuneraciones),
          impuestos: Math.round(ingresos * 0.19 * 0.3), // Rough IVA estimate
          saldo_proyectado: 0, // Will be computed
        })
      }

      // Compute running balance for historical periods
      let runSaldo = saldo_actual
      for (let i = historico.length - 1; i >= 0; i--) {
        const h = historico[i]
        const totalGastos = h.gastos_fijos + h.gastos_variables + h.remuneraciones + h.impuestos
        historico[i].saldo_proyectado = runSaldo
        runSaldo = runSaldo - h.ingresos + totalGastos // Go backwards
      }

      // 4. Generate forecast
      const proyeccion = generateForecast(historico, saldo_actual, monthsAhead)

      return reply.send({
        source: 'odoo',
        saldo_actual: Math.round(saldo_actual),
        por_cobrar: Math.round(por_cobrar),
        por_pagar: Math.round(por_pagar),
        historico,
        proyeccion,
      })
    } catch (err) {
      logger.error({ err }, 'Error generating cash flow forecast')
      return reply.send({
        source: 'error',
        saldo_actual: 0,
        por_cobrar: 0,
        por_pagar: 0,
        historico: [],
        proyeccion: [],
      })
    }
  })
}
