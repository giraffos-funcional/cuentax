/**
 * CUENTAX — Custom Hooks (SWR)
 * Hooks React para consumir el BFF.
 * Reemplazan el mock data de todas las páginas.
 */
'use client'

import { useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import useSWRMutation from 'swr/mutation'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth.store'

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

/** Journals (diarios contables — para selects) */
export function useJournals() {
  const { data, error, isLoading } = useSWR('/api/v1/contabilidad/journals', fetcher)
  return { journals: data?.journals ?? [], isLoading, error }
}

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
  const isError = error || data?.source === 'error'
  return { balance: isError ? null : data, isLoading, error: isError ? (error ?? new Error(data?.message ?? 'Error cargando balance')) : null }
}

/** Estado de Resultados */
export function useIncomeStatement(year: number, month: number) {
  const { data, error, isLoading } = useSWR(
    `/api/v1/contabilidad/resultados?year=${year}&mes=${month}`, fetcher,
  )
  const isError = error || data?.source === 'error'
  return { resultados: isError ? null : data, isLoading, error: isError ? (error ?? new Error(data?.message ?? 'Error cargando estado de resultados')) : null }
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
// Contacts CRUD Hooks
// ══════════════════════════════════════════════════════════════

/** Lista contactos con filtros */
export function useContacts(filters?: { search?: string; tipo?: 'clientes' | 'proveedores'; page?: number }) {
  const companyId = useAuthStore(s => s.user?.company_id);
  const params = new URLSearchParams()
  if (filters?.search) params.set('search', filters.search)
  if (filters?.tipo) params.set('tipo', filters.tipo)
  if (filters?.page) params.set('page', String(filters.page))

  if (companyId) params.set('_c', String(companyId));
  const url = `/api/v1/contacts?${params.toString()}`
  const { data, error, isLoading, mutate } = useSWR(url, fetcher)

  return {
    contactos: data?.data ?? [],
    total: data?.total ?? 0,
    isLoading,
    error,
    refresh: mutate,
  }
}

/** Crear contacto */
export function useCreateContact() {
  const { trigger, isMutating, error } = useSWRMutation('/api/v1/contacts', poster)

  const crear = async (payload: unknown) => {
    const result = await trigger(payload)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/contacts'))
    return result
  }

  return { crear, isLoading: isMutating, error }
}

/** Actualizar contacto */
export function useUpdateContact() {
  const update = async (id: number, payload: unknown) => {
    const result = await apiClient.put(`/api/v1/contacts/${id}`, payload).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/contacts'))
    return result
  }

  return { update }
}

/** Eliminar contacto */
export function useDeleteContact() {
  const remove = async (id: number) => {
    await apiClient.delete(`/api/v1/contacts/${id}`)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/contacts'))
  }

  return { remove }
}

// ══════════════════════════════════════════════════════════════
// Products CRUD Hooks
// ══════════════════════════════════════════════════════════════

/** Lista productos con filtros */
export function useProducts(filters?: { search?: string; exento?: boolean; page?: number }) {
  const companyId = useAuthStore(s => s.user?.company_id);
  const params = new URLSearchParams()
  if (filters?.search) params.set('search', filters.search)
  if (filters?.exento !== undefined) params.set('exento', String(filters.exento))
  if (filters?.page) params.set('page', String(filters.page))

  if (companyId) params.set('_c', String(companyId));
  const url = `/api/v1/products?${params.toString()}`
  const { data, error, isLoading, mutate } = useSWR(url, fetcher)

  return {
    productos: data?.data ?? [],
    total: data?.total ?? 0,
    isLoading,
    error,
    refresh: mutate,
  }
}

/** Crear producto */
export function useCreateProduct() {
  const { trigger, isMutating, error } = useSWRMutation('/api/v1/products', poster)

  const crear = async (payload: unknown) => {
    const result = await trigger(payload)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/products'))
    return result
  }

  return { crear, isLoading: isMutating, error }
}

/** Actualizar producto */
export function useUpdateProduct() {
  const update = async (id: number, payload: unknown) => {
    const result = await apiClient.put(`/api/v1/products/${id}`, payload).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/products'))
    return result
  }

  return { update }
}

/** Eliminar producto */
export function useDeleteProduct() {
  const remove = async (id: number) => {
    await apiClient.delete(`/api/v1/products/${id}`)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/products'))
  }

  return { remove }
}

// ══════════════════════════════════════════════════════════════
// Company Hooks
// ══════════════════════════════════════════════════════════════

/** Switch active company */
export function useSwitchCompany() {
  const switchTo = async (companyId: number) => {
    const { data } = await apiClient.post('/api/v1/companies/switch', { company_id: companyId })
    useAuthStore.getState().setAuth(data.user, data.access_token)
    window.location.reload()
  }
  return { switchTo }
}

// ══════════════════════════════════════════════════════════════
// CAF Hooks
// ══════════════════════════════════════════════════════════════

/** Estado de los CAFs (folios) de la empresa, filtrado por ambiente */
export function useCAFStatus(ambiente: string = 'produccion') {
  const url = ambiente ? `/api/v1/caf/status?ambiente=${ambiente}` : '/api/v1/caf/status'
  const { data, error, isLoading, mutate } = useSWR(url, fetcher, {
    refreshInterval: 60_000,
  })

  const uploadCAF = async (file: File, uploadAmbiente?: string) => {
    const amb = uploadAmbiente ?? ambiente
    const formData = new FormData()
    formData.append('file', file)
    await apiClient.post(`/api/v1/caf/load?ambiente=${amb}`, formData)
    mutate()
  }

  return { cafs: data?.cafs ?? [], isLoading, error, uploadCAF, mutate }
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
    const { data } = await apiClient.post('/api/v1/sii/certificate/load', formData)
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
    mutateCert,
  }
}

/** List all loaded certificates and their associated companies */
export function useCertificateList() {
  const { data, error, isLoading, mutate } = useSWR('/api/v1/sii/certificate/list', fetcher)

  const associateCertificate = async () => {
    const { data: result } = await apiClient.post('/api/v1/sii/certificate/associate')
    mutate()
    // Also invalidate certificate status
    globalMutate('/api/v1/sii/certificate/status')
    return result
  }

  return {
    certificates: data?.certificates ?? [],
    isLoading,
    error,
    associateCertificate,
    refresh: mutate,
  }
}

// ══════════════════════════════════════════════════════════════
// Certification Wizard Hooks
// ══════════════════════════════════════════════════════════════

/** Prerequisites check — certificate, CAFs, SII connectivity */
export function useCertificationPrerequisites() {
  const { data, error, isLoading, mutate } = useSWR('/api/v1/certification/prerequisites', fetcher, {
    refreshInterval: 15_000,
  })
  return { prerequisites: data ?? null, isLoading, error, refresh: mutate }
}

