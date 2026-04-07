/**
 * CUENTAX — Portal del Trabajador Hooks (SWR)
 * React hooks for the employee self-service portal.
 * All requests go through /api/v1/portal/* with portal JWT auth.
 */
'use client'

import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'
import axios from 'axios'
import { usePortalAuthStore } from '@/stores/portal-auth.store'

// ── Portal API Client ─────────────────────────────────────────
const BFF_URL = process.env['NEXT_PUBLIC_BFF_URL'] ?? 'http://localhost:4000'

const portalApi = axios.create({
  baseURL: BFF_URL,
  withCredentials: false, // Portal does not use HttpOnly cookies
})

// Inject portal access token on every request
portalApi.interceptors.request.use((config) => {
  const token = usePortalAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle 401 — redirect to portal login
portalApi.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      usePortalAuthStore.getState().clearAuth()
      if (typeof window !== 'undefined') {
        window.location.href = '/portal/login'
      }
    }
    return Promise.reject(error)
  },
)

// ── Fetcher ───────────────────────────────────────────────────
const portalFetcher = (url: string) => portalApi.get(url).then((r) => r.data)

// ── Types ─────────────────────────────────────────────────────

interface PortalProfile {
  employee: {
    id: number
    name: string
    rut: string
    job_title: string
    department: string
    work_email: string
    work_phone: string
    date_start: string
    afp: string
    health_plan: string
    isapre: string
    image_128: string | null
  }
}

interface PortalPayslip {
  id: number
  number: string
  name: string
  date_from: string
  date_to: string
  state: string
  net_wage: number
  gross_wage: number
  basic_wage: number
  period_label: string
}

interface PortalPayslipLine {
  id: number
  code: string
  name: string
  category: string
  quantity: number
  rate: number
  amount: number
  total: number
}

interface PortalPayslipDetail {
  liquidacion: {
    id: number
    number: string
    name: string
    date_from: string
    date_to: string
    state: string
    net_wage: number
    gross_wage: number
    basic_wage: number
    period_label: string
  }
  haberes: PortalPayslipLine[]
  descuentos: PortalPayslipLine[]
  totals: {
    total_haberes: number
    total_descuentos: number
    total_pagar: number
  }
}

interface PortalContract {
  id: number
  name: string
  state: string
  date_start: string
  date_end: string | null
  wage: number
  job: string
  department: string
  structure: string
}

interface PortalContractResponse {
  contrato_activo: PortalContract | null
  historicos: PortalContract[]
}

interface AttendanceRecord {
  id: number
  check_in: string
  check_out: string | null
  worked_hours: number
}

interface PortalAttendanceResponse {
  asistencia: AttendanceRecord[]
  resumen: {
    total_horas: number
    dias_trabajados: number
    periodo: string
  }
  total: number
  page: number
  limit: number
}

interface PortalLeave {
  id: number
  type: string
  date_from: string
  date_to: string
  days: number
  state: string
  description: string
}

interface LeaveBalance {
  type: string
  allocated: number
  taken: number
  remaining: number
}

interface PortalLeavesResponse {
  ausencias: PortalLeave[]
  saldos: LeaveBalance[]
}

// ── Login Mutation ────────────────────────────────────────────
export function usePortalLogin() {
  const setAuth = usePortalAuthStore((s) => s.setAuth)

  const { trigger, isMutating, error } = useSWRMutation(
    '/api/v1/portal/login',
    async (url: string, { arg }: { arg: { rut: string; pin: string } }) => {
      const res = await portalApi.post(url, arg)
      return res.data
    },
  )

  const login = async (rut: string, pin: string) => {
    const data = await trigger({ rut, pin })
    if (data?.access_token && data?.employee) {
      setAuth(
        {
          id: data.employee.id,
          name: data.employee.name,
          rut: data.employee.rut,
          job_title: data.employee.job_title,
          department: data.employee.department,
        },
        data.access_token,
      )
    }
    return data
  }

  return { login, isLoading: isMutating, error }
}

// ── Profile ───────────────────────────────────────────────────
export function usePortalProfile() {
  const isAuthenticated = usePortalAuthStore((s) => s.isAuthenticated)
  const { data, error, isLoading } = useSWR<PortalProfile>(
    isAuthenticated ? '/api/v1/portal/me' : null,
    portalFetcher,
    { revalidateOnFocus: false },
  )
  return { profile: data?.employee ?? null, isLoading, error }
}

