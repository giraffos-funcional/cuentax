/**
 * CUENTAX — Database Schema (Drizzle ORM)
 * ==========================================
 * Tablas principales del sistema CUENTAX.
 * Multi-tenant: company_id en todas las tablas de negocio.
 *
 * Para aplicar:
 *   pnpm drizzle-kit generate
 *   pnpm drizzle-kit migrate
 */

import {
  pgTable, serial, text, integer, bigint, boolean,
  timestamp, jsonb, uniqueIndex, index, pgEnum,
  varchar, decimal,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ── Enums ─────────────────────────────────────────────────────
export const dteStatusEnum = pgEnum('dte_status', [
  'borrador', 'firmado', 'enviado', 'aceptado', 'rechazado', 'anulado'
])

export const cotizacionStatusEnum = pgEnum('cotizacion_status', [
  'borrador', 'enviada', 'aceptada', 'rechazada', 'expirada', 'convertida'
])

export const formaPagoEnum = pgEnum('forma_pago', ['contado', 'credito', '30dias', '60dias'])

export const ambienteEnum = pgEnum('ambiente_sii', ['certificacion', 'produccion'])

export const rcvTipoEnum = pgEnum('rcv_tipo', ['compras', 'ventas'])

export const rcvSyncStatusEnum = pgEnum('rcv_sync_status', ['pendiente', 'sincronizado', 'error'])

// ══════════════════════════════════════════════════════════════
// EMPRESAS (Multi-tenant base)
// ══════════════════════════════════════════════════════════════
export const companies = pgTable('companies', {
  id:               serial('id').primaryKey(),
  odoo_company_id:  integer('odoo_company_id').unique(),
  rut:              varchar('rut', { length: 15 }).notNull().unique(),
  razon_social:     text('razon_social').notNull(),
  giro:             text('giro').notNull(),
  actividad_economica: integer('actividad_economica').default(620200),
  direccion:        text('direccion'),
  comuna:           varchar('comuna', { length: 50 }),
  ciudad:           varchar('ciudad', { length: 50 }).default('Santiago'),
  email:            text('email'),
  telefono:         varchar('telefono', { length: 20 }),
  // SII Config
  ambiente_sii:     ambienteEnum('ambiente_sii').default('certificacion'),
  cert_vence:       timestamp('cert_vence', { withTimezone: true }),
  cert_cargado:     boolean('cert_cargado').default(false),
  // SII Web Credentials (for RCV sync)
  sii_user:         varchar('sii_user', { length: 50 }),
  sii_password_enc: text('sii_password_enc'),  // AES-256 encrypted
  sii_rcv_auto_sync: boolean('sii_rcv_auto_sync').default(false),
  sii_rcv_last_sync: timestamp('sii_rcv_last_sync', { withTimezone: true }),
  // Plan
  plan:             varchar('plan', { length: 20 }).default('starter'),
  activo:           boolean('activo').default(true),
  created_at:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  rutIdx: uniqueIndex('companies_rut_idx').on(t.rut),
}))

// ══════════════════════════════════════════════════════════════
// DOCUMENTOS DTE
// ══════════════════════════════════════════════════════════════
export const dteDocuments = pgTable('dte_documents', {
  id:               serial('id').primaryKey(),
  company_id:       integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  // Identificación SII
  tipo_dte:         integer('tipo_dte').notNull(),       // 33, 39, 41, 56, 61, 110...
  folio:            integer('folio'),
  track_id:         varchar('track_id', { length: 50 }),
  estado:           dteStatusEnum('estado').default('borrador'),
  // Receptor
  rut_receptor:     varchar('rut_receptor', { length: 15 }).notNull(),
  razon_social_receptor: text('razon_social_receptor').notNull(),
  giro_receptor:    text('giro_receptor'),
  email_receptor:   text('email_receptor'),
  // Montos
  monto_neto:       bigint('monto_neto', { mode: 'number' }).default(0),
  monto_exento:     bigint('monto_exento', { mode: 'number' }).default(0),
  monto_iva:        bigint('monto_iva', { mode: 'number' }).default(0),
  monto_total:      bigint('monto_total', { mode: 'number' }).notNull(),
  // Fechas
  fecha_emision:    text('fecha_emision').notNull(),     // YYYY-MM-DD
  fecha_vencimiento: text('fecha_vencimiento'),
  // XML
  xml_firmado_b64:  text('xml_firmado_b64'),
  pdf_url:          text('pdf_url'),
  // Referencia (NC/ND)
  ref_tipo_doc:     integer('ref_tipo_doc'),
  ref_folio:        integer('ref_folio'),
  ref_motivo:       text('ref_motivo'),
  // Metadata
  items_json:       jsonb('items_json'),
  observaciones:    text('observaciones'),
  // Odoo sync
  odoo_move_id:     integer('odoo_move_id'),
  // Relaciones
  cotizacion_id:    integer('cotizacion_id'),
  created_by:       integer('created_by'),  // user id
  created_at:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  companyIdx:    index('dte_company_idx').on(t.company_id),
  trackIdIdx:    index('dte_track_id_idx').on(t.track_id),
  folioCompIdx:  uniqueIndex('dte_folio_company_idx').on(t.company_id, t.tipo_dte, t.folio),
  fechaIdx:      index('dte_fecha_idx').on(t.fecha_emision),
  estadoIdx:     index('dte_estado_idx').on(t.estado),
}))

