import { describe, it, expect, vi } from 'vitest'
import { setTenantSetting, withTenantContext, type SqlExecutor } from '../rls'

function makeExec(): SqlExecutor & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    async execute(sql: string) {
      calls.push(sql)
    },
  }
}

describe('setTenantSetting', () => {
  it('emits SET LOCAL by default', async () => {
    const exec = makeExec()
    await setTenantSetting(exec, 42)
    expect(exec.calls).toEqual([`SET LOCAL app.current_tenant = '42'`])
  })

  it('emits SET (session) when local=false', async () => {
    const exec = makeExec()
    await setTenantSetting(exec, 1, { local: false })
    expect(exec.calls).toEqual([`SET app.current_tenant = '1'`])
  })

  it('rejects non-positive ids', async () => {
    const exec = makeExec()
    await expect(setTenantSetting(exec, 0)).rejects.toThrow(/Invalid tenantId/)
    await expect(setTenantSetting(exec, -3)).rejects.toThrow(/Invalid tenantId/)
    await expect(setTenantSetting(exec, 1.5)).rejects.toThrow(/Invalid tenantId/)
  })

  it('rejects unsafe setting keys', async () => {
    const exec = makeExec()
    await expect(
      setTenantSetting(exec, 1, { settingKey: "app.tenant; DROP" }),
    ).rejects.toThrow(/Unsafe setting key/)
  })
})

describe('withTenantContext', () => {
  it('sets tenant then runs fn', async () => {
    const exec = makeExec()
    const fn = vi.fn(async () => 'ok')
    const result = await withTenantContext(exec, 7, fn)
    expect(result).toBe('ok')
    expect(exec.calls).toEqual([`SET LOCAL app.current_tenant = '7'`])
    expect(fn).toHaveBeenCalledOnce()
  })

  it('propagates errors from fn', async () => {
    const exec = makeExec()
    await expect(
      withTenantContext(exec, 1, async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
  })
})
