/**
 * CUENTAX — Odoo HR Adapter
 * ==========================
 * Thin wrapper over the existing OdooAccountingAdapter for HR/Payroll models.
 * Delegates all JSON-RPC calls to the singleton odooAccountingAdapter so we
 * reuse auth, caching, and error handling.
 * In case of error, returns arrays vacios / valores por defecto — nunca lanza.
 */

import { odooAccountingAdapter } from '@/adapters/odoo-accounting.adapter'
import { logger } from '@/core/logger'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build date range strings for a given year/month.
 * Returns { desde, hasta } in YYYY-MM-DD format.
 */
function dateRange(year: number, month: number): { desde: string; hasta: string } {
  const monthStr = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  const desde = `${year}-${monthStr}-01`
  const hasta = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`
  return { desde, hasta }
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const odooHRAdapter = {
  // ─── Employees ────────────────────────────────────────────

  async getEmployees(
    companyId: number,
    search?: string,
    departmentId?: number,
    page = 1,
    limit = 50,
  ) {
    const offset = (page - 1) * limit
    const domain: unknown[][] = [
      ['company_id', '=', companyId],
      ['active', '=', true],
    ]

    if (departmentId) {
      domain.push(['department_id', '=', departmentId])
    }
    if (search) {
      domain.push('|' as any, ['name', 'ilike', search], ['work_email', 'ilike', search])
    }

    try {
      const employees = await odooAccountingAdapter.searchRead(
        'hr.employee',
        domain,
        [
          'name', 'job_title', 'department_id', 'work_email', 'work_phone',
          'identification_id', 'company_id', 'resource_calendar_id',
          'parent_id', 'coach_id', 'contract_id', 'image_128',
          'active', 'marital', 'birthday',
        ],
        { limit, offset, order: 'name asc' },
      )

      return employees
    } catch (err) {
      logger.error({ err, companyId }, 'Error fetching employees from Odoo')
      return []
    }
  },

  async getEmployee(companyId: number, employeeId: number) {
    try {
      const rows = await odooAccountingAdapter.searchRead(
        'hr.employee',
        [
          ['company_id', '=', companyId],
          ['id', '=', employeeId],
        ],
        [
          'name', 'job_title', 'department_id', 'work_email', 'work_phone',
          'identification_id', 'company_id', 'resource_calendar_id',
          'parent_id', 'coach_id', 'contract_id', 'image_128',
          'active', 'marital', 'birthday',
        ],
        { limit: 1 },
      )
      return rows[0] ?? null
    } catch (err) {
      logger.error({ err, companyId, employeeId }, 'Error fetching employee from Odoo')
      return null
    }
  },

  // ─── Payslips (Liquidaciones) ─────────────────────────────

  async getPayslips(
    companyId: number,
    employeeId?: number,
    mes?: number,
    year?: number,
    page = 1,
    limit = 50,
  ) {
    const offset = (page - 1) * limit
    const domain: unknown[][] = [['company_id', '=', companyId]]

    if (employeeId) {
      domain.push(['employee_id', '=', employeeId])
    }
    if (mes && year) {
      const { desde, hasta } = dateRange(year, mes)
      domain.push(['date_from', '>=', desde], ['date_to', '<=', hasta])
    } else if (year) {
      domain.push(
        ['date_from', '>=', `${year}-01-01`],
        ['date_to', '<=', `${year}-12-31`],
      )
    }

    try {
      const payslips = await odooAccountingAdapter.searchRead(
        'hr.payslip',
        domain,
        [
          'number', 'name', 'employee_id', 'date_from', 'date_to',
          'company_id', 'state', 'struct_id', 'net_wage', 'basic_wage',
          'gross_wage', 'line_ids',
        ],
        { limit, offset, order: 'date_from desc' },
      )

      return payslips
    } catch (err) {
      logger.error({ err, companyId }, 'Error fetching payslips from Odoo')
      return []
    }
  },

  // ─── Payslip Lines (Detalle de liquidacion) ───────────────

  async getPayslipLines(payslipId: number) {
    try {
      const lines = await odooAccountingAdapter.searchRead(
        'hr.payslip.line',
        [['slip_id', '=', payslipId]],
        [
          'name', 'code', 'category_id', 'quantity', 'rate',
          'amount', 'total', 'sequence',
        ],
        { order: 'sequence asc' },
      )

      return lines
    } catch (err) {
      logger.error({ err, payslipId }, 'Error fetching payslip lines from Odoo')
      return []
    }
  },

  // ─── Payslip Runs (Nominas / Batches) ─────────────────────

  async getPayslipRuns(
    companyId: number,
    mes?: number,
    year?: number,
    page = 1,
    limit = 50,
  ) {
    const offset = (page - 1) * limit
    const domain: unknown[][] = [['company_id', '=', companyId]]

    if (mes && year) {
      const { desde, hasta } = dateRange(year, mes)
      domain.push(['date_start', '>=', desde], ['date_end', '<=', hasta])
    } else if (year) {
      domain.push(
        ['date_start', '>=', `${year}-01-01`],
        ['date_end', '<=', `${year}-12-31`],
      )
    }

    try {
      const runs = await odooAccountingAdapter.searchRead(
        'hr.payslip.run',
        domain,
        ['name', 'date_start', 'date_end', 'state', 'slip_ids', 'company_id'],
        { limit, offset, order: 'date_start desc' },
      )

      return runs
    } catch (err) {
      logger.error({ err, companyId }, 'Error fetching payslip runs from Odoo')
      return []
    }
  },

  // ─── Leaves (Ausencias) ───────────────────────────────────

  async getLeaves(
    companyId: number,
    employeeId?: number,
    state?: string,
    mes?: number,
    year?: number,
    page = 1,
    limit = 50,
  ) {
    const offset = (page - 1) * limit
    const domain: unknown[][] = [['employee_company_id', '=', companyId]]

    if (employeeId) {
      domain.push(['employee_id', '=', employeeId])
    }
    if (state) {
      domain.push(['state', '=', state])
    }
    if (mes && year) {
      const { desde, hasta } = dateRange(year, mes)
      domain.push(['date_from', '>=', desde], ['date_to', '<=', hasta])
    } else if (year) {
      domain.push(
        ['date_from', '>=', `${year}-01-01`],
        ['date_to', '<=', `${year}-12-31`],
      )
    }

    try {
      const leaves = await odooAccountingAdapter.searchRead(
        'hr.leave',
        domain,
        [
          'employee_id', 'holiday_status_id', 'date_from', 'date_to',
          'number_of_days', 'state', 'name', 'request_date_from', 'request_date_to',
        ],
        { limit, offset, order: 'date_from desc' },
      )

      return leaves
    } catch (err) {
      logger.error({ err, companyId }, 'Error fetching leaves from Odoo')
      return []
    }
  },

  // ─── Leave Allocations ────────────────────────────────────

  async getLeaveAllocations(companyId: number, employeeId?: number) {
    const domain: unknown[][] = [['employee_company_id', '=', companyId]]

    if (employeeId) {
      domain.push(['employee_id', '=', employeeId])
    }

    try {
      const allocations = await odooAccountingAdapter.searchRead(
        'hr.leave.allocation',
        domain,
        ['employee_id', 'holiday_status_id', 'number_of_days', 'state'],
        { order: 'employee_id asc' },
      )

      return allocations
    } catch (err) {
      logger.error({ err, companyId }, 'Error fetching leave allocations from Odoo')
      return []
    }
  },

  // ─── Leave Types ──────────────────────────────────────────

  async getLeaveTypes(companyId: number) {
    try {
      const types = await odooAccountingAdapter.searchRead(
        'hr.leave.type',
        [['company_id', 'in', [companyId, false]]],
        ['name', 'requires_allocation', 'allocation_type'],
        { order: 'name asc' },
      )

      return types
    } catch (err) {
      logger.error({ err, companyId }, 'Error fetching leave types from Odoo')
      return []
    }
  },

  // ─── Departments ──────────────────────────────────────────

  async getDepartments(companyId: number) {
    try {
      const departments = await odooAccountingAdapter.searchRead(
        'hr.department',
        [['company_id', 'in', [companyId, false]]],
        ['name', 'complete_name', 'parent_id', 'manager_id', 'total_employee'],
        { order: 'complete_name asc' },
      )

      return departments
    } catch (err) {
      logger.error({ err, companyId }, 'Error fetching departments from Odoo')
      return []
    }
  },

  // ─── Contracts ────────────────────────────────────────────

  async getContracts(companyId: number, employeeId?: number, state?: string) {
    const domain: unknown[][] = [['company_id', '=', companyId]]

    if (employeeId) {
      domain.push(['employee_id', '=', employeeId])
    }
    if (state) {
      domain.push(['state', '=', state])
    }

    try {
      const contracts = await odooAccountingAdapter.searchRead(
        'hr.contract',
        domain,
        [
          'name', 'employee_id', 'department_id', 'job_id', 'wage',
          'date_start', 'date_end', 'state', 'struct_id',
        ],
        { order: 'date_start desc' },
      )

      return contracts
    } catch (err) {
      logger.error({ err, companyId }, 'Error fetching contracts from Odoo')
      return []
    }
  },

  // ─── HR Dashboard Stats ───────────────────────────────────

  async getHRStats(companyId: number, year: number, month: number) {
    const { desde, hasta } = dateRange(year, month)

    try {
      const [
        totalEmployees,
        totalDepartments,
        payrollRows,
        leavesThisMonth,
        pendingLeaves,
      ] = await Promise.all([
        // Total active employees (search_count instead of fetching records)
        odooAccountingAdapter.searchCount(
          'hr.employee',
          [['company_id', '=', companyId], ['active', '=', true]],
        ),
        // Total departments (search_count instead of fetching records)
        odooAccountingAdapter.searchCount(
          'hr.department',
          [['company_id', 'in', [companyId, false]]],
        ),
        // Payroll total for the month (sum net_wage)
        odooAccountingAdapter.readGroup(
          'hr.payslip',
          [
            ['company_id', '=', companyId],
            ['state', '=', 'done'],
            ['date_from', '>=', desde],
            ['date_to', '<=', hasta],
          ],
          ['net_wage:sum'],
          [],
        ),
        // Leaves this month (approved) — use employee_company_id for Odoo 18
        odooAccountingAdapter.searchCount(
          'hr.leave',
          [
            ['employee_company_id', '=', companyId],
            ['date_from', '>=', desde],
            ['date_to', '<=', hasta],
            ['state', '=', 'validate'],
          ],
        ),
        // Pending leaves (any date) — use employee_company_id for Odoo 18
        odooAccountingAdapter.searchCount(
          'hr.leave',
          [
            ['employee_company_id', '=', companyId],
            ['state', 'in', ['confirm', 'validate1']],
          ],
        ),
      ])

      const payrollRow = (payrollRows[0] ?? {}) as Record<string, unknown>
      const payrollTotal = (payrollRow['net_wage'] as number) ?? 0

      return {
        total_employees: totalEmployees,
        total_departments: totalDepartments,
        payroll_total: payrollTotal,
        leaves_this_month: leavesThisMonth,
        pending_leaves: pendingLeaves,
      }
    } catch (err) {
      logger.error({ err, companyId }, 'Error fetching HR stats from Odoo')
      return {
        total_employees: 0,
        total_departments: 0,
        payroll_total: 0,
        leaves_this_month: 0,
        pending_leaves: 0,
      }
    }
  },

  // ─── Attendance ───────────────────────────────────────────

  async getAttendance(
    companyId: number,
    employeeId?: number,
    mes?: number,
    year?: number,
    page = 1,
    limit = 50,
  ) {
    const offset = (page - 1) * limit
    const domain: unknown[][] = [['employee_id.company_id', '=', companyId]]

    if (employeeId) {
      domain.push(['employee_id', '=', employeeId])
    }
    if (mes && year) {
      const { desde, hasta } = dateRange(year, mes)
      domain.push(['check_in', '>=', desde], ['check_in', '<=', `${hasta} 23:59:59`])
    } else if (year) {
      domain.push(
        ['check_in', '>=', `${year}-01-01`],
        ['check_in', '<=', `${year}-12-31 23:59:59`],
      )
    }

    try {
      const attendance = await odooAccountingAdapter.searchRead(
        'hr.attendance',
        domain,
        ['employee_id', 'check_in', 'check_out', 'worked_hours'],
        { limit, offset, order: 'check_in desc' },
      )

      return attendance
    } catch (err) {
      logger.error({ err, companyId }, 'Error fetching attendance from Odoo')
      return []
    }
  },
}
