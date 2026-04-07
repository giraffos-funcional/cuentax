/**
 * CUENTAX — Portal del Trabajador Routes (BFF)
 * ==============================================
 * Employee-facing portal: login with RUT + PIN, view payslips, contracts.
 * Separate from the main dashboard auth flow.
 *
 * POST /api/v1/portal/login
 * GET  /api/v1/portal/me
 * GET  /api/v1/portal/liquidaciones
 * GET  /api/v1/portal/liquidaciones/:id
 * GET  /api/v1/portal/liquidaciones/:id/pdf
 * GET  /api/v1/portal/contrato
 * GET  /api/v1/portal/asistencia
 * GET  /api/v1/portal/ausencias
 * GET  /api/v1/portal/documentos/certificado-laboral
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { createSigner, createVerifier } from 'fast-jwt'
import { z } from 'zod'
import { config } from '@/core/config'
import { logger } from '@/core/logger'
import { odooAccountingAdapter } from '@/adapters/odoo-accounting.adapter'
import { odooHRAdapter } from '@/adapters/odoo-hr.adapter'
import { generatePayslipPDF } from '@/services/payslip-pdf.service'
import type { PayslipPDFData, PayslipPDFLine } from '@/services/payslip-pdf.service'
import { generateCertificadoLaboralPDF } from '@/services/certificado-laboral-pdf.service'

// ── Portal JWT Configuration ──────────────────────────────────
const PORTAL_ACCESS_TTL = 8 * 60 * 60 * 1000 // 8 hours in ms
const signPortalAccess = createSigner({ key: config.JWT_SECRET, expiresIn: PORTAL_ACCESS_TTL })
const verifyPortalAccess = createVerifier({ key: config.JWT_SECRET })

// ── Portal User Type ──────────────────────────────────────────
interface PortalUser {
  employee_id: number
  company_id: number
  name: string
  rut: string
}

// Extend Fastify request to include portal user
declare module 'fastify' {
  interface FastifyRequest {
    portalUser?: PortalUser
  }
}

// ── Portal Guard Middleware ───────────────────────────────────
async function portalGuard(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({
      error: 'unauthorized',
      message: 'Token de acceso requerido',
    })
  }

  const token = authHeader.slice(7)

  try {
    const payload = verifyPortalAccess(token)

    if (payload.type !== 'portal') {
      return reply.status(401).send({
        error: 'invalid_token_type',
        message: 'Token no corresponde al portal de trabajadores',
      })
    }

    request.portalUser = {
      employee_id: payload.employee_id as number,
      company_id: payload.company_id as number,
      name: payload.name as string,
      rut: payload.rut as string,
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Token invalido'
    if (msg.includes('expired')) {
      return reply.status(401).send({
        error: 'token_expired',
        message: 'Sesion expirada. Ingresa nuevamente.',
      })
    }
    return reply.status(401).send({
      error: 'invalid_token',
      message: 'Token invalido',
    })
  }
}

// ── Validation Schemas ────────────────────────────────────────
const loginSchema = z.object({
  rut: z.string().min(7, 'RUT invalido').max(12, 'RUT invalido'),
  pin: z.string().length(6, 'PIN debe tener 6 digitos').regex(/^\d{6}$/, 'PIN solo puede contener numeros'),
})

// ── Chilean month names ───────────────────────────────────────
const MONTHS_ES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// ── RUT normalization helper ──────────────────────────────────
function normalizeRut(rut: string): string {
  return rut.replace(/[.\-\s]/g, '').toUpperCase()
}

// ── Routes ────────────────────────────────────────────────────
export async function portalRoutes(fastify: FastifyInstance) {

  // ── POST /login ────────────────────────────────────────────
  fastify.post('/login', async (request, reply) => {
    const result = loginSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({
        error: 'validation_error',
        message: 'Datos de ingreso invalidos',
        details: result.error.flatten().fieldErrors,
      })
    }

    const { rut, pin } = result.data
    const normalizedRut = normalizeRut(rut)

    try {
      // Search employee by RUT (identification_id) and verify PIN
      const employees = await odooAccountingAdapter.searchRead(
        'hr.employee',
        [
          ['identification_id', '!=', false],
          ['active', '=', true],
        ],
        [
          'id', 'name', 'identification_id', 'company_id',
          'l10n_cl_portal_pin', 'job_title', 'department_id',
        ],
        { limit: 0 },
      )

      // Find employee matching normalized RUT
      const employee = (employees as Array<Record<string, unknown>>).find((emp) => {
        const empRut = normalizeRut(String(emp.identification_id ?? ''))
        return empRut === normalizedRut
      })

      if (!employee) {
        logger.warn({ rut: normalizedRut }, 'Portal login: employee not found')
        return reply.status(401).send({
          error: 'invalid_credentials',
          message: 'RUT o PIN incorrectos',
        })
      }

      // Verify PIN
      const storedPin = String(employee.l10n_cl_portal_pin ?? '')
      if (!storedPin || storedPin !== pin) {
        logger.warn({ rut: normalizedRut, employeeId: employee.id }, 'Portal login: invalid PIN')
        return reply.status(401).send({
          error: 'invalid_credentials',
          message: 'RUT o PIN incorrectos',
        })
      }

      // Extract company_id from Many2one field
      const companyId = Array.isArray(employee.company_id)
        ? (employee.company_id as [number, string])[0]
        : Number(employee.company_id)

      // Generate portal JWT
      const portalPayload = {
        type: 'portal' as const,
        employee_id: Number(employee.id),
        company_id: companyId,
        name: String(employee.name),
        rut: normalizedRut,
      }

      const accessToken = signPortalAccess(portalPayload)

      logger.info({ employeeId: employee.id, rut: normalizedRut }, 'Portal login successful')

      return reply.status(200).send({
        access_token: accessToken,
        expires_in: PORTAL_ACCESS_TTL / 1000, // seconds
        employee: {
          id: Number(employee.id),
          name: String(employee.name),
          rut: normalizedRut,
          job_title: String(employee.job_title ?? ''),
          department: Array.isArray(employee.department_id)
            ? String((employee.department_id as [number, string])[1])
            : '',
        },
      })
    } catch (err) {
      logger.error({ err, rut: normalizedRut }, 'Portal login error')
      return reply.status(500).send({
        error: 'internal_error',
        message: 'Error al autenticar. Intente nuevamente.',
      })
    }
  })

  // ── GET /me/debug (TEMP — remove after fixing) ─────────────
  fastify.get('/me/debug', { preHandler: [portalGuard] }, async (request, reply) => {
    const portal = request.portalUser!
    try {
      const byId = await odooAccountingAdapter.searchRead(
        'hr.employee', [['id', '=', portal.employee_id]], ['name'], { limit: 1 },
      )
      const allActive = await odooAccountingAdapter.searchRead(
        'hr.employee', [['active', '=', true]], ['id', 'name', 'company_id'], { limit: 0 },
      )
      const allAny = await odooAccountingAdapter.searchRead(
        'hr.employee', [], ['id', 'name', 'company_id'], { limit: 10 },
      )
      return reply.send({
        portal,
        byId_count: (byId as unknown[]).length,
        byId_first: (byId as unknown[])[0] ?? null,
        allActive_count: (allActive as unknown[]).length,
        allActive_ids: (allActive as Array<Record<string, unknown>>).map((e) => ({ id: e.id, name: e.name, company: e.company_id })),
        allAny_count: (allAny as unknown[]).length,
        allAny_first: (allAny as unknown[])[0] ?? null,
      })
    } catch (err) {
      return reply.status(500).send({ error: String(err) })
    }
  })

  // ── GET /me ────────────────────────────────────────────────
  fastify.get('/me', { preHandler: [portalGuard] }, async (request, reply) => {
    const portal = request.portalUser!

    try {
      // First try with standard fields only (l10n_cl fields may not exist)
      const baseFields = [
        'name', 'identification_id', 'job_title', 'department_id',
        'work_email', 'work_phone', 'image_128', 'date_start',
      ]
      let results = await odooAccountingAdapter.searchRead(
        'hr.employee',
        [['id', '=', portal.employee_id]],
        baseFields,
        { limit: 1 },
      )

      // If not found, try without company ir.rule by fetching all and filtering
      if (results.length === 0) {
        const allEmps = await odooAccountingAdapter.searchRead(
          'hr.employee',
          [['active', '=', true]],
          ['id', ...baseFields],
          { limit: 0 },
        )
        results = (allEmps as Array<Record<string, unknown>>).filter(
          (e) => Number(e.id) === portal.employee_id,
        )
      }

      const employee = results[0] as Record<string, unknown> | undefined
      if (!employee) {
        return reply.status(404).send({ error: 'Empleado no encontrado' })
      }

      // Try to get Chilean HR fields (may not exist)
      let afp = '', isapre = '', healthPlan = 'fonasa'
      try {
        const extResults = await odooAccountingAdapter.searchRead(
          'hr.employee',
          [['id', '=', portal.employee_id]],
          ['l10n_cl_afp_id', 'l10n_cl_isapre_id', 'l10n_cl_health_plan'],
          { limit: 1 },
        )
        const ext = extResults[0] as Record<string, unknown> | undefined
        if (ext) {
          afp = Array.isArray(ext.l10n_cl_afp_id)
            ? String((ext.l10n_cl_afp_id as [number, string])[1])
            : ''
          isapre = Array.isArray(ext.l10n_cl_isapre_id)
            ? String((ext.l10n_cl_isapre_id as [number, string])[1])
            : ''
          healthPlan = String(ext.l10n_cl_health_plan ?? 'fonasa')
        }
      } catch {
        // Chilean HR fields not available
      }

      return reply.send({
        employee: {
          id: portal.employee_id,
          name: String(employee.name ?? ''),
          rut: portal.rut,
          job_title: String(employee.job_title ?? ''),
          department: Array.isArray(employee.department_id)
            ? String((employee.department_id as [number, string])[1])
            : '',
          work_email: String(employee.work_email ?? ''),
          work_phone: String(employee.work_phone ?? ''),
          date_start: String(employee.date_start ?? ''),
          afp,
          health_plan: healthPlan,
          isapre,
          image_128: employee.image_128 ? String(employee.image_128) : null,
        },
      })
    } catch (err) {
      logger.error({ err, employeeId: portal.employee_id }, 'Error fetching portal profile')
      return reply.status(500).send({ error: 'Error al obtener perfil' })
    }
  })

  // ── GET /liquidaciones ─────────────────────────────────────
  fastify.get('/liquidaciones', { preHandler: [portalGuard] }, async (request, reply) => {
    const portal = request.portalUser!
    const q = request.query as { year?: string; page?: string; limit?: string }
    const now = new Date()
    const year = Number(q.year ?? now.getFullYear())
    const page = Number(q.page ?? 1)
    const limit = Number(q.limit ?? 24)

    try {
      const domain = [
        ['employee_id', '=', portal.employee_id],
        ['state', 'in', ['done', 'paid']],
        ['date_from', '>=', `${year - 1}-01-01`],
        ['date_to', '<=', `${year}-12-31`],
      ]

      const payslips = await odooAccountingAdapter.searchRead(
        'hr.payslip',
        domain,
        ['number', 'name', 'date_from', 'date_to', 'state'],
        { limit, offset: (page - 1) * limit, order: 'date_from desc' },
      )

      const total = await odooAccountingAdapter.searchCount('hr.payslip', domain)

      // Compute wage totals from payslip lines (Odoo 18 Community lacks net_wage/gross_wage fields)
      const liquidaciones = await Promise.all(
        (payslips as Array<Record<string, unknown>>).map(async (p) => {
          const payslipId = Number(p.id)
          const lines = await odooHRAdapter.getPayslipLines(payslipId) as Array<Record<string, unknown>>

          let basic = 0, gross = 0, net = 0
          for (const l of lines) {
            const code = String(l.code ?? '').toUpperCase()
            const amount = Number(l.total ?? l.amount ?? 0)
            if (code === 'BASIC' || code === 'BASE') basic = amount
            else if (code === 'GROSS' || code === 'BRUT') gross = amount
            else if (code === 'NET' || code === 'LIQ') net = amount
          }

          const dateFrom = String(p.date_from ?? '')
          const periodDate = dateFrom ? new Date(dateFrom + 'T12:00:00') : new Date()
          const monthIdx = periodDate.getMonth() + 1
          const periodYear = periodDate.getFullYear()

          return {
            id: payslipId,
            number: String(p.number ?? ''),
            name: String(p.name ?? ''),
            date_from: dateFrom,
            date_to: String(p.date_to ?? ''),
            state: String(p.state ?? ''),
            net_wage: net,
            gross_wage: gross,
            basic_wage: basic,
            period_label: `${MONTHS_ES[monthIdx] ?? monthIdx} ${periodYear}`,
          }
        }),
      )

      return reply.send({ liquidaciones, total, page, limit })
    } catch (err) {
      logger.error({ err, employeeId: portal.employee_id }, 'Error fetching portal payslips')
      return reply.send({ liquidaciones: [], total: 0, page, limit })
    }
  })

  // ── GET /liquidaciones/:id ─────────────────────────────────
  fastify.get('/liquidaciones/:id', { preHandler: [portalGuard] }, async (request, reply) => {
    const portal = request.portalUser!
    const payslipId = Number((request.params as { id: string }).id)

    try {
      // Verify payslip belongs to this employee
      const results = await odooAccountingAdapter.searchRead(
        'hr.payslip',
        [
          ['id', '=', payslipId],
          ['employee_id', '=', portal.employee_id],
        ],
        [
          'number', 'name', 'employee_id', 'date_from', 'date_to',
          'state', 'struct_id', 'contract_id',
        ],
        { limit: 1 },
      )

      const liquidacion = results[0] as Record<string, unknown> | undefined
      if (!liquidacion) {
        return reply.status(404).send({ error: 'Liquidacion no encontrada' })
      }

      // Fetch payslip lines
      const rawLines = await odooHRAdapter.getPayslipLines(payslipId) as Array<Record<string, unknown>>

      // Categorize lines for frontend display
      const lineas = rawLines.map((l) => {
        const catId = l.category_id
        const catName = Array.isArray(catId) ? String((catId as [number, string])[1]) : String(catId ?? '')
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
          id: Number(l.id),
          code: String(l.code ?? ''),
          name: String(l.name ?? ''),
          category,
          quantity: Number(l.quantity ?? 0),
          rate: Number(l.rate ?? 0),
          amount: Number(l.amount ?? 0),
          total: Number(l.total ?? l.amount ?? 0),
        }
      })

      // Compute haber/descuento totals
      const haberCats = new Set(['BASIC', 'ALW', 'ALWNOTIMP'])
      const descuentoCats = new Set(['DEDPREV', 'DEDSALUD', 'DEDTRIB', 'DED'])
      const excludedCodes = new Set(['GROSS', 'NET', 'COMP'])

      const haberes = lineas.filter((l) => haberCats.has(l.category) && !excludedCodes.has(l.code))
      const descuentos = lineas.filter((l) => descuentoCats.has(l.category) && !excludedCodes.has(l.code))

      const totalHaberes = haberes.reduce((sum, l) => sum + l.total, 0)
      const totalDescuentos = descuentos.reduce((sum, l) => sum + Math.abs(l.total), 0)

      // Compute wage totals from lines (Odoo 18 Community lacks net_wage/gross_wage fields)
      let basicWage = 0, grossWage = 0, netWage = 0
      for (const l of lineas) {
        const code = l.code.toUpperCase()
        if (code === 'BASIC' || code === 'BASE') basicWage = l.total
        else if (code === 'GROSS' || code === 'BRUT') grossWage = l.total
        else if (code === 'NET' || code === 'LIQ') netWage = l.total
      }

      const dateFrom = String(liquidacion.date_from ?? '')
      const periodDate = dateFrom ? new Date(dateFrom + 'T12:00:00') : new Date()

      return reply.send({
        liquidacion: {
          id: payslipId,
          number: String(liquidacion.number ?? ''),
          name: String(liquidacion.name ?? ''),
          date_from: dateFrom,
          date_to: String(liquidacion.date_to ?? ''),
          state: String(liquidacion.state ?? ''),
          net_wage: netWage,
          gross_wage: grossWage,
          basic_wage: basicWage,
          period_label: `${MONTHS_ES[periodDate.getMonth() + 1] ?? ''} ${periodDate.getFullYear()}`,
        },
        haberes,
        descuentos,
        totals: {
          total_haberes: totalHaberes,
          total_descuentos: totalDescuentos,
          total_pagar: netWage || (totalHaberes - totalDescuentos),
        },
      })
    } catch (err) {
      logger.error({ err, payslipId, employeeId: portal.employee_id }, 'Error fetching portal payslip detail')
      return reply.status(500).send({ error: 'Error al obtener liquidacion' })
    }
  })

  // ── GET /liquidaciones/:id/pdf ─────────────────────────────
  fastify.get('/liquidaciones/:id/pdf', { preHandler: [portalGuard] }, async (request, reply) => {
    const portal = request.portalUser!
    const payslipId = Number((request.params as { id: string }).id)

    try {
      // 1. Verify payslip belongs to this employee
      const payslipResults = await odooAccountingAdapter.searchRead(
        'hr.payslip',
        [
          ['id', '=', payslipId],
          ['employee_id', '=', portal.employee_id],
        ],
        [
          'number', 'name', 'employee_id', 'date_from', 'date_to',
          'state', 'struct_id', 'contract_id',
        ],
        { limit: 1 },
      )
      const payslip = payslipResults[0] as Record<string, unknown> | undefined

      if (!payslip) {
        return reply.status(404).send({ error: 'Liquidacion no encontrada' })
      }

      // 2. Get payslip lines
      const rawLines = await odooHRAdapter.getPayslipLines(payslipId) as Array<Record<string, unknown>>

      // 3. Get employee data (with fallback for ir.rule)
      const pdfEmpFields = ['name', 'identification_id', 'job_title', 'department_id', 'contract_id', 'date_start']
      let employeeResults = await odooAccountingAdapter.searchRead(
        'hr.employee', [['id', '=', portal.employee_id]], pdfEmpFields, { limit: 1 },
      )
      if (employeeResults.length === 0) {
        const allE = await odooAccountingAdapter.searchRead(
          'hr.employee', [['active', '=', true]], ['id', ...pdfEmpFields], { limit: 0 },
        )
        employeeResults = (allE as Array<Record<string, unknown>>).filter(
          (e) => Number(e.id) === portal.employee_id,
        )
      }
      // Try Chilean fields separately
      try {
        const clFields = await odooAccountingAdapter.searchRead(
          'hr.employee', [['id', '=', portal.employee_id]],
          ['l10n_cl_afp_id', 'l10n_cl_isapre_id', 'l10n_cl_isapre_cotizacion_uf'],
          { limit: 1 },
        )
        if (clFields[0] && employeeResults[0]) {
          Object.assign(employeeResults[0] as Record<string, unknown>, clFields[0] as Record<string, unknown>)
        }
      } catch { /* Chilean fields not available */ }
      const employee = employeeResults[0] as Record<string, unknown> | undefined

      // 4. Get company data
      const companyResults = await odooAccountingAdapter.searchRead(
        'res.company',
        [['id', '=', portal.company_id]],
        ['name', 'vat', 'street', 'city', 'state_id', 'country_id', 'logo'],
        { limit: 1 },
      )
      const company = companyResults[0] as Record<string, unknown> | undefined

      // 5. Get contract for wage
      const contractId = Array.isArray(payslip.contract_id)
        ? (payslip.contract_id as [number, string])[0]
        : Number(payslip.contract_id ?? 0)

      let wage = 0
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

      // 6. Get UF value
      const dateFrom = String(payslip.date_from ?? '')
      const periodDate = dateFrom ? new Date(dateFrom + 'T12:00:00') : new Date()
      const periodMonth = periodDate.getMonth() + 1
      const periodYear = periodDate.getFullYear()

      let ufValue = 0
      try {
        const indicatorResults = await odooAccountingAdapter.searchRead(
          'l10n_cl.indicators',
          [
            ['company_id', '=', portal.company_id],
            ['month', '=', periodMonth],
            ['year', '=', periodYear],
          ],
          ['uf'],
          { limit: 1 },
        )
        const indicator = indicatorResults[0] as Record<string, unknown> | undefined
        if (indicator?.uf) ufValue = Number(indicator.uf)
      } catch {
        // UF not available — will show 0
      }

      // 7. Map lines to PDF format
      const lines: PayslipPDFLine[] = rawLines.map((l) => {
        const catId = l.category_id
        const catName = Array.isArray(catId) ? String((catId as [number, string])[1]) : String(catId ?? '')
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

      // 8. Calculate totals
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

      // Compute net from lines (Odoo 18 Community lacks net_wage field)
      const netLine = lines.find((l) => l.code.toUpperCase() === 'NET' || l.code.toUpperCase() === 'LIQ')
      const totalPagar = netLine ? netLine.total : (totalHaberes - totalDescuentos)

      // Extract employee fields
      const employeeName = String(employee?.name ?? portal.name)
      const employeeRut = String(employee?.identification_id ?? portal.rut)
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
      const employeeIsapreUf = employee?.l10n_cl_isapre_cotizacion_uf
        ? Number(employee.l10n_cl_isapre_cotizacion_uf)
        : undefined

      const companyAddress = [company?.street, company?.city]
        .filter(Boolean)
        .map(String)
        .join(', ') || '-'

      const monthName = MONTHS_ES[periodMonth] ?? String(periodMonth)

      // 9. Build PDF data
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

      const safeName = employeeName.replace(/[^a-zA-Z0-9\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1\u00c1\u00c9\u00cd\u00d3\u00da\u00d1 ]/g, '').replace(/\s+/g, '-')
      const filename = `liquidacion-${monthName.toLowerCase()}-${periodYear}-${safeName}.pdf`

      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      return reply.send(pdfBuffer)
    } catch (err) {
      logger.error({ err, payslipId, employeeId: portal.employee_id }, 'Error generating portal payslip PDF')
      return reply.status(500).send({ error: 'Error al generar PDF de liquidacion' })
    }
  })

  // ── GET /contrato ──────────────────────────────────────────
  fastify.get('/contrato', { preHandler: [portalGuard] }, async (request, reply) => {
    const portal = request.portalUser!

    try {
      // Fetch active or most recent contract for this employee
      const contracts = await odooAccountingAdapter.searchRead(
        'hr.contract',
        [
          ['employee_id', '=', portal.employee_id],
        ],
        [
          'name', 'state', 'date_start', 'date_end', 'wage',
          'job_id', 'department_id', 'struct_id',
        ],
        { order: 'date_start desc', limit: 5 },
      )

      const contratos = (contracts as Array<Record<string, unknown>>).map((c) => ({
        id: Number(c.id),
        name: String(c.name ?? ''),
        state: String(c.state ?? ''),
        date_start: String(c.date_start ?? ''),
        date_end: c.date_end ? String(c.date_end) : null,
        wage: Number(c.wage ?? 0),
        job: Array.isArray(c.job_id)
          ? String((c.job_id as [number, string])[1])
          : '',
        department: Array.isArray(c.department_id)
          ? String((c.department_id as [number, string])[1])
          : '',
        structure: Array.isArray(c.struct_id)
          ? String((c.struct_id as [number, string])[1])
          : '',
      }))

      // Separate active contract from historical
      const activeContract = contratos.find((c) => c.state === 'open') ?? contratos[0] ?? null
      const historicalContracts = contratos.filter((c) => c !== activeContract)

      return reply.send({
        contrato_activo: activeContract,
        historicos: historicalContracts,
      })
    } catch (err) {
      logger.error({ err, employeeId: portal.employee_id }, 'Error fetching portal contract')
      return reply.send({ contrato_activo: null, historicos: [] })
    }
  })

  // ── GET /asistencia ────────────────────────────────────────
  fastify.get('/asistencia', { preHandler: [portalGuard] }, async (request, reply) => {
    const portal = request.portalUser!
    const q = request.query as { mes?: string; year?: string; page?: string; limit?: string }
    const now = new Date()
    const year = Number(q.year ?? now.getFullYear())
    const mes = Number(q.mes ?? (now.getMonth() + 1))
    const page = Number(q.page ?? 1)
    const limit = Number(q.limit ?? 50)

    try {
      const monthStr = String(mes).padStart(2, '0')
      const lastDay = new Date(year, mes, 0).getDate()
      const desde = `${year}-${monthStr}-01`
      const hasta = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`

      const records = await odooAccountingAdapter.searchRead(
        'hr.attendance',
        [
          ['employee_id', '=', portal.employee_id],
          ['check_in', '>=', desde],
          ['check_in', '<=', `${hasta} 23:59:59`],
        ],
        ['check_in', 'check_out', 'worked_hours'],
        { limit, offset: (page - 1) * limit, order: 'check_in desc' },
      )

      const total = await odooAccountingAdapter.searchCount(
        'hr.attendance',
        [
          ['employee_id', '=', portal.employee_id],
          ['check_in', '>=', desde],
          ['check_in', '<=', `${hasta} 23:59:59`],
        ],
      )

      const asistencia = (records as Array<Record<string, unknown>>).map((r) => ({
        id: Number(r.id),
        check_in: String(r.check_in ?? ''),
        check_out: r.check_out ? String(r.check_out) : null,
        worked_hours: Number(r.worked_hours ?? 0),
      }))

      // Compute monthly summary
      const totalHours = asistencia.reduce((sum, a) => sum + a.worked_hours, 0)
      const daysWorked = new Set(
        asistencia.map((a) => a.check_in.split(' ')[0]),
      ).size

      return reply.send({
        asistencia,
        resumen: {
          total_horas: Math.round(totalHours * 100) / 100,
          dias_trabajados: daysWorked,
          periodo: `${MONTHS_ES[mes] ?? mes} ${year}`,
        },
        total,
        page,
        limit,
      })
    } catch (err) {
      logger.error({ err, employeeId: portal.employee_id }, 'Error fetching portal attendance')
      return reply.send({
        asistencia: [],
        resumen: { total_horas: 0, dias_trabajados: 0, periodo: '' },
        total: 0,
        page,
        limit,
      })
    }
  })

  // ── GET /ausencias ─────────────────────────────────────────
  fastify.get('/ausencias', { preHandler: [portalGuard] }, async (request, reply) => {
    const portal = request.portalUser!

    try {
      // Fetch leaves for this employee (last 12 months + future)
      const oneYearAgo = new Date()
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
      const sinceDate = oneYearAgo.toISOString().split('T')[0]

      const [leaves, allocations] = await Promise.all([
        odooAccountingAdapter.searchRead(
          'hr.leave',
          [
            ['employee_id', '=', portal.employee_id],
            ['date_from', '>=', sinceDate],
          ],
          [
            'holiday_status_id', 'date_from', 'date_to',
            'number_of_days', 'state', 'name',
          ],
          { order: 'date_from desc', limit: 50 },
        ),
        odooAccountingAdapter.searchRead(
          'hr.leave.allocation',
          [
            ['employee_id', '=', portal.employee_id],
            ['state', '=', 'validate'],
          ],
          ['holiday_status_id', 'number_of_days'],
          { order: 'holiday_status_id asc' },
        ),
      ])

      const ausencias = (leaves as Array<Record<string, unknown>>).map((l) => ({
        id: Number(l.id),
        type: Array.isArray(l.holiday_status_id)
          ? String((l.holiday_status_id as [number, string])[1])
          : '',
        date_from: String(l.date_from ?? ''),
        date_to: String(l.date_to ?? ''),
        days: Number(l.number_of_days ?? 0),
        state: String(l.state ?? ''),
        description: String(l.name ?? ''),
      }))

      // Build leave balance from allocations vs taken leaves
      const balanceMap = new Map<string, { allocated: number; taken: number }>()

      for (const alloc of allocations as Array<Record<string, unknown>>) {
        const typeName = Array.isArray(alloc.holiday_status_id)
          ? String((alloc.holiday_status_id as [number, string])[1])
          : 'Otro'
        const current = balanceMap.get(typeName) ?? { allocated: 0, taken: 0 }
        current.allocated += Number(alloc.number_of_days ?? 0)
        balanceMap.set(typeName, current)
      }

      for (const leave of ausencias) {
        if (leave.state === 'validate' || leave.state === 'validate1') {
          const current = balanceMap.get(leave.type) ?? { allocated: 0, taken: 0 }
          current.taken += leave.days
          balanceMap.set(leave.type, current)
        }
      }

      const saldos = Array.from(balanceMap.entries()).map(([type, bal]) => ({
        type,
        allocated: bal.allocated,
        taken: bal.taken,
        remaining: bal.allocated - bal.taken,
      }))

      return reply.send({ ausencias, saldos })
    } catch (err) {
      logger.error({ err, employeeId: portal.employee_id }, 'Error fetching portal leaves')
      return reply.send({ ausencias: [], saldos: [] })
    }
  })

  // ── GET /documentos/certificado-laboral ────────────────────
  fastify.get('/documentos/certificado-laboral', { preHandler: [portalGuard] }, async (request, reply) => {
    const portal = request.portalUser!

    try {
      // 1. Fetch employee data (with fallback for ir.rule issues)
      let empResults = await odooAccountingAdapter.searchRead(
        'hr.employee',
        [['id', '=', portal.employee_id]],
        ['name', 'identification_id', 'job_title', 'department_id', 'date_start', 'company_id'],
        { limit: 1 },
      )
      if (empResults.length === 0) {
        const allEmps = await odooAccountingAdapter.searchRead(
          'hr.employee',
          [['active', '=', true]],
          ['id', 'name', 'identification_id', 'job_title', 'department_id', 'date_start', 'company_id'],
          { limit: 0 },
        )
        empResults = (allEmps as Array<Record<string, unknown>>).filter(
          (e) => Number(e.id) === portal.employee_id,
        )
      }
      const emp = empResults[0] as Record<string, unknown> | undefined
      if (!emp) {
        return reply.status(404).send({ error: 'Empleado no encontrado' })
      }

      // 2. Fetch active contract
      const contractResults = await odooAccountingAdapter.searchRead(
        'hr.contract',
        [
          ['employee_id', '=', portal.employee_id],
          ['state', '=', 'open'],
        ],
        ['name', 'wage', 'date_start', 'date_end', 'contract_type_id'],
        { limit: 1, order: 'date_start desc' },
      )
      const contract = contractResults[0] as Record<string, unknown> | undefined
      if (!contract) {
        return reply.status(404).send({ error: 'No se encontro contrato activo' })
      }

      // 3. Fetch company data
      const companyId = Array.isArray(emp.company_id)
        ? (emp.company_id as [number, string])[0]
        : Number(emp.company_id ?? portal.company_id)

      const companyResults = await odooAccountingAdapter.searchRead(
        'res.company',
        [['id', '=', companyId]],
        ['name', 'vat', 'street', 'city', 'logo'],
        { limit: 1 },
      )
      const company = companyResults[0] as Record<string, unknown> | undefined

      // 4. Determine contract type from name or type_id
      const contractName = String(contract.name ?? '').toLowerCase()
      let contractType = 'indefinido'
      if (contractName.includes('plazo fijo') || contractName.includes('plazo_fijo')) {
        contractType = 'plazo_fijo'
      } else if (contractName.includes('obra') || contractName.includes('faena')) {
        contractType = 'obra_faena'
      }

      // 5. Get rep legal (fall back to company name)
      let repLegalName = String(company?.name ?? 'Representante Legal')
      let repLegalRut = String(company?.vat ?? '-')

      // Try to get a more specific rep legal from res.partner
      try {
        const partnerResults = await odooAccountingAdapter.searchRead(
          'res.partner',
          [['company_id', '=', companyId], ['function', 'ilike', 'legal']],
          ['name', 'vat'],
          { limit: 1 },
        )
        const partner = partnerResults[0] as Record<string, unknown> | undefined
        if (partner?.name) {
          repLegalName = String(partner.name)
          repLegalRut = String(partner.vat ?? repLegalRut)
        }
      } catch {
        // Use company defaults
      }

      const today = new Date().toISOString().slice(0, 10)

      // 6. Generate PDF
      const pdfBuffer = await generateCertificadoLaboralPDF({
        company_name: String(company?.name ?? 'Sin empresa'),
        company_rut: String(company?.vat ?? '-'),
        company_address: String(company?.street ?? '-'),
        company_city: String(company?.city ?? '-'),
        company_logo: company?.logo ? String(company.logo) : undefined,
        rep_legal_name: repLegalName,
        rep_legal_rut: repLegalRut,

        employee_name: String(emp.name ?? portal.name),
        employee_rut: String(emp.identification_id ?? portal.rut),
        job_title: String(emp.job_title ?? ''),
        department: Array.isArray(emp.department_id)
          ? String((emp.department_id as [number, string])[1])
          : '',

        contract_type: contractType,
        start_date: String(contract.date_start ?? emp.date_start ?? today),
        wage: Number(contract.wage ?? 0),

        issue_date: today,
      })

      const safeName = String(emp.name ?? portal.name)
        .replace(/[^a-zA-Z0-9\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1\u00c1\u00c9\u00cd\u00d3\u00da\u00d1 ]/g, '')
        .replace(/\s+/g, '-')
      const filename = `certificado-laboral-${safeName}-${today}.pdf`

      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      return reply.send(pdfBuffer)
    } catch (err) {
      logger.error({ err, employeeId: portal.employee_id }, 'Error generating certificado laboral')
      return reply.status(500).send({ error: 'Error al generar certificado laboral' })
    }
  })
}
