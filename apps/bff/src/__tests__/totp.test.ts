import { describe, it, expect } from 'vitest'
import {
  base32Encode, base32Decode,
  generateSecret, totpAt, verifyTotp, otpauthUrl,
  encryptSecret, decryptSecret,
} from '@/services/totp.service'

describe('base32 round-trip', () => {
  it('encodes and decodes back to the same bytes', () => {
    for (const bytes of [Buffer.from('hello'), Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])]) {
      const round = base32Decode(base32Encode(bytes))
      expect(round.equals(bytes)).toBe(true)
    }
  })

  it('rejects invalid characters', () => {
    expect(() => base32Decode('!!!')).toThrow()
  })
})

describe('TOTP', () => {
  it('generates 160-bit secrets', () => {
    const s = generateSecret()
    expect(s).toMatch(/^[A-Z2-7]+$/)
    // 160 bits = 32 base32 chars
    expect(s.length).toBe(32)
  })

  it('verifies a freshly-generated code', () => {
    const s = generateSecret()
    const code = totpAt(s)
    expect(verifyTotp(s, code)).toBe(true)
  })

  it('rejects wrong code', () => {
    const s = generateSecret()
    expect(verifyTotp(s, '000000')).toBe(false)
  })

  it('accepts ±30s clock skew', () => {
    const s = generateSecret()
    const past = totpAt(s, new Date(Date.now() - 30_000))
    const futr = totpAt(s, new Date(Date.now() + 30_000))
    expect(verifyTotp(s, past)).toBe(true)
    expect(verifyTotp(s, futr)).toBe(true)
  })

  it('matches RFC 6238 test vectors', () => {
    // RFC vector: ascii secret "12345678901234567890" SHA-1 → at T=59 → "94287082"
    // Our base32 of those 20 ASCII bytes:
    const secret = base32Encode(Buffer.from('12345678901234567890'))
    expect(totpAt(secret, new Date(59 * 1000))).toBe('287082'.padStart(6, '0'))
  })

  it('rejects malformed input', () => {
    expect(verifyTotp(generateSecret(), 'abc')).toBe(false)
    expect(verifyTotp(generateSecret(), '')).toBe(false)
    expect(verifyTotp(generateSecret(), '12345')).toBe(false)
  })

  it('builds a Google-Authenticator-compatible otpauth URL', () => {
    const url = otpauthUrl('JBSWY3DPEHPK3PXP', 'francisco@giraffos.com')
    expect(url).toMatch(/^otpauth:\/\/totp\/Cuentax%3Afrancisco%40giraffos\.com\?/)
    expect(url).toContain('secret=JBSWY3DPEHPK3PXP')
    expect(url).toContain('issuer=Cuentax')
  })
})

describe('encrypt/decrypt secret', () => {
  it('round-trips with AES-256-GCM', () => {
    const s = generateSecret()
    const enc = encryptSecret(s)
    expect(enc).toMatch(/^gcm\$/)
    expect(decryptSecret(enc)).toBe(s)
  })

  it('rejects malformed encoded secrets', () => {
    expect(() => decryptSecret('not-encoded')).toThrow()
    expect(() => decryptSecret('gcm$a$b$c')).toThrow()
  })
})
