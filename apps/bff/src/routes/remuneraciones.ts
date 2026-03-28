/**
 * CUENTAX — Remuneraciones Routes (BFF)
 * ======================================
 * Empleados, liquidaciones, nominas, ausencias, contratos y asistencia desde Odoo HR.
 *
 * READ:
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
 *
 * WRITE:
 * POST   /api/v1/remuneraciones/empleados
 * PUT    /api/v1/remuneraciones/empleados/:id
 * DELETE /api/v1/remuneraciones/empleados/:id
 * POST   /api/v1/remuneraciones/contratos
 * PUT    /api/v1/remuneraciones/contratos/:id
 * POST   /api/v1/remuneraciones/contratos/:id/close
 * POST   /api/v1/remuneraciones/ausencias
 * PUT    /api/v1/remuneraciones/ausencias/:id/approve
 * PUT    /api/v1/remuneraciones/ausencias/:id/refuse
 * DELETE /api/v1/remuneraciones/ausencias/:id
 * POST   /api/v1/remuneraciones/liquidaciones
 * POST   /api/v1/remuneraciones/liquidaciones/:id/compute
 * POST   /api/v1/remuneraciones/liquidaciones/:id/confirm
 * DELETE /api/v1/remuneraciones/liquidaciones/:id
 * POST   /api/v1/remuneraciones/nominas
 * POST   /api/v1/remuneraciones/nominas/:id/generate
 * POST   /api/v1/remuneraciones/nominas/:id/close
 * POST   /api/v1/remuneraciones/asistencia
 * PUT    /api/v1/remuneraciones/asistencia/:id
 * DELETE /api/v1/remuneraciones/asistencia/:id
 * POST   /api/v1/remuneraciones/indicadores
 * PUT    /api/v1/remuneraciones/indicadores/:id
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

  // ═══════════════════════════════════════════════════════════
  // WRITE OPERATIONS
  // ═══════════════════════════════════════════════════════════

  // ── POST /empleados ───────────────────────────────────────
  fastify.post('/empleados', async (req, reply) => {
    const user = (req as any).user
    const body = req.body as Record<string, unknown> | undefined

    if (!body || !body['name']) {
      return reply.status(400).send({
        source: 'error',
        message: 'Campo requerido: name',
      })
    }

    try {
      const result = await odooHRAdapter.createEmployee(user.company_id, body)
      if (!result.success) {
        return reply.status(500).send({
          source: 'error',
          message: 'Error al crear empleado en Odoo',
        })
      }
      return reply.status(201).send({
        source: 'odoo',
        id: result.id,
      })
    } catch (err) {
      logger.error({ err }, 'Error creating empleado')
      return reply.status(500).send({
        source: 'error',
        message: 'Error interno al crear empleado',
      })
    }
  })

  // ── PUT /empleados/:id ────────────────────────────────────
  fastify.put('/empleados/:id', async (req, reply) => {
    const user = (req as any).user
    const { id } = req.params as { id: string }
    const employeeId = Number(id)
    const body = req.body as Record<string, unknown> | undefined

    if (!body || Object.keys(body).length === 0) {
      return reply.status(400).send({
        source: 'error',
        message: 'Body vacío — nada que actualizar',
      })
    }

    try {
      const result = await odooHRAdapter.updateEmployee(user.company_id, employeeId, body)
      if (!result.success) {
        return reply.status(500).send({
          source: 'error',
          message: 'Error al actualizar empleado en Odoo',
        })
      }
      return reply.send({
        source: 'odoo',
        updated: true,
      })
    } catch (err) {
      logger.error({ err, employeeId }, 'Error updating empleado')
      return reply.status(500).send({
        source: 'error',
        message: 'Error interno al actualizar empleado',
      })
    }
  })

  // ── DELETE /empleados/:id ─────────────────────────────────
  fastify.delete('/empleados/:id', async (req, reply) => {
    const user = (req as any).user
    const { id } = req.params as { id: string }
    const employeeId = Number(id)

    try {
      const result = await odooHRAdapter.deactivateEmployee(user.company_id, employeeId)
      if (!result.success) {
        return reply.status(500).send({
          source: 'error',
          message: 'Error al desactivar empleado en Odoo',
        })
      }
      return reply.send({
        source: 'odoo',
        deactivated: true,
      })
    } catch (err) {
      logger.error({ err, employeeId }, 'Error deactivating empleado')
      return reply.status(500).send({
        source: 'error',
        message: 'Error interno al desactivar empleado',
      })
    }
  })

  // ── POST /contratos ───────────────────────────────────────
  fastify.post('/contratos', async (req, reply) => {
    const user = (req as any).user
    const body = req.body as Record<string, unknown> | undefined

    if (!body || !body['employee_id'] || !body['name'] || !body['wage'] || !body['date_start']) {
      return reply.status(400).send({
        source: 'error',
        message: 'Campos requeridos: employee_id, name, wage, date_start',
      })
    }

    try {
      const result = await odooHRAdapter.createContract(user.company_id, body)
      if (!result.success) {
        return reply.status(500).send({
          source: 'error',
          message: 'Error al crear contrato en Odoo',
        })
      }
      return reply.status(201).send({
        source: 'odoo',
        id: result.id,
      })
    } catch (err) {
      logger.error({ err }, 'Error creating contrato')
      return reply.status(500).send({
        source: 'error',
        message: 'Error interno al crear contrato',
      })
    }
  })

  // ── PUT /contratos/:id ────────────────────────────────────
  fastify.put('/contratos/:id', async (req, reply) => {
    const user = (req as any).user
    const { id } = req.params as { id: string }
    const contractId = Number(id)
    const body = req.body as Record<string, unknown> | undefined

    if (!body || Object.keys(body).length === 0) {
      return reply.status(400).send({
        source: 'error',
        message: 'Body vacío — nada que actualizar',
      })
    }

    try {
      const result = await odooHRAdapter.updateContract(user.company_id, contractId, body)
      if (!result.success) {
        return reply.status(500).send({
          source: 'error',
          message: 'Error al actualizar contrato en Odoo',
        })
      }
      return reply.send({
        source: 'odoo',
        updated: true,
      })
    } catch (err) {
      logger.error({ err, contractId }, 'Error updating contrato')
      return reply.status(500).send({
        source: 'error',
        message: 'Error interno al actualizar contrato',
      })
    }
  })

  // ── POST /contratos/:id/close ─────────────────────────────
  fastify.post('/contratos/:id/close', async (req, reply) => {
    const user = (req as any).user
    const { id } = req.params as { id: string }
    const contractId = Number(id)
    const today = new Date().toISOString().split('T')[0]

    try {
      const result = await odooHRAdapter.updateContract(user.company_id, contractId, {
        state: 'close',
        date_end: today,
      })
      if (!result.success) {
        return reply.status(500).send({
          source: 'error',
          message: 'Error al cerrar contrato en Odoo',
        })
      }
      return reply.send({
        source: 'odoo',
        closed: true,
        date_end: today,
      })
    } catch (err) {
      logger.error({ err, contractId }, 'Error closing contrato')
      return reply.status(500).send({
        source: 'error',
        message: 'Error interno al cerrar contrato',
      })
    }
  })

  // ── POST /ausencias ───────────────────────────────────────
  fastify.post('/ausencias', async (req, reply) => {
    const user = (req as any).user
    const body = req.body as Record<string, unknown> | undefined

    if (!body || !body['employee_id'] || !body['holiday_status_id'] || !body['date_from'] || !body['date_to']) {
      return reply.status(400).send({
        source: 'error',
        message: 'Campos requeridos: employee_id, holiday_status_id, date_from, date_to',
      })
    }

    try {
      const result = await odooHRAdapter.createLeave(user.company_id, body)
      if (!result.success) {
        return reply.status(500).send({
          source: 'error',
          message: 'Error al crear ausencia en Odoo',
        })
      }
      return reply.status(201).send({
        source: 'odoo',
        id: result.id,
      })
    } catch (err) {
      logger.error({ err }, 'Error creating ausencia')
      return reply.status(500).send({
        source: 'error',
        message: 'Error interno al crear ausencia',
      })
    }
  })

  // ── PUT /ausencias/:id/approve ────────────────────────────
  fastify.put('/ausencias/:id/approve', async (req, reply) => {
    const { id } = req.params as { id: string }
    const leaveId = Number(id)

    try {
      const result = await odooHRAdapter.approveLeave(leaveId)
      if (!result.success) {
        return reply.status(500).send({
          source: 'error',
          message: 'Error al aprobar ausencia en Odoo',
        })
      }
      return reply.send({
        source: 'odoo',
        approved: true,
      })
    } catch (err) {
      logger.error({ err, leaveId }, 'Error approving ausencia')
      return reply.status(500).send({
        source: 'error',
        message: 'Error interno al aprobar ausencia',
      })
    }
  })

  // ── PUT /ausencias/:id/refuse ─────────────────────────────
  fastify.put('/ausencias/:id/refuse', async (req, reply) => {
    const { id } = req.params as { id: string }
    const leaveId = Number(id)

    try {
      const result = await odooHRAdapter.refuseLeave(leaveId)
      if (!result.success) {
        return reply.status(500).send({
          source: 'error',
          message: 'Error al rechazar ausencia en Odoo',
        })
      }
      return reply.send({
        source: 'odoo',
        refused: true,
      })
    } catch (err) {
      logger.error({ err, leaveId }, 'Error refusing ausencia')
      return reply.status(500).send({
        source: 'error',
        message: 'Error interno al rechazar ausencia',
      })
    }
  })

  // ── DELETE /ausencias/:id ─────────────────────────────────
  fastify.delete('/ausencias/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const leaveId = Number(id)

    try {
      const result = await odooHRAdapter.cancelLeave(leaveId)
      if (!result.success) {
        return reply.status(500).send({
          source: 'error',
          message: 'Error al cancelar ausencia en Odoo',
        })
      }
      return reply.send({
        source: 'odoo',
        cancelled: true,
      })
    } catch (err) {
      logger.error({ err, leaveId }, 'Error cancelling ausencia')
      return reply.status(500).send({
        source: 'error',
        message: 'Error interno al cancelar ausencia',
      })
    }
  })

  // ── POST /liquidaciones ───────────────────────────────────
  fastify.post('/liquidaciones', async (req, reply) => {
    const user = (req as any).user
    const body = req.body as Record<string, unknown> | undefined

    if (!body || !body['employee_id'] || !body['date_from'] || !body['date_to']) {
      return reply.status(400).send({
        source: 'error',
        message: 'Campos requeridos: employee_id, date_from, date_to',
      })
    }

    try {
      const result = await odooHRAdapter.createPayslip(user.company_id, body)
      if (!result.success) {
        return reply.status(500).send({
          source: 'error',
          message: 'Error al crear liquidación en Odoo',
        })
      }
      return reply.status(201).send({
        source: 'odoo',
        id: result.id,
      })
    } catch (err) {
      logger.error({ err }, 'Error creating liquidación')
      return reply.status(500).send({
        source: 'error',
        message: 'Error interno al crear liquidación',
      })
    }
  })

  // ── POST /liquidaciones/:id/compute ───────────────────────
  fastify.post('/liquidaciones/:id/compute', async (req, reply) => {
    const { id } = req.params as { id: string }
    const payslipId = Number(id)

    try {
      const result = await odooHRAdapter.computePayslip(payslipId)
      if (!result.success) {
        return reply.status(500).send({
          source: 'error',
          message: 'Error al calcular liquidación en Odoo',
        })
      }
      return reply.send({
        source: 'odoo',
        computed: true,
      })
    } catch (err) {
      logger.error({ err, payslipId }, 'Error computing liquidación')
      return reply.status(500).send({
        source: 'error',
        message: 'Error interno al calcular liquidación',
      })
    }
  })

  // ── POST /liquidaciones/:id/confirm ───────────────────────
  fastify.post('/liquidaciones/:id/confirm', async (req, reply) => {
    const { id } = req.params as { id: string }
    const payslipId = Number(id)

    try {
      const result = await odooHRAdapter.confirmPayslip(payslipId)
      if (!result.success) {
        return reply.status(500).send({
          source: 'error',
          message: 'Error al confirmar liquidación en Odoo',
        })
      }
      return reply.send({
        source: 'odoo',
        confirmed: true,
      })
    } catch (err) {
      logger.error({ err, payslipId }, 'Error confirming liquidación')
      return reply.status(500).send({
        source: 'error',
        message: 'Error interno al confirmar liquidación',
      })
    }
  })

  // ── DELETE /liquidaciones/:id ─────────────────────────────
  fastify.delete('/liquidaciones/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const payslipId = Number(id)

    try {
      const result = await odooHRAdapter.cancelPayslip(payslipId)
      if (!result.success) {
        return reply.status(500).send({
          source: 'error',
          message: 'Error al cancelar liquidación en Odoo',
        })
      }
      return reply.send({
        source: 'odoo',
        cancelled: true,
      })
    } catch (err) {
      logger.error({ err, payslipId }, 'Error cancelling liquidación')
      return reply.status(500).send({
        source: 'error',
        message: 'Error interno al cancelar liquidación',
      })
    }
  })

  // ── POST /nominas ─────────────────────────────────────────
  fastify.post('/nominas', async (req, reply) => {
    const user = (req as any).user
    const body = req.body as Record<string, unknown> | undefined

    if (!body || !body['name'] || !body['date_start'] || !body['date_end']) {
      return reply.status(400).send({
        source: 'error',
        message: 'Campos requeridos: name, date_start, date_end',
      })
    }

    try {
      const result = await odooHRAdapter.createPayslipRun(user.company_id, body)
      if (!result.success) {
        return reply.status(500).send({
          source: 'error',
          message: 'Error al crear nómina en Odoo',
        })
      }
      return reply.status(201).send({
        source: 'odoo',
        id: result.id,
      })
    } catch (err) {
      logger.error({ err }, 'Error creating nómina')
      return reply.status(500).send({
        source: 'error',
        message: 'Error interno al crear nómina',
      })
    }
  })

  // ── POST /nominas/:id/generate ────────────────────────────
  fastify.post('/nominas/:id/generate', async (req, reply) => {
    const user = (req as any).user
    const { id } = req.params as { id: string }
    const runId = Number(id)

    try {
      const result = await odooHRAdapter.generatePayslips(runId, user.company_id)
      if (!result.success) {
        return reply.status(500).send({
          source: 'error',
          message: 'Error al generar liquidaciones para nómina',
        })
      }
      return reply.send({
        source: 'odoo',
        generated: true,
        count: result.count,
      })
    } catch (err) {
      logger.error({ err, runId }, 'Error generating payslips for nómina')
      return reply.status(500).send({
        source: 'error',
        message: 'Error interno al generar liquidaciones',
      })
    }
  })

  // ── POST /nominas/:id/close ───────────────────────────────
  fastify.post('/nominas/:id/close', async (req, reply) => {
    const { id } = req.params as { id: string }
    const runId = Number(id)

    try {
      const result = await odooHRAdapter.closePayslipRun(runId)
      if (!result.success) {
        return reply.status(500).send({
          source: 'error',
          message: 'Error al cerrar nómina en Odoo',
        })
      }
      return reply.send({
        source: 'odoo',
        closed: true,
      })
    } catch (err) {
      logger.error({ err, runId }, 'Error closing nómina')
      return reply.status(500).send({
        source: 'error',
        message: 'Error interno al cerrar nómina',
      })
    }
  })

  // ── POST /asistencia ──────────────────────────────────────
  fastify.post('/asistencia', async (req, reply) => {
    const user = (req as any).user
    const body = req.body as Record<string, unknown> | undefined

    if (!body || !body['employee_id'] || !body['check_in']) {
      return reply.status(400).send({
        source: 'error',
        message: 'Campos requeridos: employee_id, check_in',
      })
    }

    try {
      const result = await odooHRAdapter.createAttendance(user.company_id, body)
      if (!result.success) {
        return reply.status(500).send({
          source: 'error',
          message: 'Error al crear registro de asistencia en Odoo',
        })
      }
      return reply.status(201).send({
        source: 'odoo',
        id: result.id,
      })
    } catch (err) {
      logger.error({ err }, 'Error creating asistencia')
      return reply.status(500).send({
        source: 'error',
        message: 'Error interno al crear asistencia',
      })
    }
  })

  // ── PUT /asistencia/:id ───────────────────────────────────
  fastify.put('/asistencia/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const attendanceId = Number(id)
    const body = req.body as Record<string, unknown> | undefined

    if (!body || Object.keys(body).length === 0) {
      return reply.status(400).send({
        source: 'error',
        message: 'Body vacío — nada que actualizar',
      })
    }

    try {
      const result = await odooHRAdapter.updateAttendance(attendanceId, body)
      if (!result.success) {
        return reply.status(500).send({
          source: 'error',
          message: 'Error al actualizar asistencia en Odoo',
        })
      }
      return reply.send({
        source: 'odoo',
        updated: true,
      })
    } catch (err) {
      logger.error({ err, attendanceId }, 'Error updating asistencia')
      return reply.status(500).send({
        source: 'error',
        message: 'Error interno al actualizar asistencia',
      })
    }
  })

  // ── DELETE /asistencia/:id ────────────────────────────────
  fastify.delete('/asistencia/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const attendanceId = Number(id)

    try {
      const result = await odooHRAdapter.deleteAttendance(attendanceId)
      if (!result.success) {
        return reply.status(500).send({
          source: 'error',
          message: 'Error al eliminar asistencia en Odoo',
        })
      }
      return reply.send({
        source: 'odoo',
        deleted: true,
      })
    } catch (err) {
      logger.error({ err, attendanceId }, 'Error deleting asistencia')
      return reply.status(500).send({
        source: 'error',
        message: 'Error interno al eliminar asistencia',
      })
    }
  })

  // ── POST /indicadores ─────────────────────────────────────
  fastify.post('/indicadores', async (req, reply) => {
    const user = (req as any).user
    const body = req.body as Record<string, unknown> | undefined

    if (!body || Object.keys(body).length === 0) {
      return reply.status(400).send({
        source: 'error',
        message: 'Body vacío — nada que crear',
      })
    }

    try {
      const result = await odooHRAdapter.createIndicators(user.company_id, body)
      if (!result.success) {
        return reply.status(500).send({
          source: 'error',
          message: 'Error al crear indicadores en Odoo',
        })
      }
      return reply.status(201).send({
        source: 'odoo',
        id: result.id,
      })
    } catch (err) {
      logger.error({ err }, 'Error creating indicadores')
      return reply.status(500).send({
        source: 'error',
        message: 'Error interno al crear indicadores',
      })
    }
  })

  // ── PUT /indicadores/:id ──────────────────────────────────
  fastify.put('/indicadores/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const indicatorId = Number(id)
    const body = req.body as Record<string, unknown> | undefined

    if (!body || Object.keys(body).length === 0) {
      return reply.status(400).send({
        source: 'error',
        message: 'Body vacío — nada que actualizar',
      })
    }

    try {
      const result = await odooHRAdapter.updateIndicators(indicatorId, body)
      if (!result.success) {
        return reply.status(500).send({
          source: 'error',
          message: 'Error al actualizar indicadores en Odoo',
        })
      }
      return reply.send({
        source: 'odoo',
        updated: true,
      })
    } catch (err) {
      logger.error({ err, indicatorId }, 'Error updating indicadores')
      return reply.status(500).send({
        source: 'error',
        message: 'Error interno al actualizar indicadores',
      })
    }
  })
}