/** Wizard overview — steps and progress */
export function useCertificationWizard() {
  const { data, error, isLoading, mutate } = useSWR('/api/v1/certification/wizard', fetcher, {
    refreshInterval: 30_000,
  })
  return { wizard: data ?? null, isLoading, error, refresh: mutate }
}

/** Certification status with SII connectivity */
export function useCertificationStatus() {
  const { data, error, isLoading, mutate } = useSWR('/api/v1/certification/status', fetcher, {
    refreshInterval: 60_000,
  })
  return { status: data ?? null, isLoading, error, refresh: mutate }
}

/** Complete a manual step */
export function useCompleteStep() {
  const complete = async (step: number) => {
    const { data } = await apiClient.post('/api/v1/certification/complete-step', { step })
    globalMutate('/api/v1/certification/wizard')
    return data
  }
  return { complete }
}

/** Upload test set file */
export function useUploadTestSet() {
  const upload = async (file: File, emisorOverrides?: Record<string, string>, setType: string = 'factura') => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('set_type', setType)
    if (emisorOverrides) {
      Object.entries(emisorOverrides).forEach(([key, value]) => {
        formData.append(key, value)
      })
    }
    const { data } = await apiClient.post('/api/v1/certification/upload-set', formData)
    globalMutate('/api/v1/certification/wizard')
    return data
  }
  return { upload }
}

/** Process loaded test set */
export function useProcessTestSet() {
  const process = async (fechaEmision?: string, setType: string = 'factura') => {
    const { data } = await apiClient.post('/api/v1/certification/process-set', {
      fecha_emision: fechaEmision,
      set_type: setType,
    })
    globalMutate('/api/v1/certification/wizard')
    return data
  }
  return { process }
}

/** Emit simulation batch — Step 3 SIMULACION. Posts list of DTE payloads
 *  to BFF which forwards to bridge `/wizard/simulacion/send`. Bridge groups
 *  them into a single EnvioDTE → single track_id (SII certification rule). */
export function useEmitSimulacion() {
  const emit = async (payloads: Record<string, any>[]) => {
    const { data } = await apiClient.post('/api/v1/certification/simulacion-send', { payloads })
    globalMutate('/api/v1/certification/wizard')
    globalMutate('/api/v1/certification/status')
    return data
  }
  return { emit }
}

/** Reset certification wizard */
export function useResetCertification() {
  const reset = async () => {
    const { data } = await apiClient.post('/api/v1/certification/reset')
    globalMutate('/api/v1/certification/wizard')
    globalMutate('/api/v1/certification/status')
    return data
  }
  return { reset }
}

// ══════════════════════════════════════════════════════════════
// Auth Hooks
// ══════════════════════════════════════════════════════════════

/** Datos del usuario autenticado */
export function useMe() {
  const { data, error, isLoading } = useSWR('/api/v1/auth/me', fetcher)
  return { user: data?.user, isLoading, error }
}

// ══════════════════════════════════════════════════════════════
// Accounting Mutation Hooks (Transactional)
// ══════════════════════════════════════════════════════════════

/** Create single account */
export function useCreateAccount() {
  const crear = async (payload: unknown) => {
    const result = await apiClient.post('/api/v1/contabilidad/plan-cuentas', payload).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/plan-cuentas'))
    return result
  }
  return { crear }
}

/** Import accounts batch */
export function useImportAccounts() {
  const importar = async (accounts: unknown[]) => {
    const result = await apiClient.post('/api/v1/contabilidad/plan-cuentas/import', { accounts }).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/plan-cuentas'))
    return result
  }
  return { importar }
}

/** Update account */
export function useUpdateAccount() {
  const update = async (id: number, payload: unknown) => {
    const result = await apiClient.put(`/api/v1/contabilidad/plan-cuentas/${id}`, payload).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/plan-cuentas'))
    return result
  }
  return { update }
}

/** Delete account */
export function useDeleteAccount() {
  const remove = async (id: number) => {
    await apiClient.delete(`/api/v1/contabilidad/plan-cuentas/${id}`)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/plan-cuentas'))
  }
  return { remove }
}

/** Create journal entry */
export function useCreateJournalEntry() {
  const crear = async (payload: unknown) => {
    const result = await apiClient.post('/api/v1/contabilidad/asientos', payload).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/libro-diario'))
    return result
  }
  return { crear }
}

/** Update journal entry */
export function useUpdateJournalEntry() {
  const update = async (id: number, payload: unknown) => {
    const result = await apiClient.put(`/api/v1/contabilidad/asientos/${id}`, payload).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/libro-diario'))
    return result
  }
  return { update }
}

/** Post journal entry (draft -> posted) */
export function usePostJournalEntry() {
  const post = async (id: number) => {
    const result = await apiClient.post(`/api/v1/contabilidad/asientos/${id}/post`).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/libro-diario'))
    return result
  }
  return { post }
}

/** Reset journal entry to draft */
export function useDraftJournalEntry() {
  const draft = async (id: number) => {
    const result = await apiClient.post(`/api/v1/contabilidad/asientos/${id}/draft`).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/libro-diario'))
    return result
  }
  return { draft }
}

/** Delete journal entry */
export function useDeleteJournalEntry() {
  const remove = async (id: number) => {
    await apiClient.delete(`/api/v1/contabilidad/asientos/${id}`)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/libro-diario'))
  }
  return { remove }
}

/** Import bank statement */
export function useImportStatement() {
  const importar = async (payload: unknown) => {
    const result = await apiClient.post('/api/v1/contabilidad/cartola/import', payload).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/contabilidad/'))
    return result
  }
  return { importar }
}

/** List bank statements */
export function useBankStatements(journalId?: number) {
  const params = journalId ? `?journal_id=${journalId}` : ''
  const { data, error, isLoading } = useSWR(`/api/v1/contabilidad/cartola/statements${params}`, fetcher)
  return { statements: data?.statements ?? [], isLoading, error }
}

/** Edit a statement line */
export function useEditStatementLine() {
  const editar = async (id: number, payload: { date?: string; payment_ref?: string; amount?: number }) => {
    const result = await apiClient.put(`/api/v1/contabilidad/cartola/lineas/${id}`, payload).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/contabilidad/'))
    return result
  }
  return { editar }
}

/** Delete a statement line */
export function useDeleteStatementLine() {
  const eliminar = async (id: number) => {
    await apiClient.delete(`/api/v1/contabilidad/cartola/lineas/${id}`)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/contabilidad/'))
  }
  return { eliminar }
}

