/**
 * CUENTAX — Custom Hooks (SWR)
 * Hooks React para consumir el BFF.
 * Reemplazan el mock data de todas las páginas.
 */
'use client'

import useSWR, { mutate as globalMutate } from 'swr'
import useSWRMutation from 'swr/mutation'
import { apiClient } from '@/lib/api-client'

// ── Fetcher base ───────────────────────────────────────────────
const fetcher = (url: string) => apiClient.get(url).then(r => r.data)

const poster = async (url: string, { arg }: { arg: unknown }) =>
  apiClient.post(url, arg).then(r => r.data)

// ══════════════════════════════════════════════════════════════
// DTE Hooks
// ══════════════════════════════════════════════════════════════

/** Lista DTEs de la empresa activa */
export function useDTEs(filters?: {
  status?: string
  tipo_dte?: number
  desde?: string
  hasta?: string
  page?: number
}) {
  const params = new URLSearchParams()
  if (filters?.status)   params.set('status',   filters.status)
  if (filters?.tipo_dte) params.set('tipo_dte', String(filters.tipo_dte))
  if (filters?.desde)    params.set('desde',    filters.desde)
  if (filters?.hasta)    params.set('hasta',    filters.hasta)
  if (filters?.page)     params.set('page',     String(filters.page))

  const url = `/api/v1/dte?${params.toString()}`
  const { data, error, isLoading } = useSWR(url, fetcher, { refreshInterval: 30_000 })

  return {
    documentos: data?.data ?? [],
    total:      data?.total ?? 0,
    isLoading,
    error,
  }
}

/** Emite un DTE al SII */
export function useEmitirDTE() {
  const { trigger, isMutating, error, data } = useSWRMutation('/api/v1/dte/emitir', poster)

  const emitir = async (payload: unknown) => {
    const result = await trigger(payload)
    // Invalidar lista de DTEs
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/dte'))
    return result
  }

  return { emitir, isLoading: isMutating, error, result: data }
}

/** Consulta estado de un DTE en el SII */
export function useDTEStatus(trackId: string | null) {
  const { data, error, isLoading } = useSWR(
    trackId ? `/api/v1/dte/${trackId}/status` : null,
    fetcher,
    { refreshInterval: 15_000 }, // Poll cada 15s
  )
  return { status: data, isLoading, error }
}

// ══════════════════════════════════════════════════════════════
// Reporting Hooks (Odoo Accounting)
// ══════════════════════════════════════════════════════════════

/** Libro de Compras/Ventas */
export function useLCV(mes: number, year: number, libro: 'ventas' | 'compras') {
  const params = new URLSearchParams({
    mes: String(mes),
    year: String(year),
    libro,
  })
  const { data, error, isLoading } = useSWR(`/api/v1/reportes/lcv?${params}`, fetcher, {
    refreshInterval: 120_000,
  })
  return {
    registros: data?.registros ?? [],
    totales: data?.totales ?? { neto: 0, iva: 0, total: 0 },
    source: data?.source ?? 'unknown',
    isLoading,
    error,
  }
}

/** Formulario 29 — Declaración mensual de IVA */
export function useF29(mes: number, year: number) {
  const { data, error, isLoading } = useSWR(
    `/api/v1/reportes/f29?mes=${mes}&year=${year}`,
    fetcher,
    { refreshInterval: 120_000 },
  )
  return {
    f29: data?.f29 ?? null,
    source: data?.source ?? 'unknown',
    nota: data?.nota,
    isLoading,
    error,
  }
}

/** Dashboard stats — monthly overview */
export function useStats() {
  const { data, error, isLoading } = useSWR('/api/v1/reportes/stats', fetcher, {
    refreshInterval: 60_000,
  })
  return {
    stats: data ?? null,
    source: data?.source ?? 'unknown',
    isLoading,
    error,
  }
}

// ══════════════════════════════════════════════════════════════
// Accounting Hooks (Odoo Contabilidad)
// ══════════════════════════════════════════════════════════════

/** Plan de Cuentas */
export function useChartOfAccounts(search?: string, type?: string) {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  if (type) params.set('type', type)
  const { data, error, isLoading } = useSWR(`/api/v1/contabilidad/plan-cuentas?${params}`, fetcher)
  return { cuentas: data?.cuentas ?? [], total: data?.total ?? 0, isLoading, error }
}

