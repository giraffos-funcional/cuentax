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

// ── Relations ─────────────────────────────────────────────────
export const companiesRelations = relations(companies, ({ many }) => ({
  documents: many(dteDocuments),
  quotations: many(quotations),
  contacts: many(contacts),
  products: many(products),
  cafs: many(cafConfigs),
  apiKeys: many(apiKeys),
  webhooks: many(webhookEndpoints),
}))

export const dteDocumentsRelations = relations(dteDocuments, ({ one }) => ({
  company: one(companies, { fields: [dteDocuments.company_id], references: [companies.id] }),
}))

export const quotationsRelations = relations(quotations, ({ one }) => ({
  company: one(companies, { fields: [quotations.company_id], references: [companies.id] }),
}))
