/**
 * CUENTAX — AES-256-GCM Encryption for sensitive credentials
 * ============================================================
 * Used to encrypt SII web passwords at rest in PostgreSQL.
 * Key derived from INTERNAL_SECRET via PBKDF2.
 */

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'node:crypto'
import { config } from './config.js'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12       // GCM recommended
const TAG_LENGTH = 16      // Auth tag
const SALT = 'cuentax-sii-cred-v1'  // Static salt (key uniqueness comes from INTERNAL_SECRET)

function deriveKey(): Buffer {
  return pbkdf2Sync(config.INTERNAL_SECRET, SALT, 100_000, 32, 'sha256')
}

/**
 * Encrypt a plaintext string. Returns base64-encoded `iv:ciphertext:tag`.
 */
export function encrypt(plaintext: string): string {
  const key = deriveKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const tag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${encrypted}:${tag.toString('hex')}`
}

/**
 * Decrypt an encrypted string (format: `iv:ciphertext:tag`).
 */
export function decrypt(encryptedStr: string): string {
  const [ivHex, ciphertext, tagHex] = encryptedStr.split(':')
  if (!ivHex || !ciphertext || !tagHex) {
    throw new Error('Invalid encrypted string format')
  }

  const key = deriveKey()
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}
