/**
 * CUENTAX — Hooks de Remuneraciones (SWR)
 * Hooks React para consumir el módulo de RRHH vía BFF.
 * Conecta con Odoo HR Payroll para liquidaciones, ausencias,
 * contratos, asistencia y departamentos.
 */
'use client'

import useSWR from 'swr'
import { apiClient } from '@/lib/api-client'

// ── Fetcher base ───────────────────────────────────────────────
const fetcher = (url: string) => apiClient.get(url).then(r => r.data)

// ── Types ──────────────────────────────────────────────────────

interface HRStats {
  total_employees: number
  total_departments: number
  payroll_total: number
  leaves_this_month: number
  pending_leaves: number
}

interface Employee {
  id: number
  name: string
  department_id: number
  department_name: string
  job_title: string
  work_email: string
  work_phone: string
  image_url?: string
  state: string
}

interface EmployeeDetail extends Employee {
  identification_id: string
  birthday: string
  address: string
  contract_id: number
  contract_state: string
  wage: number
  date_start: string
}

interface Payslip {
  id: number
  employee_id: number
  employee_name: string
  number: string
  date_from: string
  date_to: string
  state: string
  net_wage: number
  gross_wage: number
  struct_id: number
}

interface PayslipLine {
  id: number
  name: string
  code: string
  category: string
  quantity: number
  rate: number
  amount: number
}

interface PayslipDetail extends Payslip {
  company_id: number
  company_name: string
  contract_id: number
  struct_name: string
}

interface PayslipRun {
  id: number
  name: string
  date_start: string
  date_end: string
  state: string
  slip_ids: number[]
  total_amount: number
}

interface PayslipRunDetail extends PayslipRun {
  company_id: number
  company_name: string
}

interface Leave {
  id: number
  employee_id: number
  employee_name: string
  holiday_status_id: number
  holiday_status_name: string
  date_from: string
  date_to: string
  number_of_days: number
  state: string
  name: string
}

interface LeaveType {
  id: number
  name: string
  allocation_type: string
  max_leaves: number
  leaves_taken: number
  remaining_leaves: number
}

interface LeaveAllocation {
  id: number
  employee_id: number
  employee_name: string
  holiday_status_id: number
  holiday_status_name: string
  number_of_days: number
  state: string
  date_from: string
  date_to: string
}

interface Department {
  id: number
  name: string
  manager_id: number
  manager_name: string
  total_employees: number
}

interface Contract {
  id: number
  employee_id: number
  employee_name: string
  name: string
  state: string
  date_start: string
  date_end?: string
  wage: number
  structure_type_id: number
  structure_type_name: string
}

interface AttendanceRecord {
  id: number
  employee_id: number
  employee_name: string
  check_in: string
  check_out?: string
  worked_hours: number
}

// ══════════════════════════════════════════════════════════════
// Remuneraciones Hooks (Odoo HR via BFF)
// ══════════════════════════════════════════════════════════════

/** Estadísticas del dashboard de RRHH para un mes/año dado */
export function useHRStats(year: number, month: number) {
  const params = new URLSearchParams({
    year: String(year),
    mes: String(month),
  })
  const { data, error, isLoading } = useSWR(
    `/api/v1/remuneraciones/stats?${params}`,
    fetcher,
    { refreshInterval: 120_000 },
  )
  return {
    stats: (data as HRStats) ?? null,
    isLoading,
    error,
  }
}

/** Lista de empleados con búsqueda y filtro por departamento */
export function useEmployees(search?: string, departmentId?: number, page?: number) {
  const params = new URLSearchParams()
  if (search)       params.set('search', search)
  if (departmentId) params.set('department_id', String(departmentId))
  if (page)         params.set('page', String(page))

  const { data, error, isLoading } = useSWR(
    `/api/v1/remuneraciones/empleados?${params}`,
    fetcher,
    { refreshInterval: 60_000 },
  )
  return {
    empleados: (data?.empleados as Employee[]) ?? [],
    total:     data?.total ?? 0,
    isLoading,
    error,
  }
}

/** Detalle de un empleado por ID (condicional: null = no fetch) */
export function useEmployee(id: number | null) {
  const { data, error, isLoading } = useSWR(
    id ? `/api/v1/remuneraciones/empleados/${id}` : null,
    fetcher,
  )
  return {
    empleado: (data as EmployeeDetail) ?? null,
    isLoading,
    error,
  }
}

/** Liquidaciones de sueldo con filtros opcionales */
export function usePayslips(filters?: {
  employee_id?: number
  mes?: number
  year?: number
  page?: number
}) {
  const params = new URLSearchParams()
  if (filters?.employee_id) params.set('employee_id', String(filters.employee_id))
  if (filters?.mes)         params.set('mes', String(filters.mes))
  if (filters?.year)        params.set('year', String(filters.year))
  if (filters?.page)        params.set('page', String(filters.page))

  const { data, error, isLoading } = useSWR(
    `/api/v1/remuneraciones/liquidaciones?${params}`,
    fetcher,
    { refreshInterval: 60_000 },
  )
  return {
    liquidaciones: (data?.liquidaciones as Payslip[]) ?? [],
    total:         data?.total ?? 0,
    isLoading,
    error,
  }
}