// ══════════════════════════════════════════════════════════════
// COTIZACIONES
// ══════════════════════════════════════════════════════════════
export const quotations = pgTable('quotations', {
  id:               serial('id').primaryKey(),
  company_id:       integer('company_id').notNull().references(() => companies.id),
  numero:           integer('numero').notNull(),
  estado:           cotizacionStatusEnum('estado').default('borrador'),
  // Receptor
  rut_receptor:     varchar('rut_receptor', { length: 15 }).notNull(),
  razon_social_receptor: text('razon_social_receptor').notNull(),
  giro_receptor:    text('giro_receptor'),
  email_receptor:   text('email_receptor'),
  // Fechas
  fecha:            text('fecha').notNull(),
  valida_hasta:     text('valida_hasta').notNull(),
  // Montos
  monto_total:      bigint('monto_total', { mode: 'number' }).notNull(),
  // Items
  items_json:       jsonb('items_json').notNull(),
  observaciones:    text('observaciones'),
  // Conversión
  dte_id:           integer('dte_id'),  // DTE generado de esta cotización
  created_at:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  companyNumIdx: uniqueIndex('quotation_company_num_idx').on(t.company_id, t.numero),
}))

// ══════════════════════════════════════════════════════════════
// PEDIDOS DE COMPRA (Purchase Orders)
// ══════════════════════════════════════════════════════════════
export const purchaseOrderStatusEnum = pgEnum('purchase_order_status', [
  'solicitud', 'enviada', 'confirmada', 'recibida', 'cancelada'
])

export const purchaseOrders = pgTable('purchase_orders', {
  id:               serial('id').primaryKey(),
  company_id:       integer('company_id').notNull().references(() => companies.id),
  numero:           integer('numero').notNull(),
  estado:           purchaseOrderStatusEnum('estado').default('solicitud'),
  // Proveedor
  rut_proveedor:    varchar('rut_proveedor', { length: 15 }).notNull(),
  razon_social_proveedor: text('razon_social_proveedor').notNull(),
  email_proveedor:  text('email_proveedor'),
  // Fechas
  fecha:            text('fecha').notNull(),
  fecha_entrega:    text('fecha_entrega'),
  // Montos
  monto_neto:       bigint('monto_neto', { mode: 'number' }).default(0),
  monto_iva:        bigint('monto_iva', { mode: 'number' }).default(0),
  monto_total:      bigint('monto_total', { mode: 'number' }).notNull(),
  // Items
  items_json:       jsonb('items_json').notNull(),
  observaciones:    text('observaciones'),
  // Link to received invoice
  dte_document_id:  integer('dte_document_id'),
  created_at:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  companyNumIdx: uniqueIndex('po_company_num_idx').on(t.company_id, t.numero),
}))

