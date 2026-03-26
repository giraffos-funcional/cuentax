/**
 * Redis Adapter — CUENTAX BFF
 * Singleton de conexión Redis con reconnect automático.
 */

import { Redis } from 'ioredis'
import { config } from '@/core/config'
import { logger } from '@/core/logger'

const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 200, 2000),
})

redis.on('connect', () => logger.info('✅ Redis conectado'))
redis.on('error', (err) => logger.error({ err }, '❌ Redis error'))
redis.on('reconnecting', () => logger.warn('⚠️  Redis reconectando...'))

export { redis }
