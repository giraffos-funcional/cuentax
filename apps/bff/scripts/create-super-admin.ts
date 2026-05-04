/**
 * T1.12 — Create the first super-admin (or any subsequent one).
 *
 * Reads creds from CLI flags or env. Bootstraps cuentax internal staff
 * accounts that authenticate at admin.cuentax.cl.
 *
 * Uso:
 *   pnpm --filter @cuentax/bff exec tsx scripts/create-super-admin.ts \
 *     --email francisco@giraffos.com --role owner --password '...'
 *
 * Si no pasás --password, lo lee de la env SUPER_ADMIN_PASSWORD para no
 * dejar la contraseña en el history del shell.
 */
import { createSuperAdmin } from '@/services/super-admin.service'
import { logger } from '@/core/logger'
import { pool } from '@/db/client'

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return undefined
  return process.argv[idx + 1]
}

async function main(): Promise<void> {
  const email = arg('email')
  if (!email) throw new Error('Missing --email')

  const password = arg('password') ?? process.env['SUPER_ADMIN_PASSWORD']
  if (!password) throw new Error('Missing --password (or SUPER_ADMIN_PASSWORD env)')
  if (password.length < 12) throw new Error('Password must be at least 12 characters')

  const role = (arg('role') ?? 'owner') as 'owner' | 'support' | 'finance'
  if (!['owner', 'support', 'finance'].includes(role)) {
    throw new Error(`Invalid role: ${role}`)
  }

  const name = arg('name')

  const created = await createSuperAdmin({ email, password, name, role })
  logger.info({ id: created.id, email: created.email, role: created.role }, '✅ Super admin created')
  console.log(JSON.stringify(created, null, 2))
}

main()
  .then(async () => {
    await pool.end()
    process.exit(0)
  })
  .catch(async (err) => {
    logger.error({ err }, 'Failed to create super admin')
    await pool.end().catch(() => {})
    process.exit(1)
  })
