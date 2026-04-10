/**
 * @cuentax/api-client — API endpoint path constants
 * Centralized so both web and mobile reference the same paths.
 */

export const ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/v1/auth/login',
    REFRESH: '/api/v1/auth/refresh',
    LOGOUT: '/api/v1/auth/logout',
    ME: '/api/v1/auth/me',
  },
  COMPANIES: {
    SWITCH: '/api/v1/companies/switch',
  },
  DTE: {
    LIST: '/api/v1/dte',
    EMITIR: '/api/v1/dte/emitir',
    STATUS: (trackId: string) => `/api/v1/dte/${trackId}/status` as const,
  },
  CONTACTS: {
    LIST: '/api/v1/contacts',
    BY_ID: (id: number) => `/api/v1/contacts/${id}` as const,
  },
  PRODUCTS: {
    LIST: '/api/v1/products',
    BY_ID: (id: number) => `/api/v1/products/${id}` as const,
  },
  GASTOS: {
    LIST: '/api/v1/gastos',
    BY_ID: (id: string) => `/api/v1/gastos/${id}` as const,
  },
  OCR: {
    PROCESS: '/api/v1/ocr/process',
  },
  COTIZACIONES: {
    LIST: '/api/v1/cotizaciones',
    BY_ID: (id: number | string) => `/api/v1/cotizaciones/${id}` as const,
    ACTION: (id: number, action: string) => `/api/v1/cotizaciones/${id}/${action}` as const,
  },
  REPORTES: {
    STATS: '/api/v1/reportes/stats',
    LCV: '/api/v1/reportes/lcv',
    F29: '/api/v1/reportes/f29',
  },
  SII: {
    CERTIFICATE_STATUS: '/api/v1/sii/certificate/status',
    CERTIFICATE_LIST: '/api/v1/sii/certificate/list',
    CERTIFICATE_LOAD: '/api/v1/sii/certificate/load',
    CERTIFICATE_ASSOCIATE: '/api/v1/sii/certificate/associate',
    CONNECTIVITY: '/api/v1/sii/connectivity',
  },
  CAF: {
    STATUS: '/api/v1/caf/status',
    LOAD: '/api/v1/caf/load',
  },
  CERTIFICATION: {
    PREREQUISITES: '/api/v1/certification/prerequisites',
    WIZARD: '/api/v1/certification/wizard',
    STATUS: '/api/v1/certification/status',
    COMPLETE_STEP: '/api/v1/certification/complete-step',
    UPLOAD_SET: '/api/v1/certification/upload-set',
    PROCESS_SET: '/api/v1/certification/process-set',
    RESET: '/api/v1/certification/reset',
  },
  CONTABILIDAD: {
    JOURNALS: '/api/v1/contabilidad/journals',
    PLAN_CUENTAS: '/api/v1/contabilidad/plan-cuentas',
    LIBRO_DIARIO: '/api/v1/contabilidad/libro-diario',
    LIBRO_MAYOR: '/api/v1/contabilidad/libro-mayor',
    BALANCE: '/api/v1/contabilidad/balance',
    RESULTADOS: '/api/v1/contabilidad/resultados',
    CONCILIACION: '/api/v1/contabilidad/conciliacion',
    FLUJO_CAJA: '/api/v1/contabilidad/flujo-caja',
    CENTROS_COSTO: '/api/v1/contabilidad/centros-costo',
    SETUP: '/api/v1/contabilidad/setup',
    CARTOLA: '/api/v1/contabilidad/cartola',
    ASIENTOS: '/api/v1/contabilidad/asientos',
    AUXILIAR: '/api/v1/contabilidad/auxiliar',
  },
  BANK: {
    ACCOUNTS: '/api/v1/bank/accounts',
    ACCOUNT_BY_ID: (id: number) => `/api/v1/bank/accounts/${id}` as const,
    TRANSACTIONS: (accountId: number) => `/api/v1/bank/accounts/${accountId}/transactions` as const,
    CREDENTIALS: (accountId: number) => `/api/v1/bank/accounts/${accountId}/credentials` as const,
    RECONCILE: (accountId: number) => `/api/v1/bank/accounts/${accountId}/reconcile` as const,
    UNRECONCILE: (accountId: number) => `/api/v1/bank/accounts/${accountId}/unreconcile` as const,
  },
  COMPRAS: {
    PEDIDOS: '/api/v1/compras/pedidos',
    PEDIDO_BY_ID: (id: string) => `/api/v1/compras/pedidos/${id}` as const,
    PEDIDO_ACTION: (id: number, action: string) => `/api/v1/compras/pedidos/${id}/${action}` as const,
  },
} as const
