/**
 * Email templates — small inline-CSS HTML strings ready for Postmark/Resend.
 * Plain functions to avoid pulling in a templating engine. The look is
 * intentionally simple to render reliably across Gmail/Outlook/Apple Mail.
 */

const COLORS = {
  primary: '#2563eb',
  fg:      '#18181b',
  muted:   '#52525b',
  border:  '#e4e4e7',
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c
  ))
}

function shell(content: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:${COLORS.fg};background:#f4f4f5;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;border:1px solid ${COLORS.border};">
      ${content}
      <hr style="margin:24px 0;border:0;border-top:1px solid ${COLORS.border}" />
      <p style="font-size:12px;color:${COLORS.muted};margin:0">
        Cuentax · plataforma de contabilidad y facturación electrónica para Chile<br/>
        <a href="https://cuentax.cl" style="color:${COLORS.primary}">cuentax.cl</a>
      </p>
    </div>
  </body></html>`
}

export interface WelcomeEmailInput {
  tenantName: string
  tenantSlug: string
  loginUrl: string
  expiresAt: Date
}

export function welcomeMagicLink(input: WelcomeEmailInput): { subject: string; html: string } {
  return {
    subject: `Bienvenido/a a Cuentax — ${input.tenantName}`,
    html: shell(`
      <h1 style="font-size:22px;margin:0 0 12px 0">Tu cuenta Cuentax está lista</h1>
      <p style="color:${COLORS.muted};margin:0 0 24px 0">
        Acabamos de crear una cuenta para <strong>${escapeHtml(input.tenantName)}</strong>.
        Hacé clic abajo para entrar por primera vez.
      </p>
      <p>
        <a href="${input.loginUrl}" style="display:inline-block;background:${COLORS.primary};color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:500">
          Entrar a Cuentax
        </a>
      </p>
      <p style="color:${COLORS.muted};font-size:13px;margin-top:24px">
        El link expira el ${input.expiresAt.toLocaleString('es-CL', { timeZone: 'America/Santiago' })}.
        Si no fuiste vos, podés ignorar este mensaje.
      </p>
      <p style="color:${COLORS.muted};font-size:12px;margin-top:16px">
        Tu URL: <a href="https://${input.tenantSlug}.cuentax.cl">${input.tenantSlug}.cuentax.cl</a>
      </p>
    `),
  }
}

export interface PasswordResetInput {
  resetUrl: string
}

export function passwordReset(input: PasswordResetInput): { subject: string; html: string } {
  return {
    subject: 'Cuentax Admin — restablecer contraseña',
    html: shell(`
      <h1 style="font-size:20px;margin:0 0 12px 0">Restablecer contraseña</h1>
      <p style="color:${COLORS.muted}">Hicimos un link para restablecer tu contraseña de Cuentax Admin.</p>
      <p>
        <a href="${input.resetUrl}" style="display:inline-block;background:${COLORS.primary};color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none">
          Restablecer ahora
        </a>
      </p>
      <p style="color:${COLORS.muted};font-size:13px">Expira en 24h. Si no fuiste vos, ignorá este mensaje.</p>
    `),
  }
}

export interface InvoiceIssuedInput {
  tenantName: string
  period: string
  totalCLP: number
  invoiceUrl: string
}

export function invoiceIssued(input: InvoiceIssuedInput): { subject: string; html: string } {
  const fmt = `$${Math.round(input.totalCLP).toLocaleString('es-CL')}`
  return {
    subject: `Factura Cuentax ${input.period} — ${fmt}`,
    html: shell(`
      <h1 style="font-size:20px;margin:0 0 12px 0">Tu factura del período ${input.period}</h1>
      <p style="color:${COLORS.muted}">
        Hola ${escapeHtml(input.tenantName)}, generamos tu factura mensual.
      </p>
      <p style="font-size:18px;font-weight:600">Total: ${fmt}</p>
      <p>
        <a href="${input.invoiceUrl}" style="display:inline-block;background:${COLORS.primary};color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none">
          Ver factura
        </a>
      </p>
    `),
  }
}

export interface PaymentFailedInput {
  tenantName: string
  invoicePeriod: string
  retryUrl: string
}

export function paymentFailed(input: PaymentFailedInput): { subject: string; html: string } {
  return {
    subject: '⚠️ Cuentax — no pudimos procesar tu pago',
    html: shell(`
      <h1 style="font-size:20px;margin:0 0 12px 0;color:#b45309">No pudimos cobrar tu factura ${input.invoicePeriod}</h1>
      <p style="color:${COLORS.muted}">
        Hola ${escapeHtml(input.tenantName)}, el cobro automático del período ${input.invoicePeriod} fue rechazado.
        Si no actualizás tu medio de pago, suspenderemos la cuenta a los 14 días.
      </p>
      <p>
        <a href="${input.retryUrl}" style="display:inline-block;background:${COLORS.primary};color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none">
          Actualizar medio de pago
        </a>
      </p>
    `),
  }
}