/** Add a statement line */
export function useAddStatementLine() {
  const agregar = async (payload: { journal_id: number; date: string; payment_ref: string; amount: number; statement_id?: number }) => {
    const result = await apiClient.post('/api/v1/contabilidad/cartola/lineas', payload).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/contabilidad/'))
    return result
  }
  return { agregar }
}

/** Reconcile statement lines */
export function useReconcile() {
  const reconcile = async (statementLineIds: number[]) => {
    const result = await apiClient.post('/api/v1/contabilidad/conciliacion/reconcile', { statement_line_ids: statementLineIds }).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/contabilidad/'))
    return result
  }
  return { reconcile }
}

/** Auto-reconcile all unmatched lines */
export function useAutoReconcile() {
  const autoReconcile = async (journalId: number) => {
    const result = await apiClient.post('/api/v1/contabilidad/conciliacion/auto', { journal_id: journalId }).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/contabilidad/'))
    return result
  }
  return { autoReconcile }
}

/** Auxiliar partners (sub-ledger) */
export function useAuxiliarPartners(type: string, mes?: number, year?: number) {
  const params = new URLSearchParams({ type })
  if (mes) params.set('mes', String(mes))
  if (year) params.set('year', String(year))
  const { data, error, isLoading } = useSWR(`/api/v1/contabilidad/auxiliar?${params}`, fetcher)
  return { partners: data?.partners ?? [], isLoading, error }
}

/** Auxiliar detail for a specific partner */
export function useAuxiliarDetail(partnerId: number | null, type: string, mes?: number, year?: number) {
  const params = partnerId ? new URLSearchParams({ type, ...(mes ? { mes: String(mes) } : {}), ...(year ? { year: String(year) } : {}) }) : null
  const { data, error, isLoading } = useSWR(
    params ? `/api/v1/contabilidad/auxiliar/${partnerId}?${params}` : null, fetcher,
  )
  return { movimientos: data?.movimientos ?? [], saldo_final: data?.saldo_final ?? 0, isLoading, error }
}

/** Create journal */
export function useCreateJournal() {
  const crear = async (payload: unknown) => {
    const result = await apiClient.post('/api/v1/contabilidad/journals', payload).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/journals'))
    return result
  }
  return { crear }
}

/** Import bank statement file (OFX/CSV) */
export function useImportBankFile() {
  const { trigger, isMutating, error } = useSWRMutation('/api/v1/contabilidad/conciliacion/import-file', poster)
  const importFile = async (payload: { content: string; format: 'ofx' | 'csv'; bank?: string; journal_id: number }) => {
    const result = await trigger(payload)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/conciliacion'))
    return result
  }
  return { importFile, isLoading: isMutating, error }
}

/** Auto-match bank statement lines with unreconciled journal entries */
export function useAutoMatch() {
  const { trigger, isMutating, error, data } = useSWRMutation('/api/v1/contabilidad/conciliacion/auto-match', poster)
  return { findMatches: trigger, isLoading: isMutating, error, suggestions: data?.suggestions ?? [] }
}

/** Apply reconciliation matches */
export function useApplyMatches() {
  const { trigger, isMutating, error } = useSWRMutation('/api/v1/contabilidad/conciliacion/apply-matches', poster)
  const apply = async (matches: Array<{ statement_line_id: number; move_line_id: number }>) => {
    const result = await trigger({ matches })
    globalMutate((key: string) => typeof key === 'string' && key.includes('/conciliacion'))
    return result
  }
  return { apply, isLoading: isMutating, error }
}

/** Company accounting setup */
export function useAccountingSetup() {
  const setup = async (payload: unknown) => {
    const result = await apiClient.post('/api/v1/contabilidad/setup', payload).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/contabilidad/'))
    return result
  }
  return { setup }
}

// ══════════════════════════════════════════════════════════
// Cost Center Hooks
// ══════════════════════════════════════════════════════════

/** List all cost centers (analytic accounts) */
export function useCostCenters() {
  const { data, error, isLoading } = useSWR('/api/v1/contabilidad/centros-costo', fetcher)
  return { centros: data?.centros ?? [], total: data?.total ?? 0, isLoading, error }
}

/** Cost center report grouped by analytic account for a period */
export function useCostCenterReport(year: number, mes: number) {
  const params = new URLSearchParams({ year: String(year), mes: String(mes) })
  const { data, error, isLoading } = useSWR(`/api/v1/contabilidad/centros-costo/reporte?${params}`, fetcher)
  return { reporte: data?.reporte ?? [], gran_total: data?.gran_total ?? 0, isLoading, error }
}

/** Analytic lines (movements) for a specific cost center */
export function useCostCenterMovements(centroId: number | null, year: number, mes: number) {
  const params = new URLSearchParams({ year: String(year), mes: String(mes) })
  const { data, error, isLoading } = useSWR(
    centroId ? `/api/v1/contabilidad/centros-costo/${centroId}/movimientos?${params}` : null, fetcher,
  )
  return { movimientos: data?.movimientos ?? [], total: data?.total ?? 0, isLoading, error }
}

/** Create a new cost center */
export function useCreateCostCenter() {
  const { trigger, isMutating, error } = useSWRMutation('/api/v1/contabilidad/centros-costo', poster)
  const create = async (payload: { name: string; code?: string }) => {
    const result = await trigger(payload)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/centros-costo'))
    return result
  }
  return { create, isLoading: isMutating, error }
}

// ══════════════════════════════════════════════════════════
// Cash Flow Hooks
// ══════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════
// Cotizaciones CRUD Hooks
// ══════════════════════════════════════════════════════════

/** Lista cotizaciones con filtros */
export function useCotizaciones(filters?: { estado?: string; page?: number }) {
  const params = new URLSearchParams()
  if (filters?.estado && filters.estado !== 'todas') params.set('estado', filters.estado)
  if (filters?.page) params.set('page', String(filters.page))

  const url = `/api/v1/cotizaciones?${params.toString()}`
  const { data, error, isLoading, mutate } = useSWR(url, fetcher, { refreshInterval: 30_000 })

  return {
    cotizaciones: data?.data ?? [],
    total: data?.total ?? 0,
    isLoading,
    error,
    mutate,
  }
}

/** Detalle de una cotización */
export function useCotizacion(id: number | string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? `/api/v1/cotizaciones/${id}` : null, fetcher,
  )
  return { cotizacion: data ?? null, isLoading, error, mutate }
}

/** Crear cotización */
export function useCreateCotizacion() {
  const { trigger, isMutating, error } = useSWRMutation('/api/v1/cotizaciones', poster)

  const crear = async (payload: unknown) => {
    const result = await trigger(payload)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/cotizaciones'))
    return result
  }

  return { crear, isLoading: isMutating, error }
}

