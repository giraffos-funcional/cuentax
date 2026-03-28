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
          'l10n_cl_afp_id', 'l10n_cl_isapre_id', 'l10n_cl_health_plan',
          'l10n_cl_isapre_cotizacion_uf', 'l10n_cl_cargas_familiares',
          'l10n_cl_apv_regime', 'l10n_cl_apv_amount',
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
          'l10n_cl_afp_id', 'l10n_cl_isapre_id', 'l10n_cl_health_plan',
          'l10n_cl_isapre_cotizacion_uf', 'l10n_cl_cargas_familiares',
          'l10n_cl_apv_regime', 'l10n_cl_apv_amount',
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

  // ═══════════════════════════════════════════════════════════
  // WRITE OPERATIONS
  // ═══════════════════════════════════════════════════════════

  // ─── Employee Write ─────────────────────────────────────

  async createEmployee(companyId: number, data: Record<string, unknown>) {
    try {
      const values = { ...data, company_id: companyId }
      const id = await odooAccountingAdapter.create('hr.employee', values)
      if (!id) {
        logger.error({ companyId, data }, 'Failed to create employee in Odoo')
        return { success: false, id: 0 }
      }
      logger.info({ id, companyId }, 'Employee created in Odoo')
      return { success: true, id }
    } catch (err) {
      logger.error({ err, companyId }, 'Error creating employee in Odoo')
      return { success: false, id: 0 }
    }
  },

  async updateEmployee(companyId: number, employeeId: number, data: Record<string, unknown>) {
    try {
      const ok = await odooAccountingAdapter.write('hr.employee', [employeeId], data)
      if (!ok) {
        logger.error({ employeeId, companyId }, 'Failed to update employee in Odoo')
        return { success: false }
      }
      logger.info({ employeeId, companyId }, 'Employee updated in Odoo')
      return { success: true }
    } catch (err) {
      logger.error({ err, employeeId, companyId }, 'Error updating employee in Odoo')
      return { success: false }
    }
  },

  async deactivateEmployee(companyId: number, employeeId: number) {
    try {
      const ok = await odooAccountingAdapter.write('hr.employee', [employeeId], { active: false })
      if (!ok) {
        logger.error({ employeeId, companyId }, 'Failed to deactivate employee in Odoo')
        return { success: false }
      }
      logger.info({ employeeId, companyId }, 'Employee deactivated in Odoo')
      return { success: true }
    } catch (err) {
      logger.error({ err, employeeId, companyId }, 'Error deactivating employee in Odoo')
      return { success: false }
    }
  },

  // ─── Contract Write ─────────────────────────────────────

  async createContract(companyId: number, data: Record<string, unknown>) {
    try {
      const values = { ...data, company_id: companyId }
      const id = await odooAccountingAdapter.create('hr.contract', values)
      if (!id) {
        logger.error({ companyId, data }, 'Failed to create contract in Odoo')
        return { success: false, id: 0 }
      }
      logger.info({ id, companyId }, 'Contract created in Odoo')
      return { success: true, id }
    } catch (err) {
      logger.error({ err, companyId }, 'Error creating contract in Odoo')
      return { success: false, id: 0 }
    }
  },

  async updateContract(companyId: number, contractId: number, data: Record<string, unknown>) {
    try {
      const ok = await odooAccountingAdapter.write('hr.contract', [contractId], data)
      if (!ok) {
        logger.error({ contractId, companyId }, 'Failed to update contract in Odoo')
        return { success: false }
      }
      logger.info({ contractId, companyId }, 'Contract updated in Odoo')
      return { success: true }
    } catch (err) {
      logger.error({ err, contractId, companyId }, 'Error updating contract in Odoo')
      return { success: false }
    }
  },

  // ─── Leave Write ────────────────────────────────────────

  async createLeave(companyId: number, data: Record<string, unknown>) {
    try {
      const values = { ...data }
      const id = await odooAccountingAdapter.create('hr.leave', values)
      if (!id) {
        logger.error({ companyId, data }, 'Failed to create leave in Odoo')
        return { success: false, id: 0 }
      }
      logger.info({ id, companyId }, 'Leave created in Odoo')
      return { success: true, id }
    } catch (err) {
      logger.error({ err, companyId }, 'Error creating leave in Odoo')
      return { success: false, id: 0 }
    }
  },

  async approveLeave(leaveId: number) {
    try {
      await odooAccountingAdapter.callMethod('hr.leave', 'action_approve', [leaveId])
      logger.info({ leaveId }, 'Leave approved in Odoo')
      return { success: true }
    } catch (err) {
      logger.error({ err, leaveId }, 'Error approving leave in Odoo')
      return { success: false }
    }
  },

  async refuseLeave(leaveId: number) {
    try {
      await odooAccountingAdapter.callMethod('hr.leave', 'action_refuse', [leaveId])
      logger.info({ leaveId }, 'Leave refused in Odoo')
      return { success: true }
    } catch (err) {
      logger.error({ err, leaveId }, 'Error refusing leave in Odoo')
      return { success: false }
    }
  },

  async cancelLeave(leaveId: number) {
    try {
      // Reset to draft first, then unlink
      await odooAccountingAdapter.callMethod('hr.leave', 'action_draft', [leaveId])
      await odooAccountingAdapter.unlink('hr.leave', [leaveId])
      logger.info({ leaveId }, 'Leave cancelled and deleted in Odoo')
      return { success: true }
    } catch (err) {
      logger.error({ err, leaveId }, 'Error cancelling leave in Odoo')
      return { success: false }
    }
  },

  // ─── Payslip Write ──────────────────────────────────────

  async createPayslip(companyId: number, data: Record<string, unknown>) {
    try {
      const values = { ...data, company_id: companyId }
      const id = await odooAccountingAdapter.create('hr.payslip', values)
      if (!id) {
        logger.error({ companyId, data }, 'Failed to create payslip in Odoo')
        return { success: false, id: 0 }
      }
      logger.info({ id, companyId }, 'Payslip created in Odoo')
      return { success: true, id }
    } catch (err) {
      logger.error({ err, companyId }, 'Error creating payslip in Odoo')
      return { success: false, id: 0 }
    }
  },

  async computePayslip(payslipId: number) {
    try {
      await odooAccountingAdapter.callMethod('hr.payslip', 'compute_sheet', [payslipId])
      logger.info({ payslipId }, 'Payslip computed in Odoo')
      return { success: true }
    } catch (err) {
      logger.error({ err, payslipId }, 'Error computing payslip in Odoo')
      return { success: false }
    }
  },

  async confirmPayslip(payslipId: number) {
    try {
      await odooAccountingAdapter.callMethod('hr.payslip', 'action_payslip_done', [payslipId])
      logger.info({ payslipId }, 'Payslip confirmed in Odoo')
      return { success: true }
    } catch (err) {
      logger.error({ err, payslipId }, 'Error confirming payslip in Odoo')
      return { success: false }
    }
  },

  async cancelPayslip(payslipId: number) {
    try {
      const ok = await odooAccountingAdapter.write('hr.payslip', [payslipId], { state: 'cancel' })
      if (!ok) {
        logger.error({ payslipId }, 'Failed to cancel payslip in Odoo')
        return { success: false }
      }
      logger.info({ payslipId }, 'Payslip cancelled in Odoo')
      return { success: true }
    } catch (err) {
      logger.error({ err, payslipId }, 'Error cancelling payslip in Odoo')
      return { success: false }
    }
  },

  // ─── Payslip Run Write ──────────────────────────────────

  async createPayslipRun(companyId: number, data: Record<string, unknown>) {
    try {
      const values = { ...data, company_id: companyId }
      const id = await odooAccountingAdapter.create('hr.payslip.run', values)
      if (!id) {
        logger.error({ companyId, data }, 'Failed to create payslip run in Odoo')
        return { success: false, id: 0 }
      }
      logger.info({ id, companyId }, 'Payslip run created in Odoo')
      return { success: true, id }
    } catch (err) {
      logger.error({ err, companyId }, 'Error creating payslip run in Odoo')
      return { success: false, id: 0 }
    }
  },

  async generatePayslips(runId: number, companyId: number) {
    try {
      // 1. Get the payslip run to know the date range
      const runs = await odooAccountingAdapter.searchRead(
        'hr.payslip.run',
        [['id', '=', runId]],
        ['date_start', 'date_end'],
        { limit: 1 },
      )
      const run = runs[0] as Record<string, unknown> | undefined
      if (!run) {
        logger.error({ runId }, 'Payslip run not found')
        return { success: false, count: 0 }
      }

      // 2. Find all employees with active contracts (state='open')
      const employees = await odooAccountingAdapter.searchRead(
        'hr.contract',
        [
          ['company_id', '=', companyId],
          ['state', '=', 'open'],
        ],
        ['employee_id'],
        { limit: 1000 },
      )

      if (employees.length === 0) {
        logger.warn({ runId, companyId }, 'No active contracts found for payslip generation')
        return { success: true, count: 0 }
      }

      // 3. Create a payslip for each employee and link to the run
      const payslipIds: number[] = []
      for (const emp of employees) {
        const record = emp as Record<string, unknown>
        const employeeId = Array.isArray(record['employee_id'])
          ? (record['employee_id'][0] as number)
          : (record['employee_id'] as number)

        const payslipId = await odooAccountingAdapter.create('hr.payslip', {
          employee_id: employeeId,
          company_id: companyId,
          date_from: run['date_start'],
          date_to: run['date_end'],
          payslip_run_id: runId,
        })

        if (payslipId) {
          payslipIds.push(payslipId)
        }
      }

      // 4. Compute all created payslips
      if (payslipIds.length > 0) {
        await odooAccountingAdapter.callMethod('hr.payslip', 'compute_sheet', payslipIds)
      }

      logger.info({ runId, companyId, count: payslipIds.length }, 'Payslips generated for run')
      return { success: true, count: payslipIds.length }
    } catch (err) {
      logger.error({ err, runId, companyId }, 'Error generating payslips for run')
      return { success: false, count: 0 }
    }
  },

  async closePayslipRun(runId: number) {
    try {
      const ok = await odooAccountingAdapter.write('hr.payslip.run', [runId], { state: 'close' })
      if (!ok) {
        logger.error({ runId }, 'Failed to close payslip run in Odoo')
        return { success: false }
      }
      logger.info({ runId }, 'Payslip run closed in Odoo')
      return { success: true }
    } catch (err) {
      logger.error({ err, runId }, 'Error closing payslip run in Odoo')
      return { success: false }
    }
  },

  // ─── Attendance Write ───────────────────────────────────

  async createAttendance(companyId: number, data: Record<string, unknown>) {
    try {
      const values = { ...data }
      const id = await odooAccountingAdapter.create('hr.attendance', values)
      if (!id) {
        logger.error({ companyId, data }, 'Failed to create attendance in Odoo')
        return { success: false, id: 0 }
      }
      logger.info({ id, companyId }, 'Attendance created in Odoo')
      return { success: true, id }
    } catch (err) {
      logger.error({ err, companyId }, 'Error creating attendance in Odoo')
      return { success: false, id: 0 }
    }
  },

  async updateAttendance(attendanceId: number, data: Record<string, unknown>) {
    try {
      const ok = await odooAccountingAdapter.write('hr.attendance', [attendanceId], data)
      if (!ok) {
        logger.error({ attendanceId }, 'Failed to update attendance in Odoo')
        return { success: false }
      }
      logger.info({ attendanceId }, 'Attendance updated in Odoo')
      return { success: true }
    } catch (err) {
      logger.error({ err, attendanceId }, 'Error updating attendance in Odoo')
      return { success: false }
    }
  },

  async deleteAttendance(attendanceId: number) {
    try {
      const ok = await odooAccountingAdapter.unlink('hr.attendance', [attendanceId])
      if (!ok) {
        logger.error({ attendanceId }, 'Failed to delete attendance in Odoo')
        return { success: false }
      }
      logger.info({ attendanceId }, 'Attendance deleted in Odoo')
      return { success: true }
    } catch (err) {
      logger.error({ err, attendanceId }, 'Error deleting attendance in Odoo')
      return { success: false }
    }
  },

  // ─── Indicators Write ───────────────────────────────────

  async createIndicators(companyId: number, data: Record<string, unknown>) {
    try {
      const values = { ...data, company_id: companyId }
      const id = await odooAccountingAdapter.create('l10n_cl.indicators', values)
      if (!id) {
        logger.error({ companyId, data }, 'Failed to create indicators in Odoo')
        return { success: false, id: 0 }
      }
      logger.info({ id, companyId }, 'Indicators created in Odoo')
      return { success: true, id }
    } catch (err) {
      logger.error({ err, companyId }, 'Error creating indicators in Odoo')
      return { success: false, id: 0 }
    }
  },

  async updateIndicators(indicatorId: number, data: Record<string, unknown>) {
    try {
      const ok = await odooAccountingAdapter.write('l10n_cl.indicators', [indicatorId], data)
      if (!ok) {
        logger.error({ indicatorId }, 'Failed to update indicators in Odoo')
        return { success: false }
      }
      logger.info({ indicatorId }, 'Indicators updated in Odoo')
      return { success: true }
    } catch (err) {
      logger.error({ err, indicatorId }, 'Error updating indicators in Odoo')
      return { success: false }
    }
  },

  // ─── Attendance (Read) ──────────────────────────────────

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
