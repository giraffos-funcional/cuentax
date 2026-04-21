/**
 * CUENTAX — Chilean Chart of Accounts Template
 * ================================================
 * Standard small-business chart following Chilean SII conventions.
 * Used to seed Odoo account.account when creating a Chilean company that
 * doesn't already have a proper PJ-compatible plan de cuentas loaded.
 *
 * Numbering follows the SII Plan de Cuentas Tipo for PYMES:
 *  1xxxx Activos
 *  2xxxx Pasivos
 *  3xxxx Patrimonio
 *  4xxxx Ingresos
 *  5xxxx Costos
 *  6xxxx Gastos
 *  7xxxx Resultado no operacional
 */

import type { AccountTemplate } from './chart-of-accounts-us-gaap'

export const CL_CHART: AccountTemplate[] = [
  // ═══════════════════════════════════════════════════════════
  // 1xxxx — ACTIVOS
  // ═══════════════════════════════════════════════════════════
  { code: '11010', name: 'Caja',                               account_type: 'asset_cash',       reconcile: false },
  { code: '11020', name: 'Banco Cuenta Corriente',             account_type: 'asset_cash',       reconcile: true  },
  { code: '11030', name: 'Banco Cuenta Vista',                 account_type: 'asset_cash',       reconcile: true  },
  { code: '11040', name: 'Depósitos a Plazo',                  account_type: 'asset_current',    reconcile: false },
  { code: '11210', name: 'Clientes Nacionales',                account_type: 'asset_receivable', reconcile: true  },
  { code: '11220', name: 'Clientes Extranjeros',               account_type: 'asset_receivable', reconcile: true  },
  { code: '11230', name: 'Documentos por Cobrar',              account_type: 'asset_receivable', reconcile: true  },
  { code: '11240', name: 'Cuentas por Cobrar Empleados',       account_type: 'asset_receivable', reconcile: true  },
  { code: '11310', name: 'IVA Crédito Fiscal',                 account_type: 'asset_current',    reconcile: false },
  { code: '11320', name: 'PPM por Recuperar',                  account_type: 'asset_current',    reconcile: false },
  { code: '11330', name: 'Retenciones por Recuperar',          account_type: 'asset_current',    reconcile: false },
  { code: '11410', name: 'Mercaderías / Existencias',          account_type: 'asset_current',    reconcile: false },
  { code: '11510', name: 'Gastos Pagados por Anticipado',      account_type: 'asset_prepayments',reconcile: false },
  { code: '11520', name: 'Seguros Pagados por Anticipado',     account_type: 'asset_prepayments',reconcile: false },
  { code: '12010', name: 'Muebles y Útiles',                   account_type: 'asset_fixed',      reconcile: false },
  { code: '12020', name: 'Equipos Computacionales',            account_type: 'asset_fixed',      reconcile: false },
  { code: '12030', name: 'Vehículos',                          account_type: 'asset_fixed',      reconcile: false },
  { code: '12040', name: 'Instalaciones',                      account_type: 'asset_fixed',      reconcile: false },
  { code: '12910', name: 'Depreciación Acumulada',             account_type: 'asset_fixed',      reconcile: false },

  // ═══════════════════════════════════════════════════════════
  // 2xxxx — PASIVOS
  // ═══════════════════════════════════════════════════════════
  { code: '21010', name: 'Proveedores Nacionales',             account_type: 'liability_payable',  reconcile: true  },
  { code: '21020', name: 'Proveedores Extranjeros',            account_type: 'liability_payable',  reconcile: true  },
  { code: '21030', name: 'Documentos por Pagar',               account_type: 'liability_payable',  reconcile: true  },
  { code: '21110', name: 'IVA Débito Fiscal',                  account_type: 'liability_current',  reconcile: false },
  { code: '21120', name: 'Impuesto Único Trabajadores',        account_type: 'liability_current',  reconcile: false },
  { code: '21130', name: 'Retención 10% Honorarios',           account_type: 'liability_current',  reconcile: false },
  { code: '21140', name: 'Impuesto a la Renta',                account_type: 'liability_current',  reconcile: false },
  { code: '21150', name: 'PPM por Pagar',                      account_type: 'liability_current',  reconcile: false },
  { code: '21210', name: 'Imposiciones por Pagar (AFP)',       account_type: 'liability_current',  reconcile: false },
  { code: '21220', name: 'Imposiciones Salud (Isapre/Fonasa)', account_type: 'liability_current',  reconcile: false },
  { code: '21230', name: 'Seguro Cesantía (AFC)',              account_type: 'liability_current',  reconcile: false },
  { code: '21310', name: 'Sueldos por Pagar',                  account_type: 'liability_current',  reconcile: true  },
  { code: '21320', name: 'Honorarios por Pagar',               account_type: 'liability_current',  reconcile: true  },
  { code: '21410', name: 'Préstamos Bancarios Corto Plazo',    account_type: 'liability_current',  reconcile: true  },
  { code: '21420', name: 'Tarjetas de Crédito',                account_type: 'credit_card',        reconcile: true  },
  { code: '22010', name: 'Préstamos Bancarios Largo Plazo',    account_type: 'liability_non_current', reconcile: true },

  // ═══════════════════════════════════════════════════════════
  // 3xxxx — PATRIMONIO
  // ═══════════════════════════════════════════════════════════
  { code: '31010', name: 'Capital Social',                     account_type: 'equity',            reconcile: false },
  { code: '31020', name: 'Aportes de Capital',                 account_type: 'equity',            reconcile: false },
  { code: '32010', name: 'Reserva Legal',                      account_type: 'equity',            reconcile: false },
  { code: '33010', name: 'Utilidades Acumuladas',              account_type: 'equity',            reconcile: false },
  { code: '33020', name: 'Resultado del Ejercicio',            account_type: 'equity',            reconcile: false },
  { code: '33030', name: 'Retiros de Socios',                  account_type: 'equity',            reconcile: false },

  // ═══════════════════════════════════════════════════════════
  // 4xxxx — INGRESOS
  // ═══════════════════════════════════════════════════════════
  { code: '41010', name: 'Ventas Afectas',                     account_type: 'income',            reconcile: false },
  { code: '41020', name: 'Ventas Exentas',                     account_type: 'income',            reconcile: false },
  { code: '41030', name: 'Ventas Exportación',                 account_type: 'income',            reconcile: false },
  { code: '41110', name: 'Ingresos por Servicios',             account_type: 'income',            reconcile: false },
  { code: '41210', name: 'Devoluciones y Rebajas sobre Ventas',account_type: 'income',            reconcile: false },
  { code: '49010', name: 'Ingresos Financieros',               account_type: 'income_other',      reconcile: false },
  { code: '49020', name: 'Otros Ingresos',                     account_type: 'income_other',      reconcile: false },

  // ═══════════════════════════════════════════════════════════
  // 5xxxx — COSTOS
  // ═══════════════════════════════════════════════════════════
  { code: '51010', name: 'Costo de Ventas',                    account_type: 'expense_direct_cost', reconcile: false },
  { code: '51020', name: 'Costo de Servicios',                 account_type: 'expense_direct_cost', reconcile: false },
  { code: '51030', name: 'Compras Mercaderías',                account_type: 'expense_direct_cost', reconcile: false },
  { code: '51040', name: 'Fletes sobre Compras',               account_type: 'expense_direct_cost', reconcile: false },

  // ═══════════════════════════════════════════════════════════
  // 6xxxx — GASTOS
  // ═══════════════════════════════════════════════════════════
  { code: '61010', name: 'Remuneraciones',                     account_type: 'expense',           reconcile: false },
  { code: '61020', name: 'Honorarios Profesionales',           account_type: 'expense',           reconcile: false },
  { code: '61030', name: 'Gratificaciones',                    account_type: 'expense',           reconcile: false },
  { code: '61040', name: 'Aguinaldos y Bonos',                 account_type: 'expense',           reconcile: false },
  { code: '61050', name: 'Imposiciones Empleador',             account_type: 'expense',           reconcile: false },
  { code: '61060', name: 'Indemnizaciones',                    account_type: 'expense',           reconcile: false },
  { code: '62010', name: 'Arriendo Oficinas',                  account_type: 'expense',           reconcile: false },
  { code: '62020', name: 'Servicios Básicos (Luz, Agua, Gas)', account_type: 'expense',           reconcile: false },
  { code: '62030', name: 'Teléfono e Internet',                account_type: 'expense',           reconcile: false },
  { code: '62040', name: 'Combustible',                        account_type: 'expense',           reconcile: false },
  { code: '62050', name: 'Mantención Vehículos',               account_type: 'expense',           reconcile: false },
  { code: '62060', name: 'Mantención Oficina',                 account_type: 'expense',           reconcile: false },
  { code: '62070', name: 'Seguros',                            account_type: 'expense',           reconcile: false },
  { code: '63010', name: 'Materiales de Oficina',              account_type: 'expense',           reconcile: false },
  { code: '63020', name: 'Aseo y Cafetería',                   account_type: 'expense',           reconcile: false },
  { code: '63030', name: 'Software y Licencias',               account_type: 'expense',           reconcile: false },
  { code: '63040', name: 'Servicios TI / Hosting',             account_type: 'expense',           reconcile: false },
  { code: '64010', name: 'Publicidad y Marketing',             account_type: 'expense',           reconcile: false },
  { code: '64020', name: 'Comisiones por Ventas',              account_type: 'expense',           reconcile: false },
  { code: '65010', name: 'Viáticos y Viajes',                  account_type: 'expense',           reconcile: false },
  { code: '65020', name: 'Alimentación / Colación',            account_type: 'expense',           reconcile: false },
  { code: '65030', name: 'Representación',                     account_type: 'expense',           reconcile: false },
  { code: '66010', name: 'Gastos Bancarios',                   account_type: 'expense',           reconcile: false },
  { code: '66020', name: 'Comisiones Bancarias',               account_type: 'expense',           reconcile: false },
  { code: '66030', name: 'Intereses Préstamos',                account_type: 'expense',           reconcile: false },
  { code: '67010', name: 'Asesoría Contable',                  account_type: 'expense',           reconcile: false },
  { code: '67020', name: 'Asesoría Legal',                     account_type: 'expense',           reconcile: false },
  { code: '67030', name: 'Capacitación',                       account_type: 'expense',           reconcile: false },
  { code: '68010', name: 'Depreciación',                       account_type: 'expense_depreciation', reconcile: false },
  { code: '68020', name: 'Amortización',                       account_type: 'expense_depreciation', reconcile: false },
  { code: '69010', name: 'Otros Gastos Operacionales',         account_type: 'expense',           reconcile: false },
  { code: '69020', name: 'Gastos No Documentados',             account_type: 'expense',           reconcile: false },
  { code: '69030', name: 'Gastos Rechazados (no deducibles)',  account_type: 'expense',           reconcile: false },

  // ═══════════════════════════════════════════════════════════
  // 7xxxx — RESULTADO NO OPERACIONAL
  // ═══════════════════════════════════════════════════════════
  { code: '71010', name: 'Diferencias de Cambio',              account_type: 'expense',           reconcile: false },
  { code: '71020', name: 'Corrección Monetaria',               account_type: 'expense',           reconcile: false },
  { code: '72010', name: 'Pérdida por Ventas de Activo Fijo',  account_type: 'expense',           reconcile: false },
  { code: '72020', name: 'Utilidad por Ventas de Activo Fijo', account_type: 'income_other',      reconcile: false },
]

export const CL_JOURNALS = [
  { code: 'VENTA', name: 'Ventas',            type: 'sale' },
  { code: 'COMPR', name: 'Compras',           type: 'purchase' },
  { code: 'BANCO', name: 'Banco',             type: 'bank' },
  { code: 'CAJA',  name: 'Caja',              type: 'cash' },
  { code: 'REMUN', name: 'Remuneraciones',    type: 'general' },
  { code: 'MISC',  name: 'Asientos Varios',   type: 'general' },
] as const
