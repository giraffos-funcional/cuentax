/**
 * CUENTAX — Custom Hooks (SWR)
 * Hooks React para consumir el BFF.
 * Reemplazan el mock data de todas las páginas.
 */
'use client'

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
