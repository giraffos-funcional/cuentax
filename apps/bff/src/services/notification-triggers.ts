/**
 * CUENTAX — Notification Triggers
 * =================================
 * High-level helpers that build user-friendly notification messages
 * for specific business events and dispatch them via push notifications.
 *
 * Usage: import and call from jobs/workers when events occur.
 * Does NOT modify existing job files — callers import this module.
 */

import { pushNotificationService } from '@/services/push-notification.service'
import { logger } from '@/core/logger'

// ── DTE type labels ──────────────────────────────────────────
const DTE_LABELS: Record<number, string> = {
  33: 'Factura Electrónica',
  34: 'Factura Exenta',
  39: 'Boleta Electrónica',
  41: 'Boleta Exenta',
  43: 'Liquidación Factura',
  46: 'Factura de Compra',
  52: 'Guía de Despacho',
  56: 'Nota de Débito',
  61: 'Nota de Crédito',
  110: 'Factura de Exportación',
  112: 'Nota de Crédito de Exportación',
}

// ── Status labels ────────────────────────────────────────────
const STATUS_TITLES: Record<string, string> = {
  aceptado: 'DTE Aceptado',
  rechazado: 'DTE Rechazado',
  enviado: 'DTE Enviado al SII',
  anulado: 'DTE Anulado',
}

/**
 * Format CLP amount: $1.234.567
 */
function formatCLP(amount: number): string {
  return `$${amount.toLocaleString('es-CL')}`
}

/**
 * Notify when a DTE changes status (accepted, rejected, etc.)
 */
export async function notifyDTEStatusChange(
  companyId: number,
  dteId: number,
  folio: number,
  tipoDte: number,
  newStatus: string,
  reason?: string,
): Promise<void> {
  try {
    const dteLabel = DTE_LABELS[tipoDte] ?? `DTE Tipo ${tipoDte}`
    const title = STATUS_TITLES[newStatus] ?? `Estado DTE: ${newStatus}`

    let body = `${dteLabel} N° ${folio}`
    if (reason) {
      body += ` — ${reason}`
    }

    await pushNotificationService.sendPushNotification(companyId, title, body, {
      type: 'dte_status',
      id: dteId.toString(),
    })

    logger.info({ companyId, dteId, folio, newStatus }, 'DTE status change notification sent')
  } catch (error) {
    logger.error({ error, companyId, dteId }, 'Failed to send DTE status notification')
  }
}

/**
 * Notify when folios are running low for a DTE type.
 */
export async function notifyFoliosLow(
  companyId: number,
  tipoDte: number,
  remaining: number,
): Promise<void> {
  try {
    const dteLabel = DTE_LABELS[tipoDte] ?? `Tipo ${tipoDte}`
    const title = 'Folios Bajos'
    const body = `Quedan ${remaining} folios de ${dteLabel}`

    await pushNotificationService.sendPushNotification(companyId, title, body, {
      type: 'folio_low',
    })

    logger.info({ companyId, tipoDte, remaining }, 'Low folios notification sent')
  } catch (error) {
    logger.error({ error, companyId, tipoDte }, 'Failed to send low folios notification')
  }
}

/**
 * Notify when a payment is received.
 */
export async function notifyPaymentReceived(
  companyId: number,
  amount: number,
  clientName: string,
): Promise<void> {
  try {
    const title = 'Pago Recibido'
    const body = `${formatCLP(amount)} de ${clientName}`

    await pushNotificationService.sendPushNotification(companyId, title, body, {
      type: 'payment',
    })

    logger.info({ companyId, amount, clientName }, 'Payment received notification sent')
  } catch (error) {
    logger.error({ error, companyId }, 'Failed to send payment notification')
  }
}
