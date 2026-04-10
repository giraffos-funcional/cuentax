/**
 * CUENTAX — AI Chat Routes (BFF)
 * ================================
 * Claude-powered conversational assistant for company data queries.
 * Streams responses via Server-Sent Events (SSE).
 *
 * POST /api/v1/ai/chat  -> Stream chat response (SSE)
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authGuard } from '@/middlewares/auth-guard'
import { getLocalCompanyId } from '@/core/company-resolver'
import { aiChatService } from '@/services/ai-chat.service'
import { redis } from '@/adapters/redis.adapter'
import { logger } from '@/core/logger'

// ── Validation Schema ──────────────────────────────────────────

const chatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(2000),
    }),
  ).min(1).max(50),
})

// ── Rate Limiting ──────────────────────────────────────────────

const RATE_LIMIT_PREFIX = 'cuentax:ai_chat_rate:'
const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_SECONDS = 60

async function checkRateLimit(companyId: number): Promise<{ allowed: boolean; remaining: number }> {
  const key = `${RATE_LIMIT_PREFIX}${companyId}`

  try {
    if (redis.status !== 'ready') {
      // Redis down — allow request but log warning
      logger.warn({ companyId }, 'AI chat rate limit skipped: Redis not ready')
      return { allowed: true, remaining: RATE_LIMIT_MAX }
    }

    const current = await redis.incr(key)

    if (current === 1) {
      // First request in window — set expiry
      await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS)
    }

    const remaining = Math.max(0, RATE_LIMIT_MAX - current)
    return { allowed: current <= RATE_LIMIT_MAX, remaining }
  } catch (err) {
    logger.error({ err, companyId }, 'AI chat rate limit check failed')
    // Fail open on Redis errors
    return { allowed: true, remaining: RATE_LIMIT_MAX }
  }
}

// ── Routes ─────────────────────────────────────────────────────

export async function aiChatRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  // ── POST / — Stream AI chat response ─────────────────────────
  fastify.post('/', async (req, reply) => {
    const user = (req as any).user
    const localCompanyId = await getLocalCompanyId(user.company_id)

    // Rate limit check
    const { allowed, remaining } = await checkRateLimit(localCompanyId)
    if (!allowed) {
      return reply.status(429).send({
        error: 'rate_limit_exceeded',
        message: 'Has superado el limite de consultas al asistente. Intenta de nuevo en un minuto.',
      })
    }

    // Validate body
    const parse = chatRequestSchema.safeParse(req.body)
    if (!parse.success) {
      return reply.status(400).send({
        error: 'validation_error',
        details: parse.error.flatten().fieldErrors,
      })
    }

    const { messages } = parse.data

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-RateLimit-Remaining': String(remaining),
    })

    const writeSSE = (data: string) => {
      reply.raw.write(`data: ${data}\n\n`)
    }

    try {
      await aiChatService.streamChat(
        {
          companyId: localCompanyId,
          companyName: user.company_name,
          companyRut: user.company_rut,
        },
        messages,
        writeSSE,
      )
    } catch (err) {
      logger.error({ err, companyId: localCompanyId }, 'AI chat stream error')

      // If headers already sent, send error as SSE event
      writeSSE(JSON.stringify({
        type: 'error',
        message: 'Error al procesar tu consulta. Intenta de nuevo.',
      }))
      writeSSE(JSON.stringify({ type: 'done' }))
    }

    reply.raw.end()
  })
}