// ══════════════════════════════════════════════════════════════
// CONTACTOS (Maestro de Clientes)
// ══════════════════════════════════════════════════════════════
export const contacts = pgTable('contacts', {
  id:               serial('id').primaryKey(),
  company_id:       integer('company_id').notNull().references(() => companies.id),
  rut:              varchar('rut', { length: 15 }).notNull(),
  razon_social:     text('razon_social').notNull(),
  giro:             text('giro'),
  email:            text('email'),
  telefono:         varchar('telefono', { length: 20 }),
  direccion:        text('direccion'),
  comuna:           varchar('comuna', { length: 50 }),
  es_proveedor:     boolean('es_proveedor').default(false),
  es_cliente:       boolean('es_cliente').default(true),
  activo:           boolean('activo').default(true),
  notas:            text('notas'),
  odoo_partner_id:  integer('odoo_partner_id'),
  created_at:       timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  rutCompanyIdx: uniqueIndex('contact_rut_company_idx').on(t.company_id, t.rut),
  namesIdx:      index('contact_names_idx').on(t.razon_social),
}))

// ══════════════════════════════════════════════════════════════
// PRODUCTOS (Maestro de Productos)
// ══════════════════════════════════════════════════════════════
export const products = pgTable('products', {
  id:               serial('id').primaryKey(),
  company_id:       integer('company_id').notNull().references(() => companies.id),
  codigo:           varchar('codigo', { length: 50 }),
  nombre:           text('nombre').notNull(),
  descripcion:      text('descripcion'),
  precio:           bigint('precio', { mode: 'number' }).notNull(),
  precio_con_iva:   bigint('precio_con_iva', { mode: 'number' }),
  unidad:           varchar('unidad', { length: 20 }).default('UN'),
  exento:           boolean('exento').default(false),
  activo:           boolean('activo').default(true),
  categoria:        text('categoria'),
  odoo_product_id:  integer('odoo_product_id'),
  created_at:       timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  companyCodigoIdx: index('product_company_codigo_idx').on(t.company_id, t.codigo),
  namesIdx:         index('product_names_idx').on(t.nombre),
}))

// ══════════════════════════════════════════════════════════════
// CAF CONFIGS (Folios autorizados)
// ══════════════════════════════════════════════════════════════
export const cafConfigs = pgTable('caf_configs', {
  id:               serial('id').primaryKey(),
  company_id:       integer('company_id').notNull().references(() => companies.id),
  tipo_dte:         integer('tipo_dte').notNull(),
  folio_desde:      integer('folio_desde').notNull(),
  folio_hasta:      integer('folio_hasta').notNull(),
  folio_actual:     integer('folio_actual').notNull(),
  fecha_autorizacion: text('fecha_autorizacion'),
  activo:           boolean('activo').default(true),
  created_at:       timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  companyTipoIdx: uniqueIndex('caf_company_tipo_idx').on(t.company_id, t.tipo_dte),
}))

