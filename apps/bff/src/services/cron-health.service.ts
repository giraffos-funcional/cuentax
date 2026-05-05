/**
 * Cron health snapshot — lee Redis vía BullMQ para devolver el estado
 * en tiempo real de cada queue gestionada por el BFF.
 *
 * Para cada queue:
 *   - waiting / active / completed / failed / delayed counts
 *   - lastCompletedAt / lastFailedAt
 *   - error del último fallo (si existe)
 *
 * No hace polling: el endpoint que lo expone ejecuta una sola consulta
 * a Redis por queue, así que es seguro montarlo en el panel admin.
 */
import { Queue } from 'bullmq'
import { redisConnection } from '@/core/queue'

export interface CronHealth {
  name: string
  counts: {
    waiting: number
    active: number
    completed: number
    failed: number
    delayed: number
  }
  last_completed_at: string | null
  last_failed_at: string | null
  last_failure: { id: string; reason: string; failedAt: string } | null
  next_run_at: string | null
}

const KNOWN_QUEUES = [
  'dte-status-polling',
  'dte-mailbox-poller',
  'previred-scraper',
  'rcv-sync',
  'close-revenue-share',
  'generate-monthly-invoices',
  'charge-due-invoices',
  'dunning',
  'cleanup-magic-links',
  'bank-import',
] as const

export async function getCronHealth(): Promise<CronHealth[]> {
  const results: CronHealth[] = []
  for (const name of KNOWN_QUEUES) {
    const q = new Queue(name, { connection: redisConnection })
    try {
      const counts = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed')
      const [completed, failed] = await Promise.all([
        q.getJobs(['completed'], 0, 0),
        q.getJobs(['failed'], 0, 0),
      ])
      const lastCompleted = completed[0]
      const lastFailed = failed[0]

      // Next-run for repeatable jobs
      const repeats = await q.getRepeatableJobs(0, 0).catch(() => [])
      const next = repeats[0]?.next ? new Date(repeats[0].next).toISOString() : null

      results.push({
        name,
        counts: {
          waiting:   counts.waiting   ?? 0,
          active:    counts.active    ?? 0,
          completed: counts.completed ?? 0,
          failed:    counts.failed    ?? 0,
          delayed:   counts.delayed   ?? 0,
        },
        last_completed_at: lastCompleted?.finishedOn ? new Date(lastCompleted.finishedOn).toISOString() : null,
        last_failed_at:    lastFailed?.finishedOn   ? new Date(lastFailed.finishedOn).toISOString()   : null,
        last_failure: lastFailed
          ? {
              id:      String(lastFailed.id ?? '?'),
              reason:  lastFailed.failedReason ?? 'unknown',
              failedAt: lastFailed.finishedOn ? new Date(lastFailed.finishedOn).toISOString() : '',
            }
          : null,
        next_run_at: next,
      })
    } catch (err) {
      results.push({
        name,
        counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
        last_completed_at: null,
        last_failed_at: null,
        last_failure: { id: '?', reason: (err as Error).message, failedAt: new Date().toISOString() },
        next_run_at: null,
      })
    } finally {
      await q.close().catch(() => {})
    }
  }
  return results
}
