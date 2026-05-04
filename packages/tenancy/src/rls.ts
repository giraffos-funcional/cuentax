/**
 * RLS context helpers.
 *
 * Postgres RLS policies in Cuentax read `current_setting('app.current_tenant')::int`.
 * Use `withTenantContext` to wrap a unit of work that must run as a given tenant.
 *
 * The executor argument is intentionally generic so this package stays
 * dependency-free. The BFF wires it to a Drizzle/pg client.
 */

export interface SqlExecutor {
  execute(sql: string, params?: ReadonlyArray<unknown>): Promise<unknown>
}

export interface TenantContextOptions {
  /** GUC key. Default `app.current_tenant`. */
  settingKey?: string
  /** If true, set with `SET LOCAL` (transaction-scoped). Default true. */
  local?: boolean
}

export const DEFAULT_TENANT_SETTING = 'app.current_tenant'

function isSafeSettingKey(key: string): boolean {
  return /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i.test(key)
}

export async function setTenantSetting(
  exec: SqlExecutor,
  tenantId: number,
  options: TenantContextOptions = {},
): Promise<void> {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new Error(`Invalid tenantId: ${tenantId}`)
  }
  const key = options.settingKey ?? DEFAULT_TENANT_SETTING
  if (!isSafeSettingKey(key)) {
    throw new Error(`Unsafe setting key: ${key}`)
  }
  const scope = options.local === false ? '' : 'LOCAL '
  await exec.execute(`SET ${scope}${key} = '${tenantId}'`)
}

export async function withTenantContext<T>(
  exec: SqlExecutor,
  tenantId: number,
  fn: () => Promise<T>,
  options: TenantContextOptions = {},
): Promise<T> {
  await setTenantSetting(exec, tenantId, options)
  return fn()
}
