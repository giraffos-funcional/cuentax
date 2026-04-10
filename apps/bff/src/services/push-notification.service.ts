/**
 * CUENTAX — Push Notification Service
 * =====================================
 * Sends push notifications via Expo Push API.
 * Handles batching (max 100 per request), error handling,
 * and automatic deactivation of invalid tokens.
 */

import { eq, and } from 'drizzle-orm'
import { db } from '@/db/client'
import { pushTokens } from '@/db/schema/push-tokens'
import { logger } from '@/core/logger'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const BATCH_SIZE = 100

interface ExpoPushMessage {
  to: string
  title: string
  body: string
  data?: Record<string, string>
  sound: 'default'
  badge: number
}

interface ExpoPushTicket {
  status: 'ok' | 'error'
  id?: string
  message?: string
  details?: {
    error?: 'DeviceNotRegistered' | 'InvalidCredentials' | 'MessageTooBig' | 'MessageRateExceeded'
  }
}

class PushNotificationService {
  /**
   * Send a push notification to ALL active devices for a company.
   */
  async sendPushNotification(
    companyId: number,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    const tokens = await db
      .select()
      .from(pushTokens)
      .where(and(eq(pushTokens.company_id, companyId), eq(pushTokens.active, true)))

    if (tokens.length === 0) {
      logger.debug({ companyId }, 'No active push tokens for company — skipping notification')
      return
    }

    const messages: ExpoPushMessage[] = tokens.map((t) => ({
      to: t.expo_push_token,
      title,
      body,
      data,
      sound: 'default' as const,
      badge: 1,
    }))

    await this.sendBatched(messages, tokens.map((t) => ({ id: t.id, token: t.expo_push_token })))
  }

  /**
   * Send a push notification to a specific user's devices within a company.
   */
  async sendToUser(
    companyId: number,
    userId: number,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    const tokens = await db
      .select()
      .from(pushTokens)
      .where(
        and(
          eq(pushTokens.company_id, companyId),
          eq(pushTokens.user_id, userId),
          eq(pushTokens.active, true),
        ),
      )

    if (tokens.length === 0) {
      logger.debug({ companyId, userId }, 'No active push tokens for user — skipping notification')
      return
    }

    const messages: ExpoPushMessage[] = tokens.map((t) => ({
      to: t.expo_push_token,
      title,
      body,
      data,
      sound: 'default' as const,
      badge: 1,
    }))

    await this.sendBatched(messages, tokens.map((t) => ({ id: t.id, token: t.expo_push_token })))
  }

  /**
   * Deactivate a push token (soft delete).
   */
  async deactivateToken(tokenId: number): Promise<void> {
    await db
      .update(pushTokens)
      .set({ active: false, updated_at: new Date() })
      .where(eq(pushTokens.id, tokenId))

    logger.info({ tokenId }, 'Push token deactivated')
  }

  /**
   * Send messages in batches of 100 (Expo API limit) and handle errors.
   */
  private async sendBatched(
    messages: ExpoPushMessage[],
    tokenMeta: Array<{ id: number; token: string }>,
  ): Promise<void> {
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE)
      const batchMeta = tokenMeta.slice(i, i + BATCH_SIZE)

      try {
        const response = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(batch),
        })

        if (!response.ok) {
          logger.error(
            { status: response.status, statusText: response.statusText },
            'Expo Push API returned non-OK status',
          )
          continue
        }

        const result = await response.json() as { data: ExpoPushTicket[] }
        await this.handleTickets(result.data, batchMeta)
      } catch (error) {
        logger.error({ error, batchSize: batch.length }, 'Failed to send push notification batch')
      }
    }
  }

  /**
   * Process Expo push tickets — deactivate tokens that are no longer registered.
   */
  private async handleTickets(
    tickets: ExpoPushTicket[],
    tokenMeta: Array<{ id: number; token: string }>,
  ): Promise<void> {
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i]
      const meta = tokenMeta[i]

      if (ticket.status === 'error') {
        logger.warn(
          { token: meta.token, error: ticket.details?.error, message: ticket.message },
          'Expo push ticket error',
        )

        // Deactivate tokens that are no longer valid
        if (ticket.details?.error === 'DeviceNotRegistered') {
          await this.deactivateToken(meta.id)
        }
      }
    }
  }
}

export const pushNotificationService = new PushNotificationService()
