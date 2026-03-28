/**
 * CUENTAX — Hooks de Remuneraciones (SWR)
 * Hooks React para consumir el módulo de RRHH vía BFF.
 * Conecta con Odoo HR Payroll para liquidaciones, ausencias,
 * contratos, asistencia y departamentos.
 */
'use client'

import useSWR, { mutate as globalMutate } from 'swr'
import useSWRMutation from 'swr/mutation'
import { apiClient } from '@/lib/api-client'

// ── Fetcher base ───────────────────────────────────────────────
const fetcher = (url: string) => apiClient.get(url).then(r => r.data)

const poster = async (url: string, { arg }: { arg: unknown }) =>
  apiClient.post(url, arg).then(r => r.data)

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

// ══════════════════════════════════════════════════════════════
// CRUD Mutations
// ══════════════════════════════════════════════════════════════

// -- Empleados --

/** Crear empleado */
export function useCreateEmployee() {
  const { trigger, isMutating, error } = useSWRMutation('/api/v1/remuneraciones/empleados', poster)

  const crear = async (payload: unknown) => {
    const result = await trigger(payload)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/remuneraciones/empleados'))
    return result
  }

  return { crear, isLoading: isMutating, error }
}

/** Actualizar empleado */
export function useUpdateEmployee() {
  const update = async (id: number, payload: unknown) => {
    const result = await apiClient.put(`/api/v1/remuneraciones/empleados/${id}`, payload).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/remuneraciones/empleados'))
    return result
  }

  return { update }
}

/** Eliminar empleado */
export function useDeleteEmployee() {
  const remove = async (id: number) => {
    await apiClient.delete(`/api/v1/remuneraciones/empleados/${id}`)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/remuneraciones/empleados'))
  }

  return { remove }
}

// -- Contratos --

/** Crear contrato */
export function useCreateContract() {
  const { trigger, isMutating, error } = useSWRMutation('/api/v1/remuneraciones/contratos', poster)

  const crear = async (payload: unknown) => {
    const result = await trigger(payload)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/remuneraciones/contratos'))
    return result
  }

  return { crear, isLoading: isMutating, error }
}

/** Actualizar contrato */
export function useUpdateContract() {
  const update = async (id: number, payload: unknown) => {
    const result = await apiClient.put(`/api/v1/remuneraciones/contratos/${id}`, payload).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/remuneraciones/contratos'))
    return result
  }

  return { update }
}

/** Cerrar contrato */
export function useCloseContract() {
  const close = async (id: number) => {
    const result = await apiClient.post(`/api/v1/remuneraciones/contratos/${id}/close`).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/remuneraciones/contratos'))
    return result
  }

  return { close }
}

// -- Ausencias --

/** Crear ausencia */
export function useCreateLeave() {
  const { trigger, isMutating, error } = useSWRMutation('/api/v1/remuneraciones/ausencias', poster)

  const crear = async (payload: unknown) => {
    const result = await trigger(payload)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/remuneraciones/ausencias'))
    return result
  }

  return { crear, isLoading: isMutating, error }
}

/** Aprobar ausencia */
export function useApproveLeave() {
  const approve = async (id: number) => {
    const result = await apiClient.put(`/api/v1/remuneraciones/ausencias/${id}/approve`).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/remuneraciones/ausencias'))
    return result
  }

  return { approve }
}

/** Rechazar ausencia */
export function useRefuseLeave() {
  const refuse = async (id: number) => {
    const result = await apiClient.put(`/api/v1/remuneraciones/ausencias/${id}/refuse`).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/remuneraciones/ausencias'))
    return result
  }

  return { refuse }
}

/** Cancelar ausencia */
export function useCancelLeave() {
  const cancel = async (id: number) => {
    await apiClient.delete(`/api/v1/remuneraciones/ausencias/${id}`)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/remuneraciones/ausencias'))
  }

  return { cancel }
}

// -- Liquidaciones --

/** Crear liquidación */
export function useCreatePayslip() {
  const { trigger, isMutating, error } = useSWRMutation('/api/v1/remuneraciones/liquidaciones', poster)

  const crear = async (payload: unknown) => {
    const result = await trigger(payload)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/remuneraciones/liquidaciones'))
    return result
  }

  return { crear, isLoading: isMutating, error }
}

/** Computar liquidación */
export function useComputePayslip() {
  const compute = async (id: number) => {
    const result = await apiClient.post(`/api/v1/remuneraciones/liquidaciones/${id}/compute`).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/remuneraciones/liquidaciones'))
    return result
  }

  return { compute }
}

/** Confirmar liquidación */
export function useConfirmPayslip() {
  const confirm = async (id: number) => {
    const result = await apiClient.post(`/api/v1/remuneraciones/liquidaciones/${id}/confirm`).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/remuneraciones/liquidaciones'))
    return result
  }

  return { confirm }
}

/** Cancelar liquidación */
export function useCancelPayslip() {
  const cancel = async (id: number) => {
    await apiClient.delete(`/api/v1/remuneraciones/liquidaciones/${id}`)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/remuneraciones/liquidaciones'))
  }

  return { cancel }
}

// -- Nominas --

/** Crear nómina */
export function useCreatePayslipRun() {
  const { trigger, isMutating, error } = useSWRMutation('/api/v1/remuneraciones/nominas', poster)

  const crear = async (payload: unknown) => {
    const result = await trigger(payload)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/remuneraciones/nominas'))
    return result
  }

  return { crear, isLoading: isMutating, error }
}

/** Generar liquidaciones de una nómina */
export function useGeneratePayslips() {
  const generate = async (id: number) => {
    const result = await apiClient.post(`/api/v1/remuneraciones/nominas/${id}/generate`).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/remuneraciones/nominas'))
    return result
  }

  return { generate }
}

/** Cerrar nómina */
export function useClosePayslipRun() {
  const close = async (id: number) => {
    const result = await apiClient.post(`/api/v1/remuneraciones/nominas/${id}/close`).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/remuneraciones/nominas'))
    return result
  }

  return { close }
}

// -- Asistencia --

/** Crear registro de asistencia */
export function useCreateAttendance() {
  const { trigger, isMutating, error } = useSWRMutation('/api/v1/remuneraciones/asistencia', poster)

  const crear = async (payload: unknown) => {
    const result = await trigger(payload)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/remuneraciones/asistencia'))
    return result
  }

  return { crear, isLoading: isMutating, error }
}

/** Actualizar registro de asistencia */
export function useUpdateAttendance() {
  const update = async (id: number, payload: unknown) => {
    const result = await apiClient.put(`/api/v1/remuneraciones/asistencia/${id}`, payload).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/remuneraciones/asistencia'))
    return result
  }

  return { update }
}

/** Eliminar registro de asistencia */
export function useDeleteAttendance() {
  const remove = async (id: number) => {
    await apiClient.delete(`/api/v1/remuneraciones/asistencia/${id}`)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/remuneraciones/asistencia'))
  }

  return { remove }
}
