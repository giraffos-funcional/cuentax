/**
 * CUENTAX — BullMQ Queue Infrastructure
 * ======================================
 * Centralized queue/worker factory using BullMQ + Redis.
 * All background jobs use this module instead of setInterval.
 *
 * BullMQ guarantees:
 * - Jobs survive process restarts (persisted in Redis)
 * - Exactly-once processing with proper locking
 * - Automatic retries with configurable backoff
 * - Repeatable jobs with cron expressions
 */

import { Queue, Worker, QueueEvents } from 'bullmq'
import type { ConnectionOptions, WorkerOptions, Processor } from 'bullmq'
import { config } from './config.js'
import { logger } from './logger.js'

// ---------------------------------------------------------------------------
// Redis connection for BullMQ
// ---------------------------------------------------------------------------

/**
 * Parse a redis:// URL into the connection object BullMQ expects.
 * BullMQ uses ioredis internally and needs {host, port, password}.
 */
function parseRedisUrl(url: string): ConnectionOptions {
  const parsed = new URL(url)
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
  }
}

export const redisConnection: ConnectionOptions = parseRedisUrl(config.REDIS_URL)

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/**
 * Create a BullMQ queue. The queue is the producer side — you add jobs to it.
 */
export function createQueue<T = unknown>(name: string) {
  const queue = new Queue<T>(name, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5_000,
      },
      removeOnComplete: { count: 100 },  // Keep last 100 completed jobs
      removeOnFail: { count: 500 },      // Keep last 500 failed jobs for debugging
    },
  })

  queue.on('error', (err) => {
    logger.error({ err, queue: name }, 'BullMQ queue error')
  })

  return queue
}

/**
 * Create a BullMQ worker. The worker is the consumer side — it processes jobs.
 */
export function createWorker<T = unknown>(
  name: string,
  processor: Processor<T>,
  opts?: Partial<WorkerOptions>,
) {
  const worker = new Worker<T>(name, processor, {
    connection: redisConnection,
    concurrency: 1,
    ...opts,
  })

  worker.on('completed', (job) => {
    logger.debug({ jobId: job?.id, queue: name }, 'Job completed')
  })

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, queue: name, err, attempt: job?.attemptsMade },
      'Job failed',
    )
  })

  worker.on('error', (err) => {
    logger.error({ err, queue: name }, 'BullMQ worker error')
  })

  return worker
}

/**
 * Create QueueEvents for monitoring a queue.
 * Useful for the admin status endpoint.
 */
export function createQueueEvents(name: string) {
  return new QueueEvents(name, { connection: redisConnection })
}