/** Acciones de cotización (enviar, aceptar, rechazar, facturar) */
export function useCotizacionAction() {
  const ejecutar = async (id: number, action: 'enviar' | 'aceptar' | 'rechazar' | 'facturar') => {
    const result = await apiClient.post(`/api/v1/cotizaciones/${id}/${action}`).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/cotizaciones'))
    // Also invalidate DTEs if facturar
    if (action === 'facturar') {
      globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/dte'))
    }
    return result
  }
  return { ejecutar }
}

/** Actualizar cotización */
export function useUpdateCotizacion() {
  const update = async (id: number, payload: unknown) => {
    const result = await apiClient.put(`/api/v1/cotizaciones/${id}`, payload).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/cotizaciones'))
    return result
  }
  return { update }
}

/** Eliminar cotización */
export function useDeleteCotizacion() {
  const remove = async (id: number) => {
    await apiClient.delete(`/api/v1/cotizaciones/${id}`)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/cotizaciones'))
  }
  return { remove }
}

// ══════════════════════════════════════════════════════════
// Pedidos de Compra CRUD Hooks
// ══════════════════════════════════════════════════════════

/** Lista pedidos de compra con filtros */
export function usePedidosCompra(filters?: { estado?: string; page?: number }) {
  const params = new URLSearchParams()
  if (filters?.estado) params.set('estado', filters.estado)
  if (filters?.page) params.set('page', String(filters.page))
  const { data, error, isLoading, mutate } = useSWR(`/api/v1/compras/pedidos?${params}`, fetcher, { refreshInterval: 30_000 })
  return { pedidos: data?.data ?? [], total: data?.total ?? 0, isLoading, error, mutate }
}

/** Detalle de un pedido de compra */
export function usePedidoCompra(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR(id ? `/api/v1/compras/pedidos/${id}` : null, fetcher)
  return { pedido: data ?? null, isLoading, error, mutate }
}

/** Acciones de pedido de compra (enviar, confirmar, recibir, cancelar, vincular-factura) */
export function usePedidoCompraAction() {
  const [isLoading, setLoading] = useState(false)
  const execute = async (id: number, action: string, body?: Record<string, unknown>) => {
    setLoading(true)
    try {
      const { data } = await apiClient.post(`/api/v1/compras/pedidos/${id}/${action}`, body ?? {})
      globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/compras/pedidos'))
      return data
    } finally { setLoading(false) }
  }
  return { execute, isLoading }
}

/** Crear pedido de compra */
export function useCreatePedidoCompra() {
  const crear = async (payload: unknown) => {
    const result = await apiClient.post('/api/v1/compras/pedidos', payload).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/compras/pedidos'))
    return result
  }
  return { crear }
}

/** Eliminar pedido de compra */
export function useDeletePedidoCompra() {
  const remove = async (id: number) => {
    await apiClient.delete(`/api/v1/compras/pedidos/${id}`)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/compras/pedidos'))
  }
  return { remove }
}

// ══════════════════════════════════════════════════════════
// Bank Module Hooks
// ══════════════════════════════════════════════════════════

/** Bank Accounts */
export function useBankAccounts() {
  const { data, error, isLoading, mutate } = useSWR('/api/v1/bank/accounts', fetcher, { refreshInterval: 60_000 })
  return { accounts: data?.data ?? [], isLoading, error, mutate }
}

/** Bank Transactions for a specific account */
export function useBankTransactions(accountId: number | null, filters?: { fecha_desde?: string; fecha_hasta?: string; page?: number }) {
  const params = new URLSearchParams()
  if (filters?.fecha_desde) params.set('fecha_desde', filters.fecha_desde)
  if (filters?.fecha_hasta) params.set('fecha_hasta', filters.fecha_hasta)
  if (filters?.page) params.set('page', String(filters.page))
  const { data, error, isLoading, mutate } = useSWR(
    accountId ? `/api/v1/bank/accounts/${accountId}/transactions?${params}` : null, fetcher, { refreshInterval: 60_000 })
  return { transactions: data?.data ?? [], total: data?.total ?? 0, saldo: data?.saldo ?? 0, isLoading, error, mutate }
}

/** Create bank account */
export function useCreateBankAccount() {
  const crear = async (payload: unknown) => {
    const result = await apiClient.post('/api/v1/bank/accounts', payload).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/api/v1/bank/'))
    return result
  }
  return { crear }
}

/** Delete bank account (soft) */
export function useDeleteBankAccount() {
  const remove = async (id: number) => {
    await apiClient.delete(`/api/v1/bank/accounts/${id}`)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/api/v1/bank/'))
  }
  return { remove }
}

/** Add manual bank transaction */
export function useCreateBankTransaction() {
  const crear = async (accountId: number, payload: unknown) => {
    const result = await apiClient.post(`/api/v1/bank/accounts/${accountId}/transactions`, payload).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/api/v1/bank/'))
    return result
  }
  return { crear }
}

/** Delete bank transaction */
export function useDeleteBankTransaction() {
  const remove = async (txId: number) => {
    await apiClient.delete(`/api/v1/bank/transactions/${txId}`)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/api/v1/bank/'))
  }
  return { remove }
}

/** Save bank credentials */
export function useSaveBankCredentials() {
  const save = async (accountId: number, payload: { bank_user: string; bank_password: string; scraping_enabled?: boolean }) => {
    const result = await apiClient.put(`/api/v1/bank/accounts/${accountId}/credentials`, payload).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/api/v1/bank/'))
    return result
  }
  return { save }
}

/** Reconcile bank transaction with DTE */
export function useReconcileBankTx() {
  const reconcile = async (accountId: number, txId: number, dteDocumentId: number, note?: string) => {
    const result = await apiClient.post(`/api/v1/bank/accounts/${accountId}/reconcile`, {
      tx_id: txId, dte_document_id: dteDocumentId, note,
    }).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/api/v1/bank/'))
    return result
  }
  return { reconcile }
}

/** Unreconcile bank transaction */
export function useUnreconcileBankTx() {
  const unreconcile = async (accountId: number, txId: number) => {
    const result = await apiClient.post(`/api/v1/bank/accounts/${accountId}/unreconcile`, {
      tx_id: txId,
    }).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/api/v1/bank/'))
    return result
  }
  return { unreconcile }
}

// ══════════════════════════════════════════════════════════
// Gastos (Expenses) Hooks
// ══════════════════════════════════════════════════════════