// ══════════════════════════════════════════════════════════════
// API KEYS (Integraciones externas)
// ══════════════════════════════════════════════════════════════
export const apiKeys = pgTable('api_keys', {
  id:               serial('id').primaryKey(),
  company_id:       integer('company_id').notNull().references(() => companies.id),
  name:             text('name').notNull(),
  key_hash:         text('key_hash').notNull().unique(),  // SHA256 del key
  key_prefix:       varchar('key_prefix', { length: 10 }), // "cx_live_" primeros chars
  scopes:           text('scopes').array().default([]),
  last_used_at:     timestamp('last_used_at', { withTimezone: true }),
  expires_at:       timestamp('expires_at', { withTimezone: true }),
  activo:           boolean('activo').default(true),
  created_at:       timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ══════════════════════════════════════════════════════════════
// WEBHOOK ENDPOINTS
// ══════════════════════════════════════════════════════════════
export const webhookEndpoints = pgTable('webhook_endpoints', {
  id:               serial('id').primaryKey(),
  company_id:       integer('company_id').notNull().references(() => companies.id),
  url:              text('url').notNull(),
  secret_hash:      text('secret_hash').notNull(),
  events:           text('events').array().notNull(),
  activo:           boolean('activo').default(true),
  failure_count:    integer('failure_count').default(0),
  last_triggered_at: timestamp('last_triggered_at', { withTimezone: true }),
  created_at:       timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ══════════════════════════════════════════════════════════════
// AUDIT LOG
// ══════════════════════════════════════════════════════════════
export const auditLog = pgTable('audit_log', {
  id:               serial('id').primaryKey(),
  company_id:       integer('company_id'),
  user_id:          integer('user_id'),
  action:           text('action').notNull(),  // 'dte.emitir', 'login', etc.
  resource:         text('resource'),
  resource_id:      integer('resource_id'),
  ip:               text('ip'),
  user_agent:       text('user_agent'),
  payload_json:     jsonb('payload_json'),
  created_at:       timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  companyTimeIdx: index('audit_company_time_idx').on(t.company_id, t.created_at),
  actionIdx:      index('audit_action_idx').on(t.action),
}))

// ══════════════════════════════════════════════════════════════
// RCV REGISTROS (Registro de Compras y Ventas — monthly sync)
// ══════════════════════════════════════════════════════════════
export const rcvRegistros = pgTable('rcv_registros', {
  id:               serial('id').primaryKey(),
  company_id:       integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  tipo:             rcvTipoEnum('tipo').notNull(),
  mes:              integer('mes').notNull(),            // 1-12
  year:             integer('year').notNull(),
  // Totals
  total_neto:       bigint('total_neto', { mode: 'number' }).default(0),
  total_iva:        bigint('total_iva', { mode: 'number' }).default(0),
  total_exento:     bigint('total_exento', { mode: 'number' }).default(0),
  total_registros:  integer('total_registros').default(0),
  // Sync tracking
  sync_status:      rcvSyncStatusEnum('sync_status').default('pendiente'),
  sync_date:        timestamp('sync_date', { withTimezone: true }),
  sync_error:       text('sync_error'),
  // Audit
  created_at:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  companyPeriodIdx: uniqueIndex('rcv_company_period_idx').on(t.company_id, t.tipo, t.year, t.mes),
}))

// ══════════════════════════════════════════════════════════════
// RCV DETALLES (Line items from SII RCV)
// ══════════════════════════════════════════════════════════════
export const rcvDetalles = pgTable('rcv_detalles', {
  id:               serial('id').primaryKey(),
  rcv_id:           integer('rcv_id').notNull().references(() => rcvRegistros.id, { onDelete: 'cascade' }),
  company_id:       integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  // Document identification
  tipo_dte:         integer('tipo_dte').notNull(),
  folio:            integer('folio').notNull(),
  fecha_emision:    text('fecha_emision').notNull(),     // YYYY-MM-DD
  rut_contraparte:  varchar('rut_contraparte', { length: 15 }).notNull(),
  razon_social:     text('razon_social'),
  // Amounts
  neto:             bigint('neto', { mode: 'number' }).default(0),
  exento:           bigint('exento', { mode: 'number' }).default(0),
  iva:              bigint('iva', { mode: 'number' }).default(0),
  total:            bigint('total', { mode: 'number' }).default(0),
  iva_no_recuperable: bigint('iva_no_recuperable', { mode: 'number' }).default(0),
  // Reconciliation with local DTEs
  dte_document_id:  integer('dte_document_id').references(() => dteDocuments.id),
  odoo_move_id:     integer('odoo_move_id'),
  // SII metadata
  estado_rcv:       varchar('estado_rcv', { length: 20 }),  // REGISTRO, PENDIENTE, RECLAMADO, etc.
  detalle_json:     jsonb('detalle_json'),
  created_at:       timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  rcvIdx:          index('rcv_detalle_rcv_idx').on(t.rcv_id),
  companyIdx:      index('rcv_detalle_company_idx').on(t.company_id),
  folioIdx:        uniqueIndex('rcv_detalle_folio_idx').on(t.rcv_id, t.tipo_dte, t.folio),
}))

// ══════════════════════════════════════════════════════════════
// CUENTAS BANCARIAS
// ══════════════════════════════════════════════════════════════

export const bankAccountTypeEnum = pgEnum('bank_account_type', [
  'corriente', 'vista', 'ahorro', 'rut',
])

export const bankSyncStatusEnum = pgEnum('bank_sync_status', [
  'pendiente', 'sincronizado', 'error',
])

export const bankReconcileStatusEnum = pgEnum('bank_reconcile_status', [
  'sin_conciliar', 'conciliado', 'descartado',
])

export const bankAccounts = pgTable('bank_accounts', {
  id:               serial('id').primaryKey(),
  company_id:       integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  nombre:           text('nombre').notNull(),
  banco:            varchar('banco', { length: 50 }).notNull(),
  tipo_cuenta:      bankAccountTypeEnum('tipo_cuenta').default('corriente'),
  numero_cuenta:    varchar('numero_cuenta', { length: 30 }).notNull(),
  moneda:           varchar('moneda', { length: 5 }).default('CLP'),
  saldo:            bigint('saldo', { mode: 'number' }).default(0),
  saldo_fecha:      text('saldo_fecha'),
  bank_user:        varchar('bank_user', { length: 100 }),
  bank_password_enc: text('bank_password_enc'),
  scraping_enabled: boolean('scraping_enabled').default(false),
  last_sync:        timestamp('last_sync', { withTimezone: true }),
  sync_status:      bankSyncStatusEnum('sync_status').default('pendiente'),
  sync_error:       text('sync_error'),
  activo:           boolean('activo').default(true),
  created_at:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  companyIdx:    index('bank_acc_company_idx').on(t.company_id),
  companyNumIdx: uniqueIndex('bank_acc_company_num_idx').on(t.company_id, t.banco, t.numero_cuenta),
}))

