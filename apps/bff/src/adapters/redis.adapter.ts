/**
 * Redis Adapter — CUENTAX BFF
 * Singleton de conexion Redis con reconnect automatico.
 * Exports safe wrappers that degrade gracefully when Redis is unavailable.
 */

import { Redis } from 'ioredis'
import { config } from '@/core/config'
import { logger } from '@/core/logger'

const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 200, 2000),
})

// ── Connection lifecycle events ─────────────────────────────
redis.on('connect', () => logger.info('Redis connected'))

redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error')
})

redis.on('close', () => {
  logger.warn('Redis connection closed')
})

redis.on('reconnecting', () => {
  logger.info('Redis reconnecting...')
})

redis.on('ready', () => {
  logger.info('Redis ready to accept commands')
})

// ── Health check ────────────────────────────────────────────

/** Returns true when the Redis client is connected and ready for commands. */
export function isRedisReady(): boolean {
  return redis.status === 'ready'
}

// ── Safe wrappers (graceful degradation) ────────────────────

/**
 * GET that returns null instead of throwing when Redis is unavailable.
 * Callers must tolerate a null response (cache-miss behaviour).
 */
export async function safeGet(key: string): Promise<string | null> {
  try {
    if (redis.status !== 'ready') return null
    return await redis.get(key)
  } catch (err) {
    logger.error({ err, key }, 'Redis GET failed, returning null')
    return null
  }
}

/**
 * SET / SETEX that returns false instead of throwing when Redis is unavailable.
 */
export async function safeSet(
  key: string,
  value: string,
  ttl?: number,
): Promise<boolean> {
  try {
    if (redis.status !== 'ready') return false
    if (ttl) {
      await redis.setex(key, ttl, value)
    } else {
      await redis.set(key, value)
    }
    return true
  } catch (err) {
    logger.error({ err, key }, 'Redis SET failed')
    return false
  }
}

/**
 * DEL that returns false instead of throwing when Redis is unavailable.
 */
export async function safeDel(key: string): Promise<boolean> {
  try {
    if (redis.status !== 'ready') return false
    await redis.del(key)
    return true
  } catch (err) {
    logger.error({ err, key }, 'Redis DEL failed')
    return false
  }
}

export { redis }