// ── Payslips List ─────────────────────────────────────────────
export function usePortalPayslips(year?: number) {
  const isAuthenticated = usePortalAuthStore((s) => s.isAuthenticated)
  const currentYear = year ?? new Date().getFullYear()
  const params = new URLSearchParams({ year: String(currentYear) })

  const { data, error, isLoading } = useSWR<{
    liquidaciones: PortalPayslip[]
    total: number
  }>(
    isAuthenticated ? `/api/v1/portal/liquidaciones?${params}` : null,
    portalFetcher,
    { revalidateOnFocus: false },
  )

  return {
    liquidaciones: data?.liquidaciones ?? [],
    total: data?.total ?? 0,
    isLoading,
    error,
  }
}

// ── Payslip Detail ────────────────────────────────────────────
export function usePortalPayslipDetail(id: number | null) {
  const isAuthenticated = usePortalAuthStore((s) => s.isAuthenticated)

  const { data, error, isLoading } = useSWR<PortalPayslipDetail>(
    isAuthenticated && id ? `/api/v1/portal/liquidaciones/${id}` : null,
    portalFetcher,
    { revalidateOnFocus: false },
  )

  return { data: data ?? null, isLoading, error }
}

// ── Contract ──────────────────────────────────────────────────
export function usePortalContract() {
  const isAuthenticated = usePortalAuthStore((s) => s.isAuthenticated)

  const { data, error, isLoading } = useSWR<PortalContractResponse>(
    isAuthenticated ? '/api/v1/portal/contrato' : null,
    portalFetcher,
    { revalidateOnFocus: false },
  )

  return {
    contratoActivo: data?.contrato_activo ?? null,
    historicos: data?.historicos ?? [],
    isLoading,
    error,
  }
}

// ── Attendance ────────────────────────────────────────────────
export function usePortalAttendance(mes?: number, year?: number) {
  const isAuthenticated = usePortalAuthStore((s) => s.isAuthenticated)
  const now = new Date()
  const m = mes ?? (now.getMonth() + 1)
  const y = year ?? now.getFullYear()
  const params = new URLSearchParams({ mes: String(m), year: String(y) })

  const { data, error, isLoading } = useSWR<PortalAttendanceResponse>(
    isAuthenticated ? `/api/v1/portal/asistencia?${params}` : null,
    portalFetcher,
    { revalidateOnFocus: false },
  )

  return {
    asistencia: data?.asistencia ?? [],
    resumen: data?.resumen ?? { total_horas: 0, dias_trabajados: 0, periodo: '' },
    total: data?.total ?? 0,
    isLoading,
    error,
  }
}

// ── Leaves ────────────────────────────────────────────────────
export function usePortalLeaves() {
  const isAuthenticated = usePortalAuthStore((s) => s.isAuthenticated)

  const { data, error, isLoading } = useSWR<PortalLeavesResponse>(
    isAuthenticated ? '/api/v1/portal/ausencias' : null,
    portalFetcher,
    { revalidateOnFocus: false },
  )

  return {
    ausencias: data?.ausencias ?? [],
    saldos: data?.saldos ?? [],
    isLoading,
    error,
  }
}

// ── PDF Download Helper ───────────────────────────────────────
export async function downloadPortalPayslipPDF(
  payslipId: number,
  periodLabel?: string,
  employeeName?: string,
): Promise<void> {
  const token = usePortalAuthStore.getState().accessToken
  if (!token) {
    window.location.href = '/portal/login'
    return
  }

  const response = await portalApi.get(`/api/v1/portal/liquidaciones/${payslipId}/pdf`, {
    responseType: 'blob',
  })

  const contentDisposition = response.headers['content-disposition'] ?? ''
  const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/)
  let filename = filenameMatch?.[1] ?? ''
  if (!filename && periodLabel) {
    const safe = (s: string) => s.replace(/[^a-zA-Z0-9\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1 ]/g, '').replace(/\s+/g, '-')
    filename = `liquidacion-${safe(periodLabel)}${employeeName ? `-${safe(employeeName)}` : ''}.pdf`
  }
  if (!filename) filename = `liquidacion-${payslipId}.pdf`

  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

// ── Document Download Helpers ────────────────────────────────────
export async function downloadCertificadoLaboral(): Promise<void> {
  const token = usePortalAuthStore.getState().accessToken
  if (!token) {
    window.location.href = '/portal/login'
    return
  }

  const response = await portalApi.get('/api/v1/portal/documentos/certificado-laboral', {
    responseType: 'blob',
  })

  const contentDisposition = response.headers['content-disposition'] ?? ''
  const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/)
  const filename = filenameMatch?.[1] ?? 'certificado-laboral.pdf'

  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
