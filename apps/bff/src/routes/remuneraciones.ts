/**
 * CUENTAX — Remuneraciones Routes (BFF)
 * ======================================
 * Empleados, liquidaciones, nominas, ausencias, contratos y asistencia desde Odoo HR.
 * GET /api/v1/remuneraciones/empleados
 * GET /api/v1/remuneraciones/empleados/:id
 * GET /api/v1/remuneraciones/liquidaciones
 * GET /api/v1/remuneraciones/liquidaciones/:id
 * GET /api/v1/remuneraciones/nominas
 * GET /api/v1/remuneraciones/nominas/:id
 * GET /api/v1/remuneraciones/ausencias
 * GET /api/v1/remuneraciones/ausencias/tipos
 * GET /api/v1/remuneraciones/ausencias/asignaciones
 * GET /api/v1/remuneraciones/departamentos
 * GET /api/v1/remuneraciones/contratos
 * GET /api/v1/remuneraciones/asistencia
 * GET /api/v1/remuneraciones/stats
 */
import type { FastifyInstance } from 'fastify'
import { authGuard } from '@/middlewares/auth-guard'
import { odooHRAdapter } from '@/adapters/odoo-hr.adapter'
import { odooAccountingAdapter } from '@/adapters/odoo-accounting.adapter'
import { logger } from '@/core/logger'