/** Libro Diario — asientos contables */
export function useJournalEntries(mes: number, year: number, journal?: string, state?: string) {
  const params = new URLSearchParams({ mes: String(mes), year: String(year) })
  if (journal) params.set('journal', journal)
  if (state) params.set('state', state)
  const { data, error, isLoading } = useSWR(`/api/v1/contabilidad/libro-diario?${params}`, fetcher)
  return { asientos: data?.asientos ?? [], total: data?.total ?? 0, isLoading, error }
}

/** Libro Mayor — movimientos de una cuenta */
export function useGeneralLedger(accountId: number | null, mes: number, year: number) {
  const params = accountId ? new URLSearchParams({
    account_id: String(accountId), mes: String(mes), year: String(year),
  }) : null
  const { data, error, isLoading } = useSWR(
    params ? `/api/v1/contabilidad/libro-mayor?${params}` : null, fetcher,
  )
  return {
    cuenta: data?.cuenta ?? null,
    movimientos: data?.movimientos ?? [],
    saldo_inicial: data?.saldo_inicial ?? 0,
    saldo_final: data?.saldo_final ?? 0,
    isLoading, error,
  }
}

/** Balance General */
export function useBalanceSheet(year: number, month: number) {
  const { data, error, isLoading } = useSWR(
    `/api/v1/contabilidad/balance?year=${year}&mes=${month}`, fetcher,
  )
  return { balance: data ?? null, isLoading, error }
}

/** Estado de Resultados */
export function useIncomeStatement(year: number, month: number) {
  const { data, error, isLoading } = useSWR(
    `/api/v1/contabilidad/resultados?year=${year}&mes=${month}`, fetcher,
  )
  return { resultados: data ?? null, isLoading, error }
}

/** Conciliación Bancaria */
export function useBankReconciliation(journalId: number | null, mes: number, year: number) {
  const params = journalId ? new URLSearchParams({
    journal_id: String(journalId), mes: String(mes), year: String(year),
  }) : null
  const { data, error, isLoading } = useSWR(
    params ? `/api/v1/contabilidad/conciliacion?${params}` : null, fetcher,
  )
  return {
    extracto: data?.extracto ?? [],
    sin_conciliar: data?.sin_conciliar ?? [],
    total_extracto: data?.total_extracto ?? 0,
    total_sin_conciliar: data?.total_sin_conciliar ?? 0,
    isLoading, error,
  }
}

// ══════════════════════════════════════════════════════════════
// CAF Hooks
// ══════════════════════════════════════════════════════════════

/** Estado de los CAFs (folios) de la empresa */
export function useCAFStatus() {
  const { data, error, isLoading, mutate } = useSWR('/api/v1/caf/status', fetcher, {
    refreshInterval: 60_000,
  })

  const uploadCAF = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    await apiClient.post('/api/v1/caf/load', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    mutate()
  }

  return { cafs: data?.cafs ?? [], isLoading, error, uploadCAF }
}

// ══════════════════════════════════════════════════════════════
// SII Config Hooks
// ══════════════════════════════════════════════════════════════

/** Estado y conectividad del SII */
export function useSIIStatus() {
  const { data: cert, mutate: mutateCert } = useSWR('/api/v1/sii/certificate/status', fetcher, {
    refreshInterval: 120_000,
  })
  const { data: connectivity } = useSWR('/api/v1/sii/connectivity', fetcher, {
    refreshInterval: 30_000,
  })

  const uploadCertificate = async (file: File, password: string) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('password', password)
    const { data } = await apiClient.post('/api/v1/sii/certificate/load', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    mutateCert()
    return data
  }

  return {
    cert: {
      cargado:         cert?.cargado ?? false,
      rut:             cert?.rut_empresa,
      vence:           cert?.vence,
      diasParaVencer:  cert?.dias_para_vencer,
    },
    connectivity: {
      conectado:    connectivity?.conectado ?? false,
      tokenVigente: connectivity?.token_vigente ?? false,
      ambiente:     connectivity?.ambiente ?? 'desconocido',
    },
    uploadCertificate,
  }
}

// ══════════════════════════════════════════════════════════════
// Auth Hooks
// ══════════════════════════════════════════════════════════════

/** Datos del usuario autenticado */
export function useMe() {
  const { data, error, isLoading } = useSWR('/api/v1/auth/me', fetcher)
  return { user: data?.user, isLoading, error }
}
