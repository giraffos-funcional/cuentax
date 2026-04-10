/**
 * CUENTAX — Push Tokens Routes (BFF)
 * =====================================
 * Manage Expo push notification token registration per device.
 *
 * POST   /api/v1/push-tokens       -> Register/update push token
 * DELETE /api/v1/push-tokens/:deviceId -> Unregister (soft delete)
 * GET    /api/v1/push-tokens       -> List user's registered devices
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { authGuard } from '@/middlewares/auth-guard'
import { db } from '@/db/client'
import { pushTokens } from '@/db/schema/push-tokens'
import { logger } from '@/core/logger'
import { getLocalCompanyId } from '@/core/company-resolver'

// ── Validation Schemas ──────────────────────────────────────────

const registerTokenSchema = z.object({
  expo_push_token: z
    .string()
    .min(1, 'Token requerido')
    .max(255)
    .regex(/^ExponentPushToken\[.+\]$/, 'Formato de token Expo inválido'),
  device_id: z.string().min(1, 'Device ID requerido').max(255),
  platform: z.enum(['ios', 'android'], {
    errorMap: () => ({ message: 'Plataforma debe ser "ios" o "android"' }),
  }),
})

// ── Routes ──────────────────────────────────────────────────────

export async function pushTokenRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  // ── POST / — Register or update push token ──────────────────
  fastify.post('/', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)

    const parse = registerTokenSchema.safeParse(req.body)
    if (!parse.success) {
      return reply.status(400).send({
        error: 'validation_error',
        details: parse.error.flatten().fieldErrors,
      })
    }

    const { expo_push_token, device_id, platform } = parse.data

    // Upsert: insert or update on conflict (company_id, user_id, device_id)
    const [token] = await db
      .insert(pushTokens)
      .values({
        company_id: localCompanyId,
        user_id: user.uid,
        expo_push_token,
        device_id,
        platform,
        active: true,
      })
      .onConflictDoUpdate({
        target: [pushTokens.company_id, pushTokens.user_id, pushTokens.device_id],
        set: {
          expo_push_token,
          platform,
          active: true,
          updated_at: new Date(),
        },
      })
      .returning()

    logger.info(
      { tokenId: token.id, companyId: localCompanyId, userId: user.uid, device_id },
      'Push token registered',
    )

    return reply.status(201).send(token)
  })

  // ── DELETE /:deviceId — Unregister push token (soft delete) ──
  fastify.delete('/:deviceId', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)
    const { deviceId } = req.params as { deviceId: string }

    const result = await db
      .update(pushTokens)
      .set({ active: false, updated_at: new Date() })
      .where(
        and(
          eq(pushTokens.company_id, localCompanyId),
          eq(pushTokens.user_id, user.uid),
          eq(pushTokens.device_id, deviceId),
        ),
      )
      .returning({ id: pushTokens.id })

    if (result.length === 0) {
      return reply.status(404).send({
        error: 'not_found',
        message: 'Token de push no encontrado para este dispositivo',
      })
    }

    logger.info(
      { companyId: localCompanyId, userId: user.uid, deviceId },
      'Push token deactivated',
    )

    return reply.status(204).send()
  })

  // ── GET / — List user's registered devices ───────────────────
  fastify.get('/', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)

    const tokens = await db
      .select()
      .from(pushTokens)
      .where(
        and(
          eq(pushTokens.company_id, localCompanyId),
          eq(pushTokens.user_id, user.uid),
          eq(pushTokens.active, true),
        ),
      )

    return reply.send({ data: tokens })
  })
}