export async function remuneracionesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  // ── GET /empleados ──────────────────────────────────────────
  fastify.get('/empleados', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as {
      search?: string
      department_id?: string
      page?: string
      limit?: string
    }
    const page  = Number(q.page  ?? 1)
    const limit = Number(q.limit ?? 50)
    const departmentId = q.department_id ? Number(q.department_id) : undefined

    try {
      const domain: unknown[][] = [
        ['company_id', '=', user.company_id],
        ['active', '=', true],
      ]
      if (departmentId) domain.push(['department_id', '=', departmentId])
      if (q.search) domain.push('|' as any, ['name', 'ilike', q.search], ['work_email', 'ilike', q.search])

      const [empleados, total] = await Promise.all([
        odooHRAdapter.getEmployees(
          user.company_id,
          q.search,
          departmentId,
          page,
          limit,
        ),
        odooAccountingAdapter.searchCount('hr.employee', domain),
      ])

      return reply.send({
        source: 'odoo',
        empleados,
        total,
        page,
        limit,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching empleados from Odoo')
      return reply.send({
        source: 'error',
        empleados: [],
        total: 0,
        page,
        limit,
      })
    }
  })

  // ── GET /empleados/:id ──────────────────────────────────────
  fastify.get('/empleados/:id', async (req, reply) => {
    const user = (req as any).user
    const { id } = req.params as { id: string }
    const employeeId = Number(id)

    try {
      const empleado = await odooHRAdapter.getEmployee(user.company_id, employeeId)

      if (!empleado) {
        return reply.status(404).send({
          source: 'error',
          error: 'Empleado no encontrado',
        })
      }

      // Fetch contracts for this employee
      const contratos = await odooHRAdapter.getContracts(user.company_id, employeeId)

      return reply.send({
        source: 'odoo',
        empleado,
        contratos,
      })
    } catch (err) {
      logger.error({ err, employeeId }, 'Error fetching empleado detail from Odoo')
      return reply.send({
        source: 'error',
        empleado: null,
        contratos: [],
      })
    }
  })

  // ── GET /liquidaciones ──────────────────────────────────────
  fastify.get('/liquidaciones', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as {
      employee_id?: string
      mes?: string
      year?: string
      page?: string
      limit?: string
    }
    const now   = new Date()
    const year  = Number(q.year  ?? now.getFullYear())
    const mes   = q.mes ? Number(q.mes) : undefined
    const page  = Number(q.page  ?? 1)
    const limit = Number(q.limit ?? 50)
    const employeeId = q.employee_id ? Number(q.employee_id) : undefined

    try {
      const countDomain: unknown[][] = [['company_id', '=', user.company_id]]
      if (employeeId) countDomain.push(['employee_id', '=', employeeId])
      if (mes && year) {
        const monthStr = String(mes).padStart(2, '0')
        const lastDay = new Date(year, mes, 0).getDate()
        countDomain.push(['date_from', '>=', `${year}-${monthStr}-01`])
        countDomain.push(['date_to', '<=', `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`])
      } else if (year) {
        countDomain.push(['date_from', '>=', `${year}-01-01`], ['date_to', '<=', `${year}-12-31`])
      }

      const [liquidaciones, total] = await Promise.all([
        odooHRAdapter.getPayslips(user.company_id, employeeId, mes, year, page, limit),
        odooAccountingAdapter.searchCount('hr.payslip', countDomain),
      ])

      return reply.send({
        source: 'odoo',
        periodo: { year, mes },
        liquidaciones,
        total,
        page,
        limit,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching liquidaciones from Odoo')
      return reply.send({
        source: 'error',
        periodo: { year, mes },
        liquidaciones: [],
        total: 0,
        page,
        limit,
      })
    }
  })

  // ── GET /liquidaciones/:id ──────────────────────────────────
  fastify.get('/liquidaciones/:id', async (req, reply) => {
    const user = (req as any).user
    const { id } = req.params as { id: string }
    const payslipId = Number(id)

    try {
      // Fetch the payslip header by ID directly (avoid fetching all payslips)
      const results = await odooAccountingAdapter.searchRead(
        'hr.payslip',
        [['id', '=', payslipId], ['company_id', '=', user.company_id]],
        [
          'number', 'name', 'employee_id', 'date_from', 'date_to',
          'company_id', 'state', 'struct_id', 'net_wage', 'basic_wage',
          'gross_wage', 'line_ids',
        ],
        { limit: 1 },
      )
      const liquidacion = results[0] ?? null

      if (!liquidacion) {
        return reply.status(404).send({
          source: 'error',
          error: 'Liquidacion no encontrada',
        })
      }

      // Fetch payslip lines (detail)
      const lineas = await odooHRAdapter.getPayslipLines(payslipId)

      return reply.send({
        source: 'odoo',
        liquidacion,
        lineas,
      })
    } catch (err) {
      logger.error({ err, payslipId }, 'Error fetching liquidacion detail from Odoo')
      return reply.send({
        source: 'error',
        liquidacion: null,
        lineas: [],
      })
    }
  })

  // ── GET /nominas ────────────────────────────────────────────
  fastify.get('/nominas', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as {
      mes?: string
      year?: string
      page?: string
      limit?: string
    }
    const now   = new Date()
    const year  = Number(q.year  ?? now.getFullYear())
    const mes   = q.mes ? Number(q.mes) : undefined
    const page  = Number(q.page  ?? 1)
    const limit = Number(q.limit ?? 50)

    try {
      const countDomain: unknown[][] = [['company_id', '=', user.company_id]]
      if (mes && year) {
        const monthStr = String(mes).padStart(2, '0')
        const lastDay = new Date(year, mes, 0).getDate()
        countDomain.push(['date_start', '>=', `${year}-${monthStr}-01`])
        countDomain.push(['date_end', '<=', `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`])
      } else if (year) {
        countDomain.push(['date_start', '>=', `${year}-01-01`], ['date_end', '<=', `${year}-12-31`])
      }

      const [nominas, total] = await Promise.all([
        odooHRAdapter.getPayslipRuns(user.company_id, mes, year, page, limit),
        odooAccountingAdapter.searchCount('hr.payslip.run', countDomain),
      ])

      return reply.send({
        source: 'odoo',
        periodo: { year, mes },
        nominas,
        total,
        page,
        limit,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching nominas from Odoo')
      return reply.send({
        source: 'error',
        periodo: { year, mes },
        nominas: [],
        total: 0,
        page,
        limit,
      })
    }
  })

  // ── GET /nominas/:id ────────────────────────────────────────
  fastify.get('/nominas/:id', async (req, reply) => {
    const user = (req as any).user
    const { id } = req.params as { id: string }
    const runId = Number(id)

    try {
      // Fetch the payslip run header by ID directly (avoid fetching all runs)
      const runResults = await odooAccountingAdapter.searchRead(
        'hr.payslip.run',
        [['id', '=', runId], ['company_id', '=', user.company_id]],
        ['name', 'date_start', 'date_end', 'state', 'slip_ids', 'company_id'],
        { limit: 1 },
      )
      const nomina = (runResults[0] as any) ?? null

      if (!nomina) {
        return reply.status(404).send({
          source: 'error',
          error: 'Nomina no encontrada',
        })
      }

      // Fetch payslips belonging to this run by ID filter (avoid fetching all)
      const slipIds = Array.isArray(nomina.slip_ids) ? nomina.slip_ids : []
      let liquidaciones: unknown[] = []

      if (slipIds.length > 0) {
        liquidaciones = await odooAccountingAdapter.searchRead(
          'hr.payslip',
          [['id', 'in', slipIds], ['company_id', '=', user.company_id]],
          [
            'number', 'name', 'employee_id', 'date_from', 'date_to',
            'company_id', 'state', 'struct_id', 'net_wage', 'basic_wage',
            'gross_wage', 'line_ids',
          ],
          { order: 'date_from desc' },
        )
      }

      return reply.send({
        source: 'odoo',
        nomina,
        liquidaciones,
      })
    } catch (err) {
      logger.error({ err, runId }, 'Error fetching nomina detail from Odoo')
      return reply.send({
        source: 'error',
        nomina: null,
        liquidaciones: [],
      })
    }
  })

  // ── GET /ausencias ──────────────────────────────────────────
  fastify.get('/ausencias', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as {
      employee_id?: string
      state?: string
      mes?: string
      year?: string
      page?: string
      limit?: string
    }
    const now   = new Date()
    const year  = Number(q.year  ?? now.getFullYear())
    const mes   = q.mes ? Number(q.mes) : undefined
    const page  = Number(q.page  ?? 1)
    const limit = Number(q.limit ?? 50)
    const employeeId = q.employee_id ? Number(q.employee_id) : undefined

    try {
      const countDomain: unknown[][] = [['employee_company_id', '=', user.company_id]]
      if (employeeId) countDomain.push(['employee_id', '=', employeeId])
      if (q.state) countDomain.push(['state', '=', q.state])
      if (mes && year) {
        const monthStr = String(mes).padStart(2, '0')
        const lastDay = new Date(year, mes, 0).getDate()
        countDomain.push(['date_from', '>=', `${year}-${monthStr}-01`])
        countDomain.push(['date_to', '<=', `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`])
      } else if (year) {
        countDomain.push(['date_from', '>=', `${year}-01-01`], ['date_to', '<=', `${year}-12-31`])
      }

      const [ausencias, total] = await Promise.all([
        odooHRAdapter.getLeaves(user.company_id, employeeId, q.state, mes, year, page, limit),
        odooAccountingAdapter.searchCount('hr.leave', countDomain),
      ])

      return reply.send({
        source: 'odoo',
        periodo: { year, mes },
        ausencias,
        total,
        page,
        limit,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching ausencias from Odoo')
      return reply.send({
        source: 'error',
        periodo: { year, mes },
        ausencias: [],
        total: 0,
        page,
        limit,
      })
    }
  })

  // ── GET /ausencias/tipos ────────────────────────────────────
  fastify.get('/ausencias/tipos', async (req, reply) => {
    const user = (req as any).user

    try {
      const tipos = await odooHRAdapter.getLeaveTypes(user.company_id)

      return reply.send({
        source: 'odoo',
        tipos,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching leave types from Odoo')
      return reply.send({
        source: 'error',
        tipos: [],
      })
    }
  })

  // ── GET /ausencias/asignaciones ─────────────────────────────
  fastify.get('/ausencias/asignaciones', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as { employee_id?: string }
    const employeeId = q.employee_id ? Number(q.employee_id) : undefined

    try {
      const asignaciones = await odooHRAdapter.getLeaveAllocations(
        user.company_id,
        employeeId,
      )

      return reply.send({
        source: 'odoo',
        asignaciones,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching leave allocations from Odoo')
      return reply.send({
        source: 'error',
        asignaciones: [],
      })
    }
  })

  // ── GET /departamentos ──────────────────────────────────────
  fastify.get('/departamentos', async (req, reply) => {
    const user = (req as any).user

    try {
      const [departamentos, total] = await Promise.all([
        odooHRAdapter.getDepartments(user.company_id),
        odooAccountingAdapter.searchCount('hr.department', [['company_id', 'in', [user.company_id, false]]]),
      ])

      return reply.send({
        source: 'odoo',
        departamentos,
        total,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching departamentos from Odoo')
      return reply.send({
        source: 'error',
        departamentos: [],
        total: 0,
      })
    }
  })

  // ── GET /contratos ──────────────────────────────────────────
  fastify.get('/contratos', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as {
      employee_id?: string
      state?: string
    }
    const employeeId = q.employee_id ? Number(q.employee_id) : undefined

    try {
      const countDomain: unknown[][] = [['company_id', '=', user.company_id]]
      if (employeeId) countDomain.push(['employee_id', '=', employeeId])
      if (q.state) countDomain.push(['state', '=', q.state])

      const [contratos, total] = await Promise.all([
        odooHRAdapter.getContracts(user.company_id, employeeId, q.state),
        odooAccountingAdapter.searchCount('hr.contract', countDomain),
      ])

      return reply.send({
        source: 'odoo',
        contratos,
        total,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching contratos from Odoo')
      return reply.send({
        source: 'error',
        contratos: [],
        total: 0,
      })
    }
  })

  // ── GET /asistencia ─────────────────────────────────────────
  fastify.get('/asistencia', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as {
      employee_id?: string
      mes?: string
      year?: string
      page?: string
      limit?: string
    }
    const now   = new Date()
    const year  = Number(q.year  ?? now.getFullYear())
    const mes   = q.mes ? Number(q.mes) : undefined
    const page  = Number(q.page  ?? 1)
    const limit = Number(q.limit ?? 50)
    const employeeId = q.employee_id ? Number(q.employee_id) : undefined

    try {
      const countDomain: unknown[][] = [['employee_id.company_id', '=', user.company_id]]
      if (employeeId) countDomain.push(['employee_id', '=', employeeId])
      if (mes && year) {
        const monthStr = String(mes).padStart(2, '0')
        const lastDay = new Date(year, mes, 0).getDate()
        const hasta = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`
        countDomain.push(['check_in', '>=', `${year}-${monthStr}-01`], ['check_in', '<=', `${hasta} 23:59:59`])
      } else if (year) {
        countDomain.push(['check_in', '>=', `${year}-01-01`], ['check_in', '<=', `${year}-12-31 23:59:59`])
      }

      const [asistencia, total] = await Promise.all([
        odooHRAdapter.getAttendance(user.company_id, employeeId, mes, year, page, limit),
        odooAccountingAdapter.searchCount('hr.attendance', countDomain),
      ])

      return reply.send({
        source: 'odoo',
        periodo: { year, mes },
        asistencia,
        total,
        page,
        limit,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching asistencia from Odoo')
      return reply.send({
        source: 'error',
        periodo: { year, mes },
        asistencia: [],
        total: 0,
        page,
        limit,
      })
    }
  })

  // ── GET /stats ──────────────────────────────────────────────
  fastify.get('/stats', async (req, reply) => {
    const user = (req as any).user
    const q = req.query as {
      mes?: string
      year?: string
    }
    const now  = new Date()
    const year = Number(q.year ?? now.getFullYear())
    const mes  = Number(q.mes  ?? now.getMonth() + 1)

    try {
      const stats = await odooHRAdapter.getHRStats(user.company_id, year, mes)

      return reply.send({
        source: 'odoo',
        periodo: { year, mes },
        ...stats,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching HR stats from Odoo')
      return reply.send({
        source: 'error',
        periodo: { year, mes },
        total_employees: 0,
        total_departments: 0,
        payroll_total: 0,
        leaves_this_month: 0,
        pending_leaves: 0,
      })
    }
  })
}
