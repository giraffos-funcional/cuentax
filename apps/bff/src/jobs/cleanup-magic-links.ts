/**
 * Cron: housekeeping for expired / consumed magic-link tokens.
 *
 * Runs daily 03:00 UTC. Deletes rows that are either consumed and
 * older than 7 days, or expired and older than 30 days. Keeps a small
 * audit-friendly window for forensic checks.
 */
import type { Job, Queue, Worker } from 'bullmq'
import { lt, or, and, isNotNull } from 'drizzle-orm'
import { db } from '@/db/client'
import { magicLinks } from '@/db/schema'
import { logger } from '@/core/logger'
import { createQueue, createWorker } from '@/core/queue'

const QUEUE_NAME = 'cleanup-magic-links'
let queue: Queue | null = null
let worker: Worker | null = null

async function processCleanup(_job: Job): Promise<void> {
  const now = Date.now()
  const consumedCutoff = new Date(now - 7  * 24 * 60 * 60 * 1000)  // 7d
  const expiredCutoff  = new Date(now - 30 * 24 * 60 * 60 * 1000)  // 30d

  const result = await db.delete(magicLinks).where(
    or(
      and(isNotNull(magicLinks.consumed_at), lt(magicLinks.consumed_at, consumedCutoff)),
      lt(magicLinks.expires_at, expiredCutoff),
    ),
  ).returning({ id: magicLinks.id })

  logger.info({ deleted: result.length }, 'magic_links.cleanup_completed')
}

export function startMagicLinkCleanup(): { queue: Queue; worker: Worker } {
  if (queue && worker) return { queue, worker }
  queue  = createQueue(QUEUE_NAME)
  worker = createWorker(QUEUE_NAME, processCleanup)
  queue.add('daily-cleanup', {}, { repeat: { pattern: '0 3 * * *' }, jobId: 'magic-links-cleanup' })
    .catch((err) => logger.error({ err }, 'magic_links.cron_schedule_failed'))
  logger.info('✅ magic-link cleanup cron scheduled')
  return { queue, worker }
}

export async function stopMagicLinkCleanup(): Promise<void> {
  if (worker) await worker.close()
  if (queue)  await queue.close()
  worker = null
  queue = null
}