export interface Gasto {
  id: string
  tipo_documento: string
  numero_documento: string
  fecha_documento: string
  emisor_rut: string
  emisor_razon_social: string
  monto_neto: number
  monto_iva: number
  monto_total: number
  categoria: string
  descripcion: string
  foto_url: string | null
  confianza_ocr: number | null
  verificado: boolean
  created_at: string
}

export interface CreateGastoDTO {
  tipo_documento: string
  numero_documento?: string
  fecha_documento: string
  emisor_rut?: string
  emisor_razon_social?: string
  monto_neto?: number
  monto_iva?: number
  monto_total: number
  categoria: string
  descripcion?: string
  foto_url?: string
  datos_ocr?: Record<string, unknown>
  confianza_ocr?: number
}

/** Lista gastos con filtros y paginación */
export function useGastos(page = 1, filters?: { categoria?: string; verificado?: string; mes?: string; year?: string }) {
  const params = new URLSearchParams({ page: String(page), limit: '20' })
  if (filters?.categoria) params.set('categoria', filters.categoria)
  if (filters?.verificado) params.set('verificado', filters.verificado)
  if (filters?.mes) params.set('mes', filters.mes)
  if (filters?.year) params.set('year', filters.year)

  const { data, error, isLoading, mutate } = useSWR<{ data: Gasto[]; total: number; page: number; pages: number }>(
    `/api/v1/gastos?${params}`,
    fetcher,
    { refreshInterval: 30_000 },
  )

  return {
    gastos: data?.data ?? [],
    total: data?.total ?? 0,
    pages: data?.pages ?? 1,
    isLoading,
    error,
    mutate,
  }
}

/** Detalle de un gasto */
export function useGasto(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<Gasto>(
    id ? `/api/v1/gastos/${id}` : null, fetcher,
  )
  return { gasto: data ?? null, isLoading, error, mutate }
}

/** Crear gasto */
export function useCreateGasto() {
  const crear = async (payload: CreateGastoDTO) => {
    const result = await apiClient.post('/api/v1/gastos', payload).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/gastos'))
    return result
  }
  return { crear }
}

/** Actualizar gasto */
export function useUpdateGasto() {
  const update = async (id: string, payload: Partial<CreateGastoDTO>) => {
    const result = await apiClient.put(`/api/v1/gastos/${id}`, payload).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/gastos'))
    return result
  }
  return { update }
}

/** Eliminar gasto */
export function useDeleteGasto() {
  const remove = async (id: string) => {
    await apiClient.delete(`/api/v1/gastos/${id}`)
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/v1/gastos'))
  }
  return { remove }
}

/** Procesar imagen con OCR */
export function useProcessOCR() {
  const process = async (imageFile: File) => {
    const formData = new FormData()
    formData.append('image', imageFile)
    const { data } = await apiClient.post('/api/v1/ocr/process', formData)
    return data
  }
  return { process }
}

/** Cash flow forecast with historical and projected periods */
export function useCashFlow(months?: number) {
  const params = months ? new URLSearchParams({ months: String(months) }) : ''
  const { data, error, isLoading } = useSWR(
    `/api/v1/contabilidad/flujo-caja?${params}`, fetcher,
    { refreshInterval: 300_000 },
  )
  return {
    saldo_actual: data?.saldo_actual ?? 0,
    por_cobrar: data?.por_cobrar ?? 0,
    por_pagar: data?.por_pagar ?? 0,
    historico: data?.historico ?? [],
    proyeccion: data?.proyeccion ?? [],
    isLoading,
    error,
  }
}

// ══════════════════════════════════════════════════════════════
// AI Chat Hook (SSE Streaming)
// ══════════════════════════════════════════════════════════════

import { useChatStore } from '@/stores/chat.store'

/** Sends messages to the AI chat endpoint via SSE streaming */
export function useAIChat() {
  const { accessToken } = useAuthStore()
  const { addMessage, appendToLastMessage, setStreaming } = useChatStore()

  const sendMessage = async (content: string) => {
    // Add user message to store
    addMessage({ role: 'user', content })
    // Add empty assistant message placeholder
    addMessage({ role: 'assistant', content: '' })
    setStreaming(true)

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BFF_URL}/api/v1/ai/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            messages: useChatStore
              .getState()
              .messages.slice(0, -1)
              .map((m) => ({ role: m.role, content: m.content })),
          }),
        },
      )

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        // Parse SSE data lines
        const lines = text.split('\n').filter((l) => l.startsWith('data: '))
        for (const line of lines) {
          const raw = line.slice(6)
          if (raw === '[DONE]') break
          try {
            const data = JSON.parse(raw)
            if (data.type === 'text_delta') {
              appendToLastMessage(data.text)
            }
          } catch {
            // Skip malformed SSE chunks
          }
        }
      }
    } catch {
      appendToLastMessage(
        '\n\n_Error al procesar tu consulta. Intenta de nuevo._',
      )
    } finally {
      setStreaming(false)
    }
  }

  return { sendMessage }
}

// ══════════════════════════════════════════════════════════════
// Accounting Hooks (country-agnostic, CL + US)
// Routes under /api/v1/accounting use the JWT country_code to pick the
// right prompt, currency, and chart of accounts template.
// ══════════════════════════════════════════════════════════════

interface ImportAndClassifyOptions {
  content: string
  format: 'csv' | 'ofx'
  bank?: string
  opening_balance?: number
  closing_balance?: number
  skip_classify?: boolean
}

