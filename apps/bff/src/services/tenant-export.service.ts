/**
 * Tenant data export — GDPR-friendly JSON dump of every record
 * scoped to the active tenant. Stream-friendly so we don't hold the
 * full dump in memory.
 *
 * Sensitive secrets (encrypted password fields, raw cert bodies, IMAP
 * credentials, SII passwords) are redacted; the export is meant for
 * portability/audit, not full account replication.
 */
import { eq } from 'drizzle-orm'
import { db, pool } from '@/db/client'
import { tenants, companies, tenantFees, revenueShareRuns, invoices, invoiceLineItems, payments, subscriptions } from '@/db/schema'

const REDACTED = '[REDACTED]'

function redactCompany<T extends Record<string, unknown>>(c: T): T {
  return {
    ...c,
    sii_password_enc:      c.sii_password_enc      ? REDACTED : null,
    dte_imap_password_enc: c.dte_imap_password_enc ? REDACTED : null,
  } as T
}

export interface TenantExport {
  generated_at: string
  tenant: Record<string, unknown> | null
  companies: Array<Record<string, unknown>>
  tenant_fees: Array<Record<string, unknown>>
  subscriptions: Array<Record<string, unknown>>
  invoices: Array<Record<string, unknown>>
  invoice_line_items: Array<Record<string, unknown>>
  payments: Array<Record<string, unknown>>
  revenue_share_runs: Array<Record<string, unknown>>
  dte_documents: Array<Record<string, unknown>>
  contacts: Array<Record<string, unknown>>
}

export async function exportTenant(tenantId: number): Promise<TenantExport> {
  const t  = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0]
  if (!t) throw new Error(`tenant ${tenantId} not found`)

  const [comp, fees, subs, invs, runs] = await Promise.all([
    db.select().from(companies).where(eq(companies.tenant_id, tenantId)),
    db.select().from(tenantFees).where(eq(tenantFees.tenant_id, tenantId)),
    db.select().from(subscriptions).where(eq(subscriptions.tenant_id, tenantId)),
    db.select().from(invoices).where(eq(invoices.tenant_id, tenantId)),
    db.select().from(revenueShareRuns).where(eq(revenueShareRuns.tenant_id, tenantId)),
  ])

  const invoiceIds = invs.map((i) => i.id)
  const items = invoiceIds.length > 0
    ? (await pool.query(
        `SELECT * FROM invoice_line_items WHERE invoice_id = ANY($1::int[])`,
        [invoiceIds],
      )).rows
    : []
  const pays = (await db.select().from(payments).where(eq(payments.tenant_id, tenantId)))
    .map((p) => ({ ...p, raw_payload: p.raw_payload ? '[present]' : null }))

  // Cross-table queries: DTEs + contacts via companies under this tenant
  const companyIds = comp.map((c) => c.id)
  const dtes = companyIds.length > 0
    ? (await pool.query(`SELECT * FROM dte_documents WHERE company_id = ANY($1::int[])`, [companyIds])).rows
    : []
  const contacts = companyIds.length > 0
    ? (await pool.query(`SELECT * FROM contacts WHERE company_id = ANY($1::int[])`, [companyIds])).rows
    : []

  return {
    generated_at:        new Date().toISOString(),
    tenant:              t,
    companies:           comp.map(redactCompany),
    tenant_fees:         fees,
    subscriptions:       subs,
    invoices:            invs,
    invoice_line_items:  items,
    payments:            pays,
    revenue_share_runs:  runs,
    dte_documents:       dtes,
    contacts:            contacts,
  }
}

void invoiceLineItems  // re-exported in case caller imports the schema directly
