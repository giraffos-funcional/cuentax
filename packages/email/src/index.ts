/**
 * Email provider abstraction.
 *
 * Concrete providers:
 *   - LogProvider:     prints to console (dev / pre-creds).
 *   - PostmarkProvider: hits postmarkapp.com (recommended).
 *   - ResendProvider:   hits resend.com (alternative).
 *
 * Pick by env:  EMAIL_PROVIDER=postmark | resend | log
 */

export interface EmailMessage {
  to: string
  from: string
  subject: string
  html: string
  text?: string
  /** Optional message stream / category for analytics. */
  stream?: string
}

export interface EmailProvider {
  readonly name: string
  send(msg: EmailMessage): Promise<{ provider_msg_id?: string }>
}

// ── Log provider — writes to stdout, never throws. ────────────────
export class LogEmailProvider implements EmailProvider {
  readonly name = 'log'
  async send(msg: EmailMessage): Promise<{ provider_msg_id: string }> {
    const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    // eslint-disable-next-line no-console
    console.log(`[email:log] → ${msg.to}: ${msg.subject}\n${msg.text ?? msg.html.replace(/<[^>]+>/g, '')}\n`)
    return { provider_msg_id: id }
  }
}

// ── Postmark provider ────────────────────────────────────────────
export interface PostmarkConfig {
  token: string
  fetchImpl?: typeof fetch
}
export class PostmarkProvider implements EmailProvider {
  readonly name = 'postmark'
  private readonly fetchImpl: typeof fetch
  constructor(private readonly config: PostmarkConfig) {
    if (!config.token) throw new Error('PostmarkProvider: token required')
    this.fetchImpl = config.fetchImpl ?? fetch
  }
  async send(msg: EmailMessage): Promise<{ provider_msg_id?: string }> {
    const res = await this.fetchImpl('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'accept':       'application/json',
        'content-type': 'application/json',
        'x-postmark-server-token': this.config.token,
      },
      body: JSON.stringify({
        From:        msg.from,
        To:          msg.to,
        Subject:     msg.subject,
        HtmlBody:    msg.html,
        TextBody:    msg.text ?? msg.html.replace(/<[^>]+>/g, ''),
        MessageStream: msg.stream ?? 'outbound',
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Postmark ${res.status}: ${body.slice(0, 300)}`)
    }
    const j = (await res.json()) as { MessageID?: string }
    return { provider_msg_id: j.MessageID }
  }
}

// ── Resend provider ───────────────────────────────────────────────
export interface ResendConfig {
  apiKey: string
  fetchImpl?: typeof fetch
}
export class ResendProvider implements EmailProvider {
  readonly name = 'resend'
  private readonly fetchImpl: typeof fetch
  constructor(private readonly config: ResendConfig) {
    if (!config.apiKey) throw new Error('ResendProvider: apiKey required')
    this.fetchImpl = config.fetchImpl ?? fetch
  }
  async send(msg: EmailMessage): Promise<{ provider_msg_id?: string }> {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${this.config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from:    msg.from,
        to:      [msg.to],
        subject: msg.subject,
        html:    msg.html,
        text:    msg.text,
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`)
    }
    const j = (await res.json()) as { id?: string }
    return { provider_msg_id: j.id }
  }
}

export function createEmailProvider(env: {
  EMAIL_PROVIDER?: string
  POSTMARK_TOKEN?: string
  RESEND_API_KEY?: string
}): EmailProvider {
  const which = (env.EMAIL_PROVIDER ?? 'log').toLowerCase()
  if (which === 'postmark') {
    if (!env.POSTMARK_TOKEN) throw new Error('POSTMARK_TOKEN required when EMAIL_PROVIDER=postmark')
    return new PostmarkProvider({ token: env.POSTMARK_TOKEN })
  }
  if (which === 'resend') {
    if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY required when EMAIL_PROVIDER=resend')
    return new ResendProvider({ apiKey: env.RESEND_API_KEY })
  }
  return new LogEmailProvider()
}