/** Import a bank statement — dedup, detect transfers/refunds, optionally classify with AI */
export function useImportAndClassify() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const importAndClassify = async (
    contentOrOpts: string | ImportAndClassifyOptions,
    format?: 'csv' | 'ofx',
    bank?: string,
  ) => {
    setLoading(true)
    setError(null)
    try {
      const body: ImportAndClassifyOptions = typeof contentOrOpts === 'string'
        ? { content: contentOrOpts, format: format ?? 'csv', bank }
        : contentOrOpts
      const result = await apiClient.post('/api/v1/accounting/import-and-classify', body).then(r => r.data)
      globalMutate((key: string) => typeof key === 'string' && (key.includes('/accounting/') || key.includes('/usa/')))
      return result
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Classification failed')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { importAndClassify, loading, error }
}

/** Pre-flight: parse a statement and report balance gap vs expected closing. */
export function useReconcileStatement() {
  const [loading, setLoading] = useState(false)
  const reconcile = async (opts: {
    content: string
    format: 'csv' | 'ofx'
    bank?: string
    opening_balance: number
    closing_balance: number
  }) => {
    setLoading(true)
    try {
      return await apiClient.post('/api/v1/accounting/reconcile', opts).then(r => r.data)
    } finally {
      setLoading(false)
    }
  }
  return { reconcile, loading }
}

/** Get classifications with optional status filter (works for CL and US). */
export function useClassifications(status: 'pending' | 'approved' | 'all' = 'all') {
  const { data, error, isLoading, mutate } = useSWR(
    `/api/v1/accounting/classifications?status=${status}`,
    fetcher,
    { refreshInterval: 30_000 },
  )
  return {
    classifications: data?.classifications ?? [],
    total: data?.total ?? 0,
    country: data?.country,
    isLoading,
    error,
    mutate,
  }
}

/** Approve a single classification (optionally with corrected account) */
export function useApproveClassification() {
  const approve = async (id: number, update?: { account_id: number; account_name: string; category: string }) => {
    const result = await apiClient.put(`/api/v1/accounting/classifications/${id}/approve`, update ?? {}).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/accounting/'))
    return result
  }
  return { approve }
}

/** Mark a classification as an inter-account transfer (skips journal generation). */
export function useMarkTransfer() {
  const markTransfer = async (id: number) => {
    const result = await apiClient.post(`/api/v1/accounting/classifications/${id}/mark-transfer`).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/accounting/'))
    return result
  }
  return { markTransfer }
}

/** Bulk approve multiple classifications */
export function useBulkApprove() {
  const bulkApprove = async (ids: number[]) => {
    const result = await apiClient.post('/api/v1/accounting/bulk-approve', { ids }).then(r => r.data)
    globalMutate((key: string) => typeof key === 'string' && key.includes('/accounting/'))
    return result
  }
  return { bulkApprove }
}

interface GenerateEntriesOptions {
  bank_journal_id: number
  bank_account_id: number
  auto_post?: boolean
  skip_transfers?: boolean
}

/** Generate journal entries from approved classifications. */
export function useGenerateJournalEntries() {
  const [loading, setLoading] = useState(false)

  // Backward-compatible overloads: (journalId, accountId) OR (opts)
  const generate = async (
    bankJournalIdOrOpts: number | GenerateEntriesOptions,
    bankAccountId?: number,
  ) => {
    setLoading(true)
    try {
      const body: GenerateEntriesOptions = typeof bankJournalIdOrOpts === 'number'
        ? { bank_journal_id: bankJournalIdOrOpts, bank_account_id: bankAccountId! }
        : bankJournalIdOrOpts
      const result = await apiClient.post('/api/v1/accounting/generate-entries', body).then(r => r.data)
      globalMutate((key: string) => typeof key === 'string' && (key.includes('/accounting/') || key.includes('/contabilidad/')))
      return result
    } finally {
      setLoading(false)
    }
  }

  return { generate, loading }
}

/** Year summary with monthly breakdown, top vendors, top income sources. */
export function useYearSummary(year: number) {
  const { data, error, isLoading, mutate } = useSWR(
    `/api/v1/accounting/summary?year=${year}`,
    fetcher,
  )
  return {
    summary: data,
    isLoading,
    error,
    mutate,
  }
}

/** P&L from posted journal entries. */
export function usePnl(year: number, month?: number) {
  const qs = month ? `year=${year}&month=${month}` : `year=${year}`
  const { data, error, isLoading, mutate } = useSWR(
    `/api/v1/accounting/pnl?${qs}`,
    fetcher,
  )
  return {
    pnl: data,
    isLoading,
    error,
    mutate,
  }
}

/** Trigger download of the P&L PDF for a given year/month. */
export function downloadPnlPdf(year: number, month?: number) {
  const qs = month ? `year=${year}&month=${month}` : `year=${year}`
  const url = `/api/v1/accounting/pnl.pdf?${qs}`
  // Use fetch with credentials so the JWT cookie/header is included
  return apiClient.get(url, { responseType: 'blob' }).then(res => {
    const blob = new Blob([res.data], { type: 'application/pdf' })
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = `pnl-${year}${month ? '-' + String(month).padStart(2, '0') : ''}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(objectUrl)
  })
}

/** Get learned classification rules */
export function useClassificationRules() {
  const { data, error, isLoading, mutate } = useSWR('/api/v1/accounting/classification-rules', fetcher)
  return {
    rules: data?.rules ?? [],
    isLoading,
    error,
    mutate,
  }
}

/** Run company accounting setup (country-aware chart of accounts + journals) */
export function useChartOfAccountsSetup() {
  const [loading, setLoading] = useState(false)
  const setup = async () => {
    setLoading(true)
    try {
      return await apiClient.post('/api/v1/accounting/setup', {}).then(r => r.data)
    } finally {
      setLoading(false)
    }
  }
  return { setup, loading }
}

/** Legacy US-only setup — kept for backward compatibility. */
export function useUSSetup() {
  return useChartOfAccountsSetup()
}

// ══════════════════════════════════════════════════════════════
// Cost Centers (analytic dimensions — properties, projects, cases, etc.)
// ══════════════════════════════════════════════════════════════

export interface CostCenter {
  id: number
  company_id: number
  odoo_analytic_id: number
  odoo_plan_id: number | null
  plan_name: string | null
  name: string
  code: string | null
  keywords: string[]
  airbnb_listing: string | null
  parent_id: number | null
  active: boolean
  notes: string | null
}

export function useCostCentersV2() {
  const { data, error, isLoading, mutate } = useSWR<{ cost_centers: CostCenter[]; total: number }>(
    '/api/v1/accounting/cost-centers', fetcher,
  )
  return {
    costCenters: data?.cost_centers ?? [],
    total: data?.total ?? 0,
    isLoading,
    error,
    mutate,
  }
}

export function useCreateCostCenterV2() {
  const [loading, setLoading] = useState(false)
  const create = async (input: {
    name: string
    code?: string
    plan_name?: string
    keywords?: string[]
    airbnb_listing?: string
    notes?: string
  }) => {
    setLoading(true)
    try {
      const r = await apiClient.post('/api/v1/accounting/cost-centers', input).then(res => res.data)
      globalMutate((k: string) => typeof k === 'string' && k.includes('/cost-centers'))
      return r
    } finally {
      setLoading(false)
    }
  }
  return { create, loading }
}

export function useUpdateCostCenter() {
  const update = async (id: number, input: Partial<{
    name: string
    code: string
    keywords: string[]
    airbnb_listing: string
    notes: string
  }>) => {
    const r = await apiClient.put(`/api/v1/accounting/cost-centers/${id}`, input).then(res => res.data)
    globalMutate((k: string) => typeof k === 'string' && k.includes('/cost-centers'))
    return r
  }
  return { update }
}

export function useDeleteCostCenter() {
  const remove = async (id: number) => {
    await apiClient.delete(`/api/v1/accounting/cost-centers/${id}`)
    globalMutate((k: string) => typeof k === 'string' && k.includes('/cost-centers'))
  }
  return { remove }
}

export function useSyncCostCenters() {
  const [loading, setLoading] = useState(false)
  const sync = async () => {
    setLoading(true)
    try {
      const r = await apiClient.post('/api/v1/accounting/cost-centers/sync', {}).then(res => res.data)
      globalMutate((k: string) => typeof k === 'string' && k.includes('/cost-centers'))
      return r
    } finally { setLoading(false) }
  }
  return { sync, loading }
}

export function useAutoTagCostCenters() {
  const [loading, setLoading] = useState(false)
  const autoTag = async () => {
    setLoading(true)
    try {
      const r = await apiClient.post('/api/v1/accounting/cost-centers/auto-tag', {}).then(res => res.data)
      globalMutate((k: string) => typeof k === 'string' && (k.includes('/classifications') || k.includes('/cost-centers')))
      return r
    } finally { setLoading(false) }
  }
  return { autoTag, loading }
}

export function useAssignCostCenter() {
  const assign = async (classificationId: number, costCenterId: number | null) => {
    const r = await apiClient.post(
      `/api/v1/accounting/classifications/${classificationId}/assign-cost-center`,
      { cost_center_id: costCenterId },
    ).then(res => res.data)
    globalMutate((k: string) => typeof k === 'string' && k.includes('/classifications'))
    return r
  }
  return { assign }
}

export function useBulkAssignCostCenter() {
  const bulk = async (ids: number[], costCenterId: number | null) => {
    const r = await apiClient.post('/api/v1/accounting/bulk-assign-cost-center', {
      ids, cost_center_id: costCenterId,
    }).then(res => res.data)
    globalMutate((k: string) => typeof k === 'string' && k.includes('/classifications'))
    return r
  }
  return { bulk }
}

export function useCostCenterPnl(year: number, month?: number) {
  const qs = month ? `year=${year}&month=${month}` : `year=${year}`
  const { data, error, isLoading, mutate } = useSWR(
    `/api/v1/accounting/cost-center-pnl?${qs}`, fetcher,
  )
  return { report: data, isLoading, error, mutate }
}

export function downloadCostCenterPnlPdf(year: number, month?: number) {
  const qs = month ? `year=${year}&month=${month}` : `year=${year}`
  return apiClient.get(`/api/v1/accounting/cost-center-pnl.pdf?${qs}`, { responseType: 'blob' })
    .then(res => {
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pnl-por-centro-${year}${month ? '-' + String(month).padStart(2, '0') : ''}.pdf`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    })
}

export function useAirbnbImport() {
  const [loading, setLoading] = useState(false)
  const importCsv = async (content: string) => {
    setLoading(true)
    try {
      return await apiClient.post('/api/v1/accounting/airbnb/import', { content }).then(res => res.data)
    } finally { setLoading(false) }
  }
  return { importCsv, loading }
}

// ══════════════════════════════════════════════════════════════
// Balance Sheet / Cash Flow / Budgets / Exchange Rates
// ══════════════════════════════════════════════════════════════

export function useBalanceSheetV2(asOf?: string) {
  const date = asOf ?? new Date().toISOString().slice(0, 10)
  const { data, error, isLoading, mutate } = useSWR(
    `/api/v1/accounting/balance-sheet?as_of=${date}`, fetcher,
  )
  return { report: data, isLoading, error, mutate }
}

export function downloadBalanceSheetPdf(asOf?: string) {
  const date = asOf ?? new Date().toISOString().slice(0, 10)
  return apiClient.get(`/api/v1/accounting/balance-sheet.pdf?as_of=${date}`, { responseType: 'blob' })
    .then(res => {
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `balance-sheet-${date}.pdf`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    })
}

export function useCashFlowV2(year: number, month?: number) {
  const qs = month ? `year=${year}&month=${month}` : `year=${year}`
  const { data, error, isLoading, mutate } = useSWR(`/api/v1/accounting/cash-flow?${qs}`, fetcher)
  return { report: data, isLoading, error, mutate }
}

export function downloadCashFlowPdf(year: number, month?: number) {
  const qs = month ? `year=${year}&month=${month}` : `year=${year}`
  return apiClient.get(`/api/v1/accounting/cash-flow.pdf?${qs}`, { responseType: 'blob' })
    .then(res => {
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `cash-flow-${year}${month ? '-' + String(month).padStart(2, '0') : ''}.pdf`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    })
}

export interface Budget {
  id: number
  company_id: number
  cost_center_id: number | null
  account_code: string
  account_name: string | null
  year: number
  month: number
  amount: number
  notes: string | null
}

export function useBudgets(year?: number, month?: number) {
  const params = new URLSearchParams()
  if (year) params.set('year', String(year))
  if (month) params.set('month', String(month))
  const qs = params.toString()
  const { data, error, isLoading, mutate } = useSWR<{ budgets: Budget[]; total: number }>(
    `/api/v1/accounting/budgets${qs ? '?' + qs : ''}`, fetcher,
  )
  return { budgets: data?.budgets ?? [], total: data?.total ?? 0, isLoading, error, mutate }
}

export function useUpsertBudget() {
  const upsert = async (input: {
    account_code: string; account_name?: string; cost_center_id?: number | null;
    year: number; month: number; amount: number; notes?: string
  }) => {
    const r = await apiClient.post('/api/v1/accounting/budgets', input).then(res => res.data)
    globalMutate((k: string) => typeof k === 'string' && k.includes('/budgets'))
    globalMutate((k: string) => typeof k === 'string' && k.includes('/budget-variance'))
    return r
  }
  return { upsert }
}

export function useDeleteBudget() {
  const remove = async (id: number) => {
    await apiClient.delete(`/api/v1/accounting/budgets/${id}`)
    globalMutate((k: string) => typeof k === 'string' && (k.includes('/budgets') || k.includes('/budget-variance')))
  }
  return { remove }
}

export function useBudgetVariance(year: number, month?: number) {
  const qs = month ? `year=${year}&month=${month}` : `year=${year}`
  const { data, error, isLoading, mutate } = useSWR(`/api/v1/accounting/budget-variance?${qs}`, fetcher)
  return { report: data, isLoading, error, mutate }
}

export interface ExchangeRate {
  id: number
  company_id: number
  date: string
  from_currency: string
  to_currency: string
  rate: number
  source: string | null
}

export function useExchangeRates(from?: string, to?: string) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const qs = params.toString()
  const { data, error, isLoading, mutate } = useSWR<{ rates: ExchangeRate[]; total: number }>(
    `/api/v1/accounting/exchange-rates${qs ? '?' + qs : ''}`, fetcher,
  )
  return { rates: data?.rates ?? [], total: data?.total ?? 0, isLoading, error, mutate }
}

