/**
 * Magic-link tokens (Phase 04 T4.3).
 *
 * Issues a single-use, hashed-at-rest, 24h-TTL token bound to (tenant, email).
 * Sends an email via the @cuentax/email provider with the link the user
 * can click to log in for the first time (or reset their password).
 */
import { createHash, randomBytes } from 'crypto'
import { eq, and, gt, isNull } from 'drizzle-orm'
import { createEmailProvider } from '@cuentax/email'
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
  const subject = `Bienvenido/a a Cuentax — ${input.tenantName}`
  const html = `
    <div style="font-family: ui-sans-serif, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #18181b;">
      <h1 style="font-size: 22px; margin: 0 0 8px 0;">Tu cuenta Cuentax está lista</h1>
      <p style="color: #52525b; margin: 0 0 24px 0;">Hola, te acabamos de crear una cuenta para <strong>${escapeHtml(input.tenantName)}</strong>. Hacé clic abajo para entrar por primera vez.</p>
      <a href="${link}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">Entrar a Cuentax</a>
      <p style="color: #71717a; font-size: 13px; margin-top: 24px;">El link expira el ${expires_at.toLocaleString('es-CL', { timeZone: 'America/Santiago' })}. Si no fuiste vos, podés ignorar este mensaje.</p>
      <p style="color: #71717a; font-size: 12px; margin-top: 32px;">Tu URL: <a href="https://${input.tenantSlug}.cuentax.cl">${input.tenantSlug}.cuentax.cl</a></p>
    </div>
  `
  try {
    await emailProvider.send({
      to:      input.email,
      from:    config.EMAIL_FROM,
      subject,
      html,
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c
  ))
}
