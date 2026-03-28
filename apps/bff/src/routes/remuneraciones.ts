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
 * GET /api/v1/remuneraciones/liquidaciones/:id/pdf
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
 * GET    /api/v1/remuneraciones/contratos/:id/pdf
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
 * GET    /api/v1/remuneraciones/empresa
 * PUT    /api/v1/remuneraciones/empresa
 */
import type { FastifyInstance } from 'fastify'
import { authGuard } from '@/middlewares/auth-guard'
import { odooHRAdapter } from '@/adapters/odoo-hr.adapter'
import { odooAccountingAdapter } from '@/adapters/odoo-accounting.adapter'
import { logger } from '@/core/logger'
import { generatePayslipPDF } from '@/services/payslip-pdf.service'
import type { PayslipPDFData, PayslipPDFLine } from '@/services/payslip-pdf.service'
import { generateContractPDF } from '@/services/contract-pdf.service'
import type { ContractPDFData } from '@/services/contract-pdf.service'

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

      const [rawEmpleados, total] = await Promise.all([
        odooHRAdapter.getEmployees(
          user.company_id,
          q.search,
          departmentId,
          page,
          limit,
        ),
        odooAccountingAdapter.searchCount('hr.employee', domain),
      ])

      // Flatten Many2one fields for frontend consumption
      const empleados = (rawEmpleados as any[]).map((e: any) => ({
        ...e,
        department_name: Array.isArray(e.department_id) ? e.department_id[1] : '',
        afp_name: Array.isArray(e.l10n_cl_afp_id) ? e.l10n_cl_afp_id[1] : '',
        isapre_name: Array.isArray(e.l10n_cl_isapre_id) ? e.l10n_cl_isapre_id[1] : '',
      }))

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

  // ── GET /liquidaciones/:id/pdf — Download payslip as PDF ──
  fastify.get('/liquidaciones/:id/pdf', async (req, reply) => {
    const user = (req as any).user
    const payslipId = Number((req.params as { id: string }).id)

    const MONTHS_ES = [
      '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ]

    try {
      // 1. Get payslip header
      const payslipResults = await odooAccountingAdapter.searchRead(
        'hr.payslip',
        [['id', '=', payslipId], ['company_id', '=', user.company_id]],
        [
          'number', 'name', 'employee_id', 'date_from', 'date_to',
          'company_id', 'state', 'struct_id', 'net_wage', 'basic_wage',
          'gross_wage', 'line_ids', 'contract_id',
        ],
        { limit: 1 },
      )
      const payslip = payslipResults[0] as Record<string, unknown> | undefined

      if (!payslip) {
        return reply.status(404).send({ error: 'Liquidacion no encontrada' })
      }

      // 2. Get payslip lines
      const rawLines = await odooHRAdapter.getPayslipLines(payslipId) as Array<Record<string, unknown>>

      // 3. Get employee data (including Chilean localization fields)
      const employeeId = Array.isArray(payslip.employee_id)
        ? (payslip.employee_id as [number, string])[0]
        : Number(payslip.employee_id)

      const employeeResults = await odooAccountingAdapter.searchRead(
        'hr.employee',
        [['id', '=', employeeId], ['company_id', '=', user.company_id]],
        [
          'name', 'identification_id', 'job_title', 'department_id',
          'contract_id', 'date_start',
          // Chilean localization fields (l10n_cl_hr)
          'l10n_cl_afp_id', 'l10n_cl_isapre_id', 'l10n_cl_isapre_cotizacion_uf',
        ],
        { limit: 1 },
      )
      const employee = employeeResults[0] as Record<string, unknown> | undefined

      // 4. Get company data (with logo)
      const companyResults = await odooAccountingAdapter.searchRead(
        'res.company',
        [['id', '=', user.company_id]],
        ['name', 'vat', 'street', 'city', 'state_id', 'country_id', 'logo'],
        { limit: 1 },
      )
      const company = companyResults[0] as Record<string, unknown> | undefined

      // 5. Get contract for wage
      const contractId = Array.isArray(payslip.contract_id)
        ? (payslip.contract_id as [number, string])[0]
        : Number(payslip.contract_id ?? 0)

      let wage = Number(payslip.basic_wage ?? 0)
      if (contractId) {
        const contractResults = await odooAccountingAdapter.searchRead(
          'hr.contract',
          [['id', '=', contractId]],
          ['wage'],
          { limit: 1 },
        )
        const contract = contractResults[0] as Record<string, unknown> | undefined
        if (contract?.wage) wage = Number(contract.wage)
      }

      // 6. Get UF value from indicators for the payslip period
      const dateFrom = String(payslip.date_from ?? '')
      const periodDate = dateFrom ? new Date(dateFrom + 'T12:00:00') : new Date()
      const periodMonth = periodDate.getMonth() + 1
      const periodYear = periodDate.getFullYear()

      let ufValue = 0
      try {
        const indicatorResults = await odooAccountingAdapter.searchRead(
          'l10n_cl.indicators',
          [
            ['company_id', '=', user.company_id],
            ['month', '=', periodMonth],
            ['year', '=', periodYear],
          ],
          ['uf'],
          { limit: 1 },
        )
        const indicator = indicatorResults[0] as Record<string, unknown> | undefined
        if (indicator?.uf) ufValue = Number(indicator.uf)
      } catch {
        // UF not found — will show 0
      }

      // 7. Map payslip lines to PDF format
      const lines: PayslipPDFLine[] = rawLines.map((l) => {
        const catId = l.category_id
        const catName = Array.isArray(catId) ? String((catId as [number, string])[1]) : String(catId ?? '')
        // Derive category code from the Odoo category name
        let category = 'ALW'
        const catUpper = catName.toUpperCase()
        if (catUpper.includes('BASIC') || catUpper.includes('BASE')) category = 'BASIC'
        else if (catUpper.includes('NOTIMP') || catUpper.includes('NO IMP')) category = 'ALWNOTIMP'
        else if (catUpper.includes('PREV') || catUpper.includes('AFP') || catUpper.includes('CESANT')) category = 'DEDPREV'
        else if (catUpper.includes('SALUD') || catUpper.includes('ISAPRE') || catUpper.includes('FONASA')) category = 'DEDSALUD'
        else if (catUpper.includes('TRIB') || catUpper.includes('IMPUESTO') || catUpper.includes('TAX')) category = 'DEDTRIB'
        else if (catUpper.includes('DED') || catUpper.includes('DESC')) category = 'DED'
        else if (catUpper.includes('GROSS') || catUpper.includes('BRUT')) category = 'GROSS'
        else if (catUpper.includes('NET') || catUpper.includes('LIQ')) category = 'NET'
        else if (catUpper.includes('COMP')) category = 'COMP'

        return {
          code: String(l.code ?? ''),
          name: String(l.name ?? ''),
          category,
          total: Number(l.total ?? l.amount ?? 0),
        }
      })

      // 8. Calculate totals from lines
      const imponibleCats = new Set(['BASIC', 'ALW', 'GROSS'])
      const noImponibleCats = new Set(['ALWNOTIMP'])
      const descuentoCats = new Set(['DEDPREV', 'DEDSALUD', 'DEDTRIB', 'DED'])
      const excludedCodes = new Set(['GROSS', 'NET', 'COMP'])

      const totalImponible = lines
        .filter((l) => imponibleCats.has(l.category) && !excludedCodes.has(l.code))
        .reduce((sum, l) => sum + l.total, 0)

      const totalNoImponible = lines
        .filter((l) => noImponibleCats.has(l.category))
        .reduce((sum, l) => sum + l.total, 0)

      const totalHaberes = totalImponible + totalNoImponible

      const totalDescuentos = lines
        .filter((l) => descuentoCats.has(l.category))
        .reduce((sum, l) => sum + Math.abs(l.total), 0)

      const totalPagar = Number(payslip.net_wage ?? (totalHaberes - totalDescuentos))

      // Extract employee fields with safe fallbacks
      const employeeName = String(employee?.name ?? 'Sin nombre')
      const employeeRut = String(employee?.identification_id ?? 'Sin RUT')
      const employeeStartDate = String(employee?.date_start ?? '-')
      const employeeJobTitle = String(employee?.job_title ?? '-')
      const employeeDepartment = Array.isArray(employee?.department_id)
        ? String((employee.department_id as [number, string])[1])
        : String(employee?.department_id ?? '-')
      const employeeAfp = Array.isArray(employee?.l10n_cl_afp_id)
        ? String((employee.l10n_cl_afp_id as [number, string])[1])
        : String(employee?.l10n_cl_afp_id ?? '-')
      const employeeIsapre = Array.isArray(employee?.l10n_cl_isapre_id)
        ? String((employee.l10n_cl_isapre_id as [number, string])[1])
        : String(employee?.l10n_cl_isapre_id ?? 'FONASA')
      const employeeIsapreUf = employee?.l10n_cl_isapre_cotizacion_uf ? Number(employee.l10n_cl_isapre_cotizacion_uf) : undefined

      // Build company address
      const companyAddress = [company?.street, company?.city]
        .filter(Boolean)
        .map(String)
        .join(', ') || '-'

      const monthName = MONTHS_ES[periodMonth] ?? String(periodMonth)

      // 9. Build PDF data payload
      const pdfData: PayslipPDFData = {
        company_name: String(company?.name ?? 'Sin empresa'),
        company_rut: String(company?.vat ?? '-'),
        company_address: companyAddress,
        company_logo: company?.logo ? String(company.logo) : undefined,

        employee_name: employeeName,
        employee_rut: employeeRut,
        employee_start_date: employeeStartDate,
        employee_job_title: employeeJobTitle,
        employee_department: employeeDepartment,
        employee_afp: employeeAfp,
        employee_health_plan: employeeIsapre,
        employee_isapre_uf: employeeIsapreUf,

        month: monthName,
        year: periodYear,
        uf_value: ufValue,

        wage,
        lines,

        total_imponible: totalImponible,
        total_no_imponible: totalNoImponible,
        total_haberes: totalHaberes,
        total_descuentos: totalDescuentos,
        total_pagar: totalPagar,
      }

      // 10. Generate and return PDF
      const pdfBuffer = await generatePayslipPDF(pdfData)

      const safeName = employeeName.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '').replace(/\s+/g, '-')
      const filename = `liquidacion-${monthName.toLowerCase()}-${periodYear}-${safeName}.pdf`

      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      return reply.send(pdfBuffer)
    } catch (err) {
      logger.error({ err, payslipId }, 'Error generating payslip PDF')
      return reply.status(500).send({
        source: 'error',
        error: 'Error al generar PDF de liquidacion',
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

      const [rawAusencias, total] = await Promise.all([
        odooHRAdapter.getLeaves(user.company_id, employeeId, q.state, mes, year, page, limit),
        odooAccountingAdapter.searchCount('hr.leave', countDomain),
      ])

      // Flatten Many2one fields for frontend consumption
      const ausencias = (rawAusencias as any[]).map((l: any) => ({
        ...l,
        employee_name: Array.isArray(l.employee_id) ? l.employee_id[1] : '',
        employee_id_num: Array.isArray(l.employee_id) ? l.employee_id[0] : l.employee_id,
        leave_type: Array.isArray(l.holiday_status_id) ? l.holiday_status_id[1] : '',
      }))

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

      const [rawContratos, total] = await Promise.all([
        odooHRAdapter.getContracts(user.company_id, employeeId, q.state),
        odooAccountingAdapter.searchCount('hr.contract', countDomain),
      ])

      // Flatten Many2one fields for frontend consumption
      const contratos = (rawContratos as any[]).map((c: any) => ({
        ...c,
        employee_name: Array.isArray(c.employee_id) ? c.employee_id[1] : '',
        department: Array.isArray(c.department_id) ? c.department_id[1] : '',
        job_title: c.job_title ?? c.job_id?.[1] ?? '',
      }))

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
      // Map frontend field names to Odoo field names
      const odooData: Record<string, unknown> = {
        name: body.name ?? body['nombre'],
        job_title: body.job_title ?? body['cargo'],
        department_id: body.department_id ? Number(body.department_id) : undefined,
        work_email: body.work_email ?? body['email'],
        work_phone: body.work_phone ?? body['telefono'],
        identification_id: body.identification_id ?? body['rut'],
        company_id: user.company_id,
      }
      // Map Chilean fields
      if (body.afp_id || body['afp']) odooData.l10n_cl_afp_id = Number(body.afp_id ?? body['afp'])
      if (body.health_plan || body['plan_salud']) odooData.l10n_cl_health_plan = body.health_plan ?? body['plan_salud']
      if (body.isapre_id || body['isapre']) odooData.l10n_cl_isapre_id = Number(body.isapre_id ?? body['isapre'])
      if (body.isapre_cotizacion_uf || body['cotizacion_isapre_uf']) odooData.l10n_cl_isapre_cotizacion_uf = Number(body.isapre_cotizacion_uf ?? body['cotizacion_isapre_uf'])
      if (body.cargas_familiares !== undefined) odooData.l10n_cl_cargas_familiares = Number(body.cargas_familiares)

      // Remove undefined values
      for (const key of Object.keys(odooData)) {
        if (odooData[key] === undefined) delete odooData[key]
      }

      const result = await odooHRAdapter.createEmployee(user.company_id, odooData)
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
      // Map frontend field names to Odoo field names
      const odooData: Record<string, unknown> = {}
      if (body.name ?? body['nombre']) odooData.name = body.name ?? body['nombre']
      if (body.job_title ?? body['cargo']) odooData.job_title = body.job_title ?? body['cargo']
      if (body.department_id) odooData.department_id = Number(body.department_id)
      if (body.work_email ?? body['email']) odooData.work_email = body.work_email ?? body['email']
      if (body.work_phone ?? body['telefono']) odooData.work_phone = body.work_phone ?? body['telefono']
      if (body.identification_id ?? body['rut']) odooData.identification_id = body.identification_id ?? body['rut']
      // Map Chilean fields
      if (body.afp_id || body['afp']) odooData.l10n_cl_afp_id = Number(body.afp_id ?? body['afp'])
      if (body.health_plan || body['plan_salud']) odooData.l10n_cl_health_plan = body.health_plan ?? body['plan_salud']
      if (body.isapre_id || body['isapre']) odooData.l10n_cl_isapre_id = Number(body.isapre_id ?? body['isapre'])
      if (body.isapre_cotizacion_uf || body['cotizacion_isapre_uf']) odooData.l10n_cl_isapre_cotizacion_uf = Number(body.isapre_cotizacion_uf ?? body['cotizacion_isapre_uf'])
      if (body.cargas_familiares !== undefined) odooData.l10n_cl_cargas_familiares = Number(body.cargas_familiares)

      const result = await odooHRAdapter.updateEmployee(user.company_id, employeeId, odooData)
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

    if (!body || !body['employee_id'] || !body['wage'] || !body['date_start']) {
      return reply.status(400).send({
        source: 'error',
        message: 'Campos requeridos: employee_id, wage, date_start',
      })
    }

    // Map frontend field names to Odoo field names
    const odooData: Record<string, unknown> = {
      employee_id: Number(body.employee_id),
      wage: Number(body.wage),
      date_start: body.date_start,
      company_id: user.company_id,
      name: body.name || `Contrato ${body.date_start}`,
    }
    if (body.date_end) odooData.date_end = body.date_end
    if (body.type) odooData.l10n_cl_contract_type = body.type
    if (body.gratification_type) odooData.l10n_cl_gratificacion_type = body.gratification_type
    if (body.colacion) odooData.l10n_cl_colacion = Number(body.colacion)
    if (body.movilizacion) odooData.l10n_cl_movilizacion = Number(body.movilizacion)
    if (body.structure_type_id) odooData.struct_id = Number(body.structure_type_id)
    odooData.state = 'open'

    try {
      const result = await odooHRAdapter.createContract(user.company_id, odooData)
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

    // Map frontend field names to Odoo field names
    const odooData: Record<string, unknown> = {}
    if (body.employee_id) odooData.employee_id = Number(body.employee_id)
    if (body.wage) odooData.wage = Number(body.wage)
    if (body.date_start) odooData.date_start = body.date_start
    if (body.date_end !== undefined) odooData.date_end = body.date_end || false
    if (body.type) odooData.l10n_cl_contract_type = body.type
    if (body.gratification_type) odooData.l10n_cl_gratificacion_type = body.gratification_type
    if (body.colacion !== undefined) odooData.l10n_cl_colacion = Number(body.colacion)
    if (body.movilizacion !== undefined) odooData.l10n_cl_movilizacion = Number(body.movilizacion)
    if (body.structure_type_id) odooData.struct_id = Number(body.structure_type_id)
    if (body.name) odooData.name = body.name

    try {
      const result = await odooHRAdapter.updateContract(user.company_id, contractId, odooData)
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

  // ── GET /contratos/:id/pdf ─────────────────────────────────
  // Generates a Chilean employment contract PDF from Odoo data
  fastify.get('/contratos/:id/pdf', async (req, reply) => {
    const user = (req as any).user
    const { id } = req.params as { id: string }
    const contractId = Number(id)

    try {
      // 1. Fetch contract from Odoo
      const contracts = await odooAccountingAdapter.searchRead(
        'hr.contract',
        [
          ['id', '=', contractId],
          ['company_id', '=', user.company_id],
        ],
        [
          'name', 'employee_id', 'job_id', 'wage', 'date_start', 'date_end',
          'state', 'struct_id', 'resource_calendar_id',
          'l10n_cl_colacion', 'l10n_cl_movilizacion', 'l10n_cl_contract_type', 'l10n_cl_jornada',
          'l10n_cl_jurisdiction_commune',
        ],
        { limit: 1 },
      )

      if (contracts.length === 0) {
        return reply.status(404).send({
          source: 'error',
          message: 'Contrato no encontrado',
        })
      }

      const contract = contracts[0] as Record<string, unknown>
      const employeeRef = contract['employee_id'] as [number, string] | undefined

      if (!employeeRef || !employeeRef[0]) {
        return reply.status(400).send({
          source: 'error',
          message: 'Contrato sin empleado asociado',
        })
      }

      // 2. Fetch employee with extended fields
      const employees = await odooAccountingAdapter.searchRead(
        'hr.employee',
        [
          ['id', '=', employeeRef[0]],
          ['company_id', '=', user.company_id],
        ],
        [
          'name', 'identification_id', 'marital', 'birthday', 'country_id',
          'work_email', 'work_phone', 'job_title',
          'address_home_id', 'private_street', 'private_city',
          'l10n_cl_commune', 'l10n_cl_nationality', 'l10n_cl_afp_id', 'l10n_cl_health_plan',
          'l10n_cl_isapre_id', 'l10n_cl_isapre_cotizacion_uf',
          'l10n_cl_private_address', 'l10n_cl_private_commune',
        ],
        { limit: 1 },
      )

      const employee = (employees[0] ?? {}) as Record<string, unknown>

      // 3. Fetch company with logo
      const companies = await odooAccountingAdapter.searchRead(
        'res.company',
        [['id', '=', user.company_id]],
        [
          'name', 'vat', 'street', 'city', 'email', 'logo',
          'l10n_cl_commune', 'l10n_cl_rep_legal_name', 'l10n_cl_rep_legal_rut',
        ],
        { limit: 1 },
      )

      const company = (companies[0] ?? {}) as Record<string, unknown>

      // 4. Build ContractPDFData from Odoo records
      const jobRef = contract['job_id'] as [number, string] | false
      const countryRef = employee['country_id'] as [number, string] | false

      // Determine contract type
      let contractType: ContractPDFData['contract_type'] = 'indefinido'
      const rawType = String(contract['l10n_cl_contract_type'] ?? contract['name'] ?? '')
      if (rawType.toLowerCase().includes('fijo') || rawType.toLowerCase().includes('plazo')) {
        contractType = 'plazo_fijo'
      } else if (rawType.toLowerCase().includes('obra') || rawType.toLowerCase().includes('faena')) {
        contractType = 'obra_faena'
      }

      // Determine jornada
      const calRef = contract['resource_calendar_id'] as [number, string] | false
      let jornada = String(contract['l10n_cl_jornada'] ?? '')
      if (!jornada && calRef) {
        const calName = calRef[1]?.toLowerCase() ?? ''
        if (calName.includes('art') && calName.includes('22')) {
          jornada = 'art22'
        } else {
          jornada = 'completa'
        }
      }
      if (!jornada) jornada = 'completa'

      // Map marital status
      const maritalMap: Record<string, string> = {
        single: 'Soltero/a',
        married: 'Casado/a',
        cohabitant: 'Conviviente Civil',
        widower: 'Viudo/a',
        divorced: 'Divorciado/a',
      }

      const pdfData: ContractPDFData = {
        // Company
        company_name: String(company['name'] ?? ''),
        company_rut: String(company['vat'] ?? ''),
        company_address: String(company['street'] ?? ''),
        company_commune: String(company['l10n_cl_commune'] ?? company['city'] ?? ''),
        company_city: String(company['city'] ?? ''),
        company_email: String(company['email'] ?? ''),
        company_logo: company['logo'] ? String(company['logo']) : undefined,
        rep_legal_name: String(company['l10n_cl_rep_legal_name'] ?? ''),
        rep_legal_rut: String(company['l10n_cl_rep_legal_rut'] ?? ''),

        // Employee
        employee_name: String(employee['name'] ?? ''),
        employee_rut: String(employee['identification_id'] ?? ''),
        employee_nationality: countryRef ? countryRef[1] : String(employee['l10n_cl_nationality'] ?? 'Chilena'),
        employee_marital: maritalMap[String(employee['marital'] ?? 'single')] ?? 'Soltero/a',
        employee_birthday: String(employee['birthday'] ?? ''),
        employee_address: String(employee['l10n_cl_private_address'] ?? employee['private_street'] ?? ''),
        employee_commune: String(employee['l10n_cl_private_commune'] ?? employee['private_city'] ?? ''),
        employee_email: String(employee['work_email'] ?? ''),
        employee_phone: String(employee['work_phone'] ?? ''),
        employee_afp: Array.isArray(employee['l10n_cl_afp_id']) ? String((employee['l10n_cl_afp_id'] as [number, string])[1]) : String(employee['l10n_cl_afp_id'] ?? ''),
        employee_health: (() => {
          const isapre = employee['l10n_cl_isapre_id']
          const healthPlan = employee['l10n_cl_health_plan']
          if (healthPlan === 'fonasa' || (!isapre && !healthPlan)) return 'Fonasa'
          const isapreName = Array.isArray(isapre) ? String((isapre as [number, string])[1]) : String(isapre ?? '')
          const uf = employee['l10n_cl_isapre_cotizacion_uf']
          return uf ? `${isapreName} Plan UF ${uf}` : isapreName || 'Fonasa'
        })(),

        // Contract
        contract_type: contractType,
        start_date: String(contract['date_start'] ?? ''),
        end_date: contract['date_end'] ? String(contract['date_end']) : undefined,
        job_title: jobRef ? jobRef[1] : String(employee['job_title'] ?? ''),
        jornada,
        wage: Number(contract['wage'] ?? 0),
        colacion: Number(contract['l10n_cl_colacion'] ?? 0),
        movilizacion: Number(contract['l10n_cl_movilizacion'] ?? 0),
        jurisdiction_commune: String(
          contract['l10n_cl_jurisdiction_commune'] ?? company['l10n_cl_commune'] ?? company['city'] ?? '',
        ),
      }

      // 5. Generate PDF
      const pdfBuffer = await generateContractPDF(pdfData)

      // 6. Send as download
      const safeName = pdfData.employee_name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase()

      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', `attachment; filename="contrato-${safeName}.pdf"`)
      reply.header('Content-Length', pdfBuffer.length)

      return reply.send(pdfBuffer)
    } catch (err) {
      logger.error({ err, contractId }, 'Error generating contract PDF')
      return reply.status(500).send({
        source: 'error',
        message: 'Error al generar PDF del contrato',
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

  // ── GET /empresa ────────────────────────────────────────────
  // Company info with logo (logo base64 from res.company)
  fastify.get('/empresa', async (req, reply) => {
    const user = (req as any).user
    try {
      const companies = await odooAccountingAdapter.searchRead(
        'res.company',
        [['id', '=', user.company_id]],
        ['name', 'vat', 'street', 'city', 'state_id', 'country_id', 'phone', 'email', 'website', 'logo'],
        { limit: 1 },
      )
      const company = companies[0] ?? null
      return reply.send({ source: 'odoo', empresa: company })
    } catch (err) {
      logger.error({ err }, 'Error fetching company data')
      return reply.send({ source: 'error', empresa: null })
    }
  })

  // ── PUT /empresa ────────────────────────────────────────────
  // Update company data (including logo base64)
  fastify.put('/empresa', async (req, reply) => {
    const user = (req as any).user
    const body = req.body as Record<string, unknown>
    try {
      const success = await odooAccountingAdapter.write('res.company', [user.company_id], body)
      return reply.send({ source: 'odoo', success })
    } catch (err) {
      logger.error({ err }, 'Error updating company')
      return reply.send({ source: 'error', success: false })
    }
  })
}