export function useSetExchangeRate() {
  const set = async (input: { date: string; from_currency: string; to_currency: string; rate: number; source?: string }) => {
    const r = await apiClient.post('/api/v1/accounting/exchange-rates', input).then(res => res.data)
    globalMutate((k: string) => typeof k === 'string' && k.includes('/exchange-rates'))
    return r
  }
  return { set }
}

export function useDeleteExchangeRate() {
  const remove = async (id: number) => {
    await apiClient.delete(`/api/v1/accounting/exchange-rates/${id}`)
    globalMutate((k: string) => typeof k === 'string' && k.includes('/exchange-rates'))
  }
  return { remove }
}

// ══════════════════════════════════════════════════════════════
// Trial Balance / General Ledger / Aged AR-AP / 1099 / Alerts / Metrics
// ══════════════════════════════════════════════════════════════

export function useTrialBalance(year: number, month?: number) {
  const qs = month ? `year=${year}&month=${month}` : `year=${year}`
  const { data, error, isLoading, mutate } = useSWR(`/api/v1/accounting/trial-balance?${qs}`, fetcher)
  return { report: data, isLoading, error, mutate }
}

export function downloadTrialBalancePdf(year: number, month?: number) {
  const qs = month ? `year=${year}&month=${month}` : `year=${year}`
  return apiClient.get(`/api/v1/accounting/trial-balance.pdf?${qs}`, { responseType: 'blob' })
    .then(res => {
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `trial-balance-${year}${month ? '-' + String(month).padStart(2, '0') : ''}.pdf`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    })
}

