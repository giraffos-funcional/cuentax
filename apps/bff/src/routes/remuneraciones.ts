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
      const empleados = await odooHRAdapter.getEmployees(
        user.company_id,
        q.search,
        departmentId,
        page,
        limit,
      )

      return reply.send({
        source: 'odoo',
        empleados,
        page,
        limit,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching empleados from Odoo')
      return reply.send({
        source: 'error',
        empleados: [],
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
      const liquidaciones = await odooHRAdapter.getPayslips(
        user.company_id,
        employeeId,
        mes,
        year,
        page,
        limit,
      )

      return reply.send({
        source: 'odoo',
        periodo: { year, mes },
        liquidaciones,
        page,
        limit,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching liquidaciones from Odoo')
      return reply.send({
        source: 'error',
        periodo: { year, mes },
        liquidaciones: [],
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
      // Fetch the payslip header
      const payslips = await odooHRAdapter.getPayslips(user.company_id)
      const liquidacion = (payslips as any[]).find((p: any) => p.id === payslipId) ?? null

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
      const nominas = await odooHRAdapter.getPayslipRuns(
        user.company_id,
        mes,
        year,
        page,
        limit,
      )

      return reply.send({
        source: 'odoo',
        periodo: { year, mes },
        nominas,
        page,
        limit,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching nominas from Odoo')
      return reply.send({
        source: 'error',
        periodo: { year, mes },
        nominas: [],
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
      // Fetch the payslip run header
      const runs = await odooHRAdapter.getPayslipRuns(user.company_id)
      const nomina = (runs as any[]).find((r: any) => r.id === runId) ?? null

      if (!nomina) {
        return reply.status(404).send({
          source: 'error',
          error: 'Nomina no encontrada',
        })
      }

      // Fetch all payslips belonging to this run
      const slipIds = Array.isArray(nomina.slip_ids) ? nomina.slip_ids : []
      let liquidaciones: unknown[] = []

      if (slipIds.length > 0) {
        liquidaciones = await odooHRAdapter.getPayslips(user.company_id)
        liquidaciones = (liquidaciones as any[]).filter((l: any) =>
          slipIds.includes(l.id),
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
      const ausencias = await odooHRAdapter.getLeaves(
        user.company_id,
        employeeId,
        q.state,
        mes,
        year,
        page,
        limit,
      )

      return reply.send({
        source: 'odoo',
        periodo: { year, mes },
        ausencias,
        page,
        limit,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching ausencias from Odoo')
      return reply.send({
        source: 'error',
        periodo: { year, mes },
        ausencias: [],
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
      const departamentos = await odooHRAdapter.getDepartments(user.company_id)

      return reply.send({
        source: 'odoo',
        departamentos,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching departamentos from Odoo')
      return reply.send({
        source: 'error',
        departamentos: [],
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
      const contratos = await odooHRAdapter.getContracts(
        user.company_id,
        employeeId,
        q.state,
      )

      return reply.send({
        source: 'odoo',
        contratos,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching contratos from Odoo')
      return reply.send({
        source: 'error',
        contratos: [],
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
      const asistencia = await odooHRAdapter.getAttendance(
        user.company_id,
        employeeId,
        mes,
        year,
        page,
        limit,
      )

      return reply.send({
        source: 'odoo',
        periodo: { year, mes },
        asistencia,
        page,
        limit,
      })
    } catch (err) {
      logger.error({ err }, 'Error fetching asistencia from Odoo')
      return reply.send({
        source: 'error',
        periodo: { year, mes },
        asistencia: [],
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
