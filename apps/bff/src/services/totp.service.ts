/**
 * TOTP (RFC 6238) — implementación stdlib (sin dep externa).
 * Alfabeto base32 RFC 4648, ventana ±1 de 30s, SHA-1, 6 dígitos.
 *
 * Para super-admins (Phase 01 T1.3): generateSecret() crea un secreto
 * base32 imprimible, otpauthUrl() devuelve la URL para el QR de
 * Google Authenticator / Authy, verify() compara contra el código
 * que ingresa el usuario.
 */
import { createHmac, randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto'
import { config } from '@/core/config'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP_SECONDS = 30
const DIGITS = 6
const WINDOW = 1 // accept ± 1 step (≈ 30s leeway)

// ── base32 encode/decode (RFC 4648) ─────────────────────────────
export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f]
  return out
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch)
    if (idx === -1) throw new Error(`Invalid base32 char: ${ch}`)
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

// ── HOTP / TOTP (RFC 4226 / 6238) ───────────────────────────────
function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', secret).update(buf).digest()
  const offset = hmac[hmac.length - 1]! & 0x0f
  const code =
    ((hmac[offset]!     & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) <<  8) |
    ( hmac[offset + 3]! & 0xff)
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0')
}

export function totpAt(secretBase32: string, when: Date = new Date()): string {
  const counter = Math.floor(when.getTime() / 1000 / STEP_SECONDS)
  return hotp(base32Decode(secretBase32), counter)
}

export function verifyTotp(secretBase32: string, code: string): boolean {
  const cleaned = code.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(cleaned)) return false
  const now = Math.floor(Date.now() / 1000 / STEP_SECONDS)
  const secret = base32Decode(secretBase32)
  for (let w = -WINDOW; w <= WINDOW; w++) {
    if (hotp(secret, now + w) === cleaned) return true
  }
  return false
}

// ── Secret + provisioning ───────────────────────────────────────
export function generateSecret(): string {
  return base32Encode(randomBytes(20)) // 160 bits
}

export function otpauthUrl(secretBase32: string, account: string, issuer = 'Cuentax'): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  })
  return `otpauth://totp/${label}?${params.toString()}`
}

// ── At-rest encryption for the stored secret ────────────────────
// We encrypt the base32 secret with AES-256-GCM keyed by JWT_SECRET via
// scrypt. This keeps secrets safe even if the DB is compromised.
function key(): Buffer {
  return scryptSync(config.JWT_SECRET, 'cuentax-totp-salt', 32)
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `gcm$${iv.toString('hex')}$${tag.toString('hex')}$${enc.toString('hex')}`
}

export function decryptSecret(encoded: string): string {
  const parts = encoded.split('$')
  if (parts.length !== 4 || parts[0] !== 'gcm') {
    throw new Error('Invalid encrypted secret format')
  }
  const iv  = Buffer.from(parts[1]!, 'hex')
  const tag = Buffer.from(parts[2]!, 'hex')
  const enc = Buffer.from(parts[3]!, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}
