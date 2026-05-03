/**
 * CUENTAX — Jobs Routes
 * ======================
 * Endpoints for viewing background job status and history.
 * Used by the Herramientas page to show automated tasks.
 */

import type { FastifyInstance } from 'fastify'
import { authGuard } from '@/middlewares/auth-guard'
import { getDTEStatusQueue } from '@/jobs/dte-status-poller'
import { getPreviredQueue } from '@/jobs/previred-scraper'
import { getRCVSyncQueue } from '@/jobs/rcv-sync'

const QUEUE_META = [
  {
    key: 'rcv-sync',
    label: 'Sincronizacion RCV',
    description: 'Sincroniza compras y ventas desde el SII',
    schedule: 'Diario a las 01:00 AM',
    getQueue: getRCVSyncQueue,
  },
  {
    key: 'dte-status-polling',
    label: 'Polling Estado DTE',
    description: 'Consulta estado de DTEs enviados al SII',
    schedule: 'Cada 30 minutos',
    getQueue: getDTEStatusQueue,
  },
  {
    key: 'previred-sync',
    label: 'Indicadores Previred',
    description: 'Actualiza indicadores previsionales (UF, UTM, AFP, etc.)',
    schedule: 'Diario a las 06:00 AM',
    getQueue: getPreviredQueue,
  },
]

export async function jobsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard)

  // ── GET /status — All queues overview ─────────────────────
  fastify.get('/status', async (_, reply) => {
    const queues = await Promise.all(
      QUEUE_META.map(async (meta) => {
        const queue = meta.getQueue()
        if (!queue) {
          return { ...meta, getQueue: undefined, status: 'inactive', counts: null }
        }
        try {
          const counts = await queue.getJobCounts(
            'active', 'completed', 'failed', 'delayed', 'waiting',
          )
          return { ...meta, getQueue: undefined, status: 'active', counts }
        } catch {
          return { ...meta, getQueue: undefined, status: 'error', counts: null }
        }
      }),
    )
    return reply.send({ queues })
  })

  // ── GET /history — Recent job executions ───────────────────
  fastify.get<{ Querystring: { queue?: string; limit?: string } }>(
    '/history',
    async (req, reply) => {
      const queueFilter = req.query.queue
      const limit = Math.min(parseInt(req.query.limit ?? '50'), 100)

      const allJobs: Array<{
        queue: string
        id: string | undefined
        name: string
        status: string
        timestamp: number | undefined
        finishedOn: number | undefined
        duration: number | undefined
        data: Record<string, unknown>
        result: unknown
        error: string | undefined
        attempts: number
      }> = []

      for (const meta of QUEUE_META) {
        if (queueFilter && meta.key !== queueFilter) continue

        const queue = meta.getQueue()
        if (!queue) continue

        try {
          // Get completed + failed jobs
          const [completed, failed, active] = await Promise.all([
            queue.getJobs(['completed'], 0, limit),
            queue.getJobs(['failed'], 0, limit),
            queue.getJobs(['active'], 0, 5),
          ])

          for (const job of [...completed, ...failed, ...active]) {
            if (!job) continue
            const state = await job.getState()
            allJobs.push({
              queue: meta.key,
              id: job.id,
              name: job.name,
              status: state,
              timestamp: job.timestamp,
              finishedOn: job.finishedOn,
              duration: job.finishedOn && job.processedOn
                ? job.finishedOn - job.processedOn
                : undefined,
              data: job.data as Record<string, unknown>,
              result: job.returnvalue,
              error: job.failedReason,
              attempts: job.attemptsMade,
            })
          }
        } catch {
          // Queue not accessible — skip
        }
      }

      // Sort by timestamp descending (most recent first)
      allJobs.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))

      return reply.send({ jobs: allJobs.slice(0, limit) })
    },
  )

  // ── GET /active — Currently running jobs ───────────────────
  fastify.get('/active', async (_, reply) => {
    const activeJobs: Array<{
      queue: string
      queueLabel: string
      id: string | undefined
      name: string
      progress: number | object
      data: Record<string, unknown>
      startedAt: number | undefined
    }> = []

    for (const meta of QUEUE_META) {
      const queue = meta.getQueue()
      if (!queue) continue

      try {
        const active = await queue.getJobs(['active'], 0, 10)
        for (const job of active) {
          if (!job) continue
          activeJobs.push({
            queue: meta.key,
            queueLabel: meta.label,
            id: job.id,
            name: job.name,
            progress: job.progress as number | object,
            data: job.data as Record<string, unknown>,
            startedAt: job.processedOn,
          })
        }
      } catch {
        // Skip
      }
    }

    return reply.send({ jobs: activeJobs })
  })
}
