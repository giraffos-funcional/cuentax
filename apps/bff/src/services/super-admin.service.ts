/**
 * Super Admin auth & management.
 *
 * Password hashing uses Node's built-in `scrypt` (no extra dep).
 * Format: `scrypt$N$r$p$saltHex$hashHex`. Cost params chosen for ~50ms hash
 * on a typical VPS (N=2^15, r=8, p=1 → 32-byte derived key).
 *
 * Refs: docs/multitenancy/phase-01-admin.md T1.2, T1.3
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import { eq, sql as drizzleSql } from 'drizzle-orm'
import { db } from '@/db/client'
import { superAdmins } from '@/db/schema'
import { logger } from '@/core/logger'

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

const SCRYPT_N = 1 << 15 // 32768
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEYLEN = 32
const SCRYPT_MAXMEM = 64 * 1024 * 1024 // 64 MB — default 32MB is too tight for N=32768

export type SuperAdminRole = 'owner' | 'support' | 'finance'

export interface SuperAdmin {
  id: number
  email: string
  name: string | null
  role: SuperAdminRole
  active: boolean
  totp_enabled: boolean
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(plain, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  })
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${hash.toString('hex')}`
}

export async function verifyPassword(plain: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  const salt = Buffer.from(parts[4]!, 'hex')
  const expected = Buffer.from(parts[5]!, 'hex')
  const got = await scrypt(plain, salt, expected.length, { N, r, p, maxmem: SCRYPT_MAXMEM })
  if (got.length !== expected.length) return false
  return timingSafeEqual(got, expected)
}

export async function findByEmail(email: string): Promise<{
  id: number
  email: string
  password_hash: string
  name: string | null
  role: SuperAdminRole
  active: boolean
  totp_enabled: boolean
  totp_secret_enc: string | null
} | null> {
  const rows = await db
    .select()
    .from(superAdmins)
    .where(drizzleSql`lower(${superAdmins.email}) = lower(${email})`)
    .limit(1)
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    email: r.email,
    password_hash: r.password_hash,
    name: r.name,
    role: r.role as SuperAdminRole,
    active: r.active,
    totp_enabled: r.totp_enabled,
    totp_secret_enc: r.totp_secret_enc,
  }
}

export async function findById(id: number): Promise<SuperAdmin | null> {
  const rows = await db.select().from(superAdmins).where(eq(superAdmins.id, id)).limit(1)
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role as SuperAdminRole,
    active: r.active,
    totp_enabled: r.totp_enabled,
  }
}

export async function createSuperAdmin(input: {
  email: string
  password: string
  name?: string
  role?: SuperAdminRole
}): Promise<SuperAdmin> {
  const hash = await hashPassword(input.password)
  const [row] = await db
    .insert(superAdmins)
    .values({
      email: input.email.toLowerCase(),
      password_hash: hash,
      name: input.name ?? null,
      role: input.role ?? 'support',
    })
    .returning()
  if (!row) throw new Error('Failed to create super admin')
  logger.info({ id: row.id, email: row.email, role: row.role }, 'super_admin.created')
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as SuperAdminRole,
    active: row.active,
    totp_enabled: row.totp_enabled,
  }
}

export async function recordLogin(id: number): Promise<void> {
  await db
    .update(superAdmins)
    .set({ last_login_at: new Date() })
    .where(eq(superAdmins.id, id))
}
