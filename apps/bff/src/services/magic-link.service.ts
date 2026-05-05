/**
 * Magic-link tokens (Phase 04 T4.3).
 *
 * Issues a single-use, hashed-at-rest, 24h-TTL token bound to (tenant, email).
 * Sends an email via the @cuentax/email provider with the link the user
 * can click to log in for the first time (or reset their password).
 */
import { createHash, randomBytes } from 'crypto'
import { eq, and, gt, isNull } from 'drizzle-orm'
import { createEmailProvider, welcomeMagicLink } from '@cuentax/email'
import { config } from '@/core/config'
import { db } from '@/db/client'
import { magicLinks } from '@/db/schema'
import { logger } from '@/core/logger'

const TTL_MS = 24 * 60 * 60 * 1000  // 24h

const emailProvider = createEmailProvider({
  EMAIL_PROVIDER: config.EMAIL_PROVIDER,
  POSTMARK_TOKEN: config.POSTMARK_TOKEN,
  RESEND_API_KEY: config.RESEND_API_KEY,
})

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export type MagicLinkPurpose = 'first_login' | 'password_reset'

export async function issueMagicLink(input: {
  tenantId?: number
  email: string
  purpose: MagicLinkPurpose
  redirect?: string
}): Promise<{ token: string; expires_at: Date }> {
  const raw = randomBytes(32).toString('base64url')
  const token_hash = hashToken(raw)
  const expires_at = new Date(Date.now() + TTL_MS)

  await db.insert(magicLinks).values({
    tenant_id:  input.tenantId ?? null,
    email:      input.email.toLowerCase(),
    token_hash,
    purpose:    input.purpose,
    expires_at,
    metadata:   input.redirect ?? null,
  })

  return { token: raw, expires_at }
}

export async function sendWelcomeMagicLink(input: {
  tenantId: number
  tenantSlug: string
  tenantName: string
  email: string
}): Promise<void> {
  const { token, expires_at } = await issueMagicLink({
    tenantId: input.tenantId,
    email:    input.email,
    purpose:  'first_login',
  })

  const link = `https://${input.tenantSlug}.cuentax.cl/login?token=${encodeURIComponent(token)}`
  const tpl = welcomeMagicLink({
    tenantName: input.tenantName,
    tenantSlug: input.tenantSlug,
    loginUrl:   link,
    expiresAt:  expires_at,
  })
  try {
    await emailProvider.send({
      to:      input.email,
      from:    config.EMAIL_FROM,
      subject: tpl.subject,
      html:    tpl.html,
    })
    logger.info({ tenantId: input.tenantId, email: input.email, provider: emailProvider.name }, 'magic_link.sent')
  } catch (err) {
    logger.error({ err, email: input.email }, 'magic_link.send_failed')
    // Note: token already in DB; user can request resend if needed.
  }
}

export async function consumeMagicLink(rawToken: string): Promise<{
  ok: true
  tenant_id: number | null
  email: string
  purpose: MagicLinkPurpose
} | { ok: false; reason: string }> {
  const token_hash = hashToken(rawToken)
  const rows = await db
    .select()
    .from(magicLinks)
    .where(
      and(
        eq(magicLinks.token_hash, token_hash),
        gt(magicLinks.expires_at, new Date()),
        isNull(magicLinks.consumed_at),
      ),
    )
    .limit(1)
  const link = rows[0]
  if (!link) return { ok: false, reason: 'not_found_or_expired' }

  await db
    .update(magicLinks)
    .set({ consumed_at: new Date() })
    .where(eq(magicLinks.id, link.id))

  return {
    ok: true,
    tenant_id: link.tenant_id,
    email:     link.email,
    purpose:   link.purpose as MagicLinkPurpose,
  }
}