export function useGeneralLedgerV2(year: number, accountCode?: string) {
  const params = new URLSearchParams({ year: String(year) })
  if (accountCode) params.set('account_code', accountCode)
  const { data, error, isLoading, mutate } = useSWR(`/api/v1/accounting/general-ledger?${params}`, fetcher)
  return { report: data, isLoading, error, mutate }
}

export function downloadGeneralLedgerCsv(year: number, accountCode?: string) {
  const params = new URLSearchParams({ year: String(year) })
  if (accountCode) params.set('account_code', accountCode)
  return apiClient.get(`/api/v1/accounting/general-ledger.csv?${params}`, { responseType: 'blob' })
    .then(res => {
      const blob = new Blob([res.data], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `general-ledger-${year}.csv`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    })
}

export function useAgedReport(kind: 'AR' | 'AP', asOf?: string) {
  const date = asOf ?? new Date().toISOString().slice(0, 10)
  const path = kind === 'AR' ? 'aged-ar' : 'aged-ap'
  const { data, error, isLoading, mutate } = useSWR(`/api/v1/accounting/${path}?as_of=${date}`, fetcher)
  return { report: data, isLoading, error, mutate }
}

export function downloadAgedCsv(kind: 'AR' | 'AP', asOf?: string) {
  const date = asOf ?? new Date().toISOString().slice(0, 10)
  const path = kind === 'AR' ? 'aged-ar' : 'aged-ap'
  return apiClient.get(`/api/v1/accounting/${path}.csv?as_of=${date}`, { responseType: 'blob' })
    .then(res => {
      const blob = new Blob([res.data], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `${path}-${date}.csv`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    })
}

export function download1099Pdf(year: number, threshold: number = 600) {
  return apiClient.get(`/api/v1/accounting/1099-nec.pdf?year=${year}&threshold=${threshold}`, { responseType: 'blob' })
    .then(res => {
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `1099-nec-${year}.pdf`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    })
}

export function useAlerts(config?: { budget_variance_pct?: number; low_cash?: number; pending_days?: number; no_import_days?: number }) {
  const params = new URLSearchParams()
  if (config?.budget_variance_pct !== undefined) params.set('budget_variance_pct', String(config.budget_variance_pct))
  if (config?.low_cash !== undefined) params.set('low_cash', String(config.low_cash))
  if (config?.pending_days !== undefined) params.set('pending_days', String(config.pending_days))
  if (config?.no_import_days !== undefined) params.set('no_import_days', String(config.no_import_days))
  const qs = params.toString()
  const { data, error, isLoading, mutate } = useSWR(
    `/api/v1/accounting/alerts${qs ? '?' + qs : ''}`, fetcher,
    { refreshInterval: 60_000 },
  )
  return { alerts: data?.alerts ?? [], total: data?.total ?? 0, isLoading, error, mutate }
}

export function useCompanyMetrics() {
  const { data, error, isLoading, mutate } = useSWR('/api/v1/accounting/metrics', fetcher)
  return { metrics: data, isLoading, error, mutate }
}

export function useKeywordTemplates() {
  const { data, error, isLoading } = useSWR('/api/v1/accounting/keyword-templates', fetcher)
  return { templates: data?.templates ?? [], isLoading, error }
}

export function useBulkUpdateClassifications() {
  const bulkUpdate = async (payload: {
    ids: number[]
    classified_account_id?: number | null
    classified_account_name?: string | null
    classified_category?: string | null
    cost_center_id?: number | null
    approve?: boolean
  }) => {
    const r = await apiClient.post('/api/v1/accounting/classifications/bulk-update', payload).then(res => res.data)
    globalMutate((k: string) => typeof k === 'string' && k.includes('/classifications'))
    return r
  }
  return { bulkUpdate }
}

// Async import for large files
export function useAsyncImport() {
  const [loading, setLoading] = useState(false)
  const importAsync = async (body: any) => {
    setLoading(true)
    try {
      return await apiClient.post('/api/v1/accounting/import-and-classify/async', body).then(res => res.data)
    } finally { setLoading(false) }
  }
  return { importAsync, loading }
}

export function useImportJobStatus(jobId: string | null) {
  const { data, error, isLoading } = useSWR(
    jobId ? `/api/v1/accounting/import-jobs/${jobId}` : null,
    fetcher,
    { refreshInterval: 2000 },
  )
  return { status: data, isLoading, error }
}

// Budget period expansion (quarterly/annual)
export function usePeriodBudget() {
  const setPeriod = async (payload: {
    account_code: string
    account_name?: string
    cost_center_id?: number | null
    period: 'month' | 'quarter' | 'year'
    year: number
    quarter_or_month?: number
    amount: number
  }) => {
    const r = await apiClient.post('/api/v1/accounting/budgets/period', payload).then(res => res.data)
    globalMutate((k: string) => typeof k === 'string' && (k.includes('/budgets') || k.includes('/budget-variance')))
    return r
  }
  return { setPeriod }
}
