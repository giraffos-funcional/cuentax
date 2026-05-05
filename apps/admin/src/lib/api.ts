/**
 * BFF client for the admin app. Reads the admin JWT from the
 * `cx_admin_token` HTTP-only cookie and attaches it to every request.
 *
 * Use only inside server components / server actions / route handlers —
 * never ship this to the browser.
 */
import { cookies } from 'next/headers'

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:4000'

export class AdminApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`Admin API ${status}`)
  }
}

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Override token (used during the login flow before the cookie exists). */
  token?: string
  /** Forward query params (Record<string, string | number | undefined>). */
  query?: Record<string, string | number | boolean | undefined | null>
}

export async function adminFetch<T = unknown>(
  path: string,
  opts: FetchOptions = {},
): Promise<T> {
  const url = new URL(`/api/admin${path}`, BFF_URL)
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
    }
  }

  const token = opts.token ?? cookies().get('cx_admin_token')?.value

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  })

  if (!res.ok) {
    let body: unknown
    try {
      body = await res.json()
    } catch {
      body = await res.text()
    }
    throw new AdminApiError(res.status, body)
  }
  return (await res.json()) as T
}

// ── Typed wrappers ────────────────────────────────────────────────
export interface MetricsOverview {
  tenants: { total: number; active: number; trialing: number; suspended: number }
  companies_total: number
  mrr_clp: number
  arr_clp: number
}

export interface Tenant {
  id: number
  slug: string
  name: string
  status: string
  plan_id: number | null
  primary_rut: string | null
  billing_email: string | null
  revenue_share_rate_contabilidad: string
  revenue_share_rate_remuneraciones: string
  trial_ends_at: string | null
  created_at: string
}

export interface Plan {
  id: number
  code: string
  name: string
  base_price_clp: number
  included_dtes: number
  included_companies: number
  overage_price_per_dte_clp: number
}

export interface Invoice {
  id: number
  tenant_id: number
  subscription_id: number | null
  period: string
  status: 'draft' | 'issued' | 'paid' | 'past_due' | 'void'
  subtotal_clp: number
  iva_clp: number
  total_clp: number
  due_at: string | null
  paid_at: string | null
  created_at: string
}

export interface TrendPoint {
  period: string
  tenants_created: number
  invoices_total_clp: number
  invoices_paid_clp: number
  dtes_emitted: number
}

export interface RevenueShareRun {
  id: number
  tenant_id: number
  period: string
  status: 'calculating' | 'ready' | 'invoiced' | 'paid' | 'locked'
  total_contabilidad_clp: number
  total_remuneraciones_clp: number
  share_contabilidad_clp: number
  share_remuneraciones_clp: number
  total_share_clp: number
  rate_contabilidad: string
  rate_remuneraciones: string
  invoice_id: number | null
  calculated_at: string | null
  locked_at: string | null
}