/** Detalle de una liquidación con sus líneas (condicional) */
export function usePayslipDetail(id: number | null) {
  const { data, error, isLoading } = useSWR(
    id ? `/api/v1/remuneraciones/liquidaciones/${id}` : null,
    fetcher,
  )
  return {
    liquidacion: (data?.liquidacion as PayslipDetail) ?? null,
    lineas:      (data?.lineas as PayslipLine[]) ?? [],
    isLoading,
    error,
  }
}

/** Nóminas (lotes mensuales de liquidaciones) */
export function usePayslipRuns(mes?: number, year?: number, page?: number) {
  const params = new URLSearchParams()
  if (mes)  params.set('mes', String(mes))
  if (year) params.set('year', String(year))
  if (page) params.set('page', String(page))

  const { data, error, isLoading } = useSWR(
    `/api/v1/remuneraciones/nominas?${params}`,
    fetcher,
    { refreshInterval: 60_000 },
  )
  return {
    nominas: (data?.nominas as PayslipRun[]) ?? [],
    total:   data?.total ?? 0,
    isLoading,
    error,
  }
}

/** Detalle de una nómina con sus liquidaciones (condicional) */
export function usePayslipRunDetail(id: number | null) {
  const { data, error, isLoading } = useSWR(
    id ? `/api/v1/remuneraciones/nominas/${id}` : null,
    fetcher,
  )
  return {
    nomina:        (data?.nomina as PayslipRunDetail) ?? null,
    liquidaciones: (data?.liquidaciones as Payslip[]) ?? [],
    isLoading,
    error,
  }
}

/** Ausencias (licencias) con filtros opcionales */
export function useLeaves(filters?: {
  employee_id?: number
  state?: string
  mes?: number
  year?: number
  page?: number
}) {
  const params = new URLSearchParams()
  if (filters?.employee_id) params.set('employee_id', String(filters.employee_id))
  if (filters?.state)       params.set('state', filters.state)
  if (filters?.mes)         params.set('mes', String(filters.mes))
  if (filters?.year)        params.set('year', String(filters.year))
  if (filters?.page)        params.set('page', String(filters.page))

  const { data, error, isLoading } = useSWR(
    `/api/v1/remuneraciones/ausencias?${params}`,
    fetcher,
    { refreshInterval: 60_000 },
  )
  return {
    ausencias: (data?.ausencias as Leave[]) ?? [],
    total:     data?.total ?? 0,
    isLoading,
    error,
  }
}

/** Tipos de ausencia disponibles */
export function useLeaveTypes() {
  const { data, error, isLoading } = useSWR(
    '/api/v1/remuneraciones/ausencias/tipos',
    fetcher,
  )
  return {
    tipos: (data?.tipos as LeaveType[]) ?? [],
    isLoading,
    error,
  }
}

/** Asignaciones de ausencias por empleado */
export function useLeaveAllocations(employeeId?: number) {
  const params = new URLSearchParams()
  if (employeeId) params.set('employee_id', String(employeeId))

  const { data, error, isLoading } = useSWR(
    `/api/v1/remuneraciones/ausencias/asignaciones?${params}`,
    fetcher,
  )
  return {
    asignaciones: (data?.asignaciones as LeaveAllocation[]) ?? [],
    isLoading,
    error,
  }
}

/** Lista de departamentos de la empresa */
export function useDepartments() {
  const { data, error, isLoading } = useSWR(
    '/api/v1/remuneraciones/departamentos',
    fetcher,
  )
  return {
    departamentos: (data?.departamentos as Department[]) ?? [],
    isLoading,
    error,
  }
}

/** Contratos de trabajo con filtros opcionales */
export function useContracts(employeeId?: number, state?: string) {
  const params = new URLSearchParams()
  if (employeeId) params.set('employee_id', String(employeeId))
  if (state)      params.set('state', state)

  const { data, error, isLoading } = useSWR(
    `/api/v1/remuneraciones/contratos?${params}`,
    fetcher,
    { refreshInterval: 60_000 },
  )
  return {
    contratos: (data?.contratos as Contract[]) ?? [],
    total:     data?.total ?? 0,
    isLoading,
    error,
  }
}

/** Registros de asistencia por empleado y período */
export function useAttendance(employeeId?: number, mes?: number, year?: number) {
  const params = new URLSearchParams()
  if (employeeId) params.set('employee_id', String(employeeId))
  if (mes)        params.set('mes', String(mes))
  if (year)       params.set('year', String(year))

  const { data, error, isLoading } = useSWR(
    `/api/v1/remuneraciones/asistencia?${params}`,
    fetcher,
    { refreshInterval: 60_000 },
  )
  return {
    registros: (data?.asistencia as AttendanceRecord[]) ?? [],
    total:     data?.total ?? 0,
    isLoading,
    error,
  }
}

// ══════════════════════════════════════════════════════════════
// Indicadores Económicos
// ══════════════════════════════════════════════════════════════

/** Indicadores del mes actual (UF, UTM, IMM, topes) */
export function useIndicators(month?: number, year?: number) {
  const params = new URLSearchParams()
  if (month) params.set('month', String(month))
  if (year) params.set('year', String(year))
  const { data, error, isLoading, mutate } = useSWR(
    `/api/v1/indicators/current?${params}`,
    fetcher,
    { refreshInterval: 120_000 },
  )
  return {
    indicators: data?.indicators ?? null,
    isLoading,
    error,
    refresh: mutate,
  }
}