export const bankTransactions = pgTable('bank_transactions', {
  id:               serial('id').primaryKey(),
  bank_account_id:  integer('bank_account_id').notNull().references(() => bankAccounts.id, { onDelete: 'cascade' }),
  company_id:       integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  fecha:            text('fecha').notNull(),
  descripcion:      text('descripcion').notNull(),
  referencia:       varchar('referencia', { length: 100 }),
  monto:            bigint('monto', { mode: 'number' }).notNull(),
  tipo:             varchar('tipo', { length: 10 }).notNull(), // 'debito' | 'credito'
  saldo:            bigint('saldo', { mode: 'number' }),
  source:           varchar('source', { length: 20 }).default('manual'), // 'scraping' | 'csv' | 'manual'
  external_id:      varchar('external_id', { length: 100 }),
  reconcile_status: bankReconcileStatusEnum('reconcile_status').default('sin_conciliar'),
  dte_document_id:  integer('dte_document_id'),
  reconcile_note:   text('reconcile_note'),
  reconciled_at:    timestamp('reconciled_at', { withTimezone: true }),
  created_at:       timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  accountIdx:  index('bank_tx_account_idx').on(t.bank_account_id),
  companyIdx:  index('bank_tx_company_idx').on(t.company_id),
  fechaIdx:    index('bank_tx_fecha_idx').on(t.fecha),
  externalIdx: uniqueIndex('bank_tx_external_idx').on(t.bank_account_id, t.external_id),
}))

// ── Relations ─────────────────────────────────────────────────
export const companiesRelations = relations(companies, ({ many }) => ({
  documents: many(dteDocuments),
  quotations: many(quotations),
  purchaseOrders: many(purchaseOrders),
  contacts: many(contacts),
  products: many(products),
  cafs: many(cafConfigs),
  apiKeys: many(apiKeys),
  webhooks: many(webhookEndpoints),
  rcvRegistros: many(rcvRegistros),
  bankAccounts: many(bankAccounts),
}))

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one }) => ({
  company: one(companies, { fields: [purchaseOrders.company_id], references: [companies.id] }),
}))

export const rcvRegistrosRelations = relations(rcvRegistros, ({ one, many }) => ({
  company: one(companies, { fields: [rcvRegistros.company_id], references: [companies.id] }),
  detalles: many(rcvDetalles),
}))

export const rcvDetallesRelations = relations(rcvDetalles, ({ one }) => ({
  registro: one(rcvRegistros, { fields: [rcvDetalles.rcv_id], references: [rcvRegistros.id] }),
  company: one(companies, { fields: [rcvDetalles.company_id], references: [companies.id] }),
  dteDocument: one(dteDocuments, { fields: [rcvDetalles.dte_document_id], references: [dteDocuments.id] }),
}))

export const dteDocumentsRelations = relations(dteDocuments, ({ one }) => ({
  company: one(companies, { fields: [dteDocuments.company_id], references: [companies.id] }),
}))

export const quotationsRelations = relations(quotations, ({ one }) => ({
  company: one(companies, { fields: [quotations.company_id], references: [companies.id] }),
}))

export const bankAccountsRelations = relations(bankAccounts, ({ one, many }) => ({
  company: one(companies, { fields: [bankAccounts.company_id], references: [companies.id] }),
  transactions: many(bankTransactions),
}))

export const bankTransactionsRelations = relations(bankTransactions, ({ one }) => ({
  bankAccount: one(bankAccounts, { fields: [bankTransactions.bank_account_id], references: [bankAccounts.id] }),
  company: one(companies, { fields: [bankTransactions.company_id], references: [companies.id] }),
}))
