/**
 * Mercado Pago webhook receiver.
 *
 * - Reads the RAW body (not JSON-parsed) so the HMAC SHA-256 signature
 *   can be verified bit-for-bit against the manifest.
 * - Trusts only the resource id from the webhook; re-fetches the resource
 *   from the MP API before mutating our DB.
 * - Idempotent: dedupes by (provider, provider_txn_id) unique index.
 *
 * Refs: docs/multitenancy/phase-02-billing.md T2.5
 */
import type { FastifyInstance } from 'fastify'
import { getBillingProvider, handlePaymentEvent } from '@/services/billing.service'
import { logger } from '@/core/logger'

export async function mercadopagoWebhookRoutes(fastify: FastifyInstance) {
  // Register a content-type parser that keeps the raw body around so we
  // can verify the signature without re-stringifying (which would alter
  // whitespace and break HMAC).
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      try {
        const parsed = body ? JSON.parse(body as string) : {}
        ;(parsed as { __raw?: string }).__raw = body as string
        done(null, parsed)
      } catch (err) {
        done(err as Error, undefined)
      }
    },
  )

  fastify.post('/', async (request, reply) => {
    const provider = getBillingProvider()
    const raw = (request.body as { __raw?: string } | undefined)?.__raw ?? ''
    const verification = provider.verifyWebhook(request.headers, raw)
    if (!verification.valid) {
      logger.warn(
        { reason: verification.reason, headers: { 'x-request-id': request.headers['x-request-id'] } },
        'mp.webhook_signature_invalid',
      )
      return reply.code(401).send({ error: 'invalid_signature' })
    }

    // ACK fast — process async if needed. For now we await to surface errors
    // in tests; in prod with high volume, fan out to a queue.
    if (verification.topic === 'payment' && verification.resource_id) {
      try {
        await handlePaymentEvent(verification.resource_id)
      } catch (err) {
        logger.error({ err, resourceId: verification.resource_id }, 'mp.webhook_processing_failed')
        return reply.code(500).send({ error: 'processing_failed' })
      }
    } else {
      logger.info(
        { topic: verification.topic, resourceId: verification.resource_id },
        'mp.webhook_topic_ignored',
      )
    }

    return reply.send({ ok: true })
  })
}
