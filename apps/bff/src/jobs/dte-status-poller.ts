/**
 * CUENTAX — DTE Status Polling Job (BullMQ)
 * ==========================================
 * Repeatable job that runs every 30 minutes via BullMQ.
 * Queries SII for DTE status updates and syncs to DB.
 *
 * Replaces the old setInterval-based poller with persistent
 * Redis-backed scheduling that survives process restarts.
 */

import type { Job, Queue, Worker } from 'bullmq'
import { siiBridgeAdapter } from '@/adapters/sii-bridge.adapter'
import { dteRepository } from '@/repositories/dte.repository'
import { logger } from '@/core/logger'
import { createQueue, createWorker } from '@/core/queue'

// ---------------------------------------------------------------------------
// Queue & constants
// ---------------------------------------------------------------------------

const QUEUE_NAME = 'dte-status-polling'
const POLL_EVERY_MS = 30 * 60 * 1000 // 30 minutes
const BATCH_SIZE = 3

let queue: Queue | null = null
let worker: Worker | null = null

// ---------------------------------------------------------------------------
// Job processor — same business logic as before
// ---------------------------------------------------------------------------

async function processDTEStatusPoll(job: Job): Promise<void> {
  logger.debug({ jobId: job.id }, 'Executing DTE status poll job')

  // Fetch all DTEs in "enviado" state with a track_id
  const pending = await dteRepository.findPendingPolling()

  if (pending.length === 0) {
    logger.debug('No pending DTEs to poll')
    return
  }

  logger.info({ count: pending.length }, `Polling status for ${pending.length} DTEs`)

  // Process in batches of 3 to avoid overwhelming SII
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE)

    await Promise.allSettled(
      batch.map(async (dte) => {
        if (!dte.track_id) return

        try {
          // TODO: resolve company_rut from DB via company_id
          const companyRut = '12345678-9'

          const status = await siiBridgeAdapter.getDTEStatus(dte.track_id, companyRut)
          const nuevoEstado = mapSIIStatus(status.estado)

          if (nuevoEstado !== dte.estado) {
            await dteRepository.updateEstado(dte.track_id, nuevoEstado)
            logger.info(
              { folio: dte.folio, track_id: dte.track_id, de: dte.estado, a: nuevoEstado },
              'DTE status updated from SII',
            )
          }
        } catch (err) {
          logger.warn({ track_id: dte.track_id, err }, 'Error polling DTE status')
        }
      }),
    )

    // Pause between batches to avoid overloading SII
    if (i + BATCH_SIZE < pending.length) {
      await new Promise((r) => setTimeout(r, 1_000))
    }
  }
}

/** Map SII status codes to internal enum values */
function mapSIIStatus(siiEstado: string): string {
  const map: Record<string, string> = {
    'EPR': 'enviado',      // En proceso
    'ACD': 'aceptado',     // Aceptado con discrepancias
    'RSC': 'aceptado',     // Aceptado sin reclamo
    'RCT': 'rechazado',    // Rechazado
    'VOF': 'rechazado',    // Verificacion de firma fallo
    'RFR': 'rechazado',    // Rechazado por firma
    'RPT': 'rechazado',    // Rechazado por contenido
    '00':  'aceptado',     // Codigo OK del SII
    '01':  'rechazado',
  }
  return map[siiEstado] ?? 'enviado'
}

// ---------------------------------------------------------------------------
// Lifecycle: start / stop
// ---------------------------------------------------------------------------

/**
 * Initialize the DTE status polling queue and worker.
 * Registers a repeatable job that fires every 30 minutes.
 */
export async function startDTEStatusPoller(): Promise<void> {
  queue = createQueue(QUEUE_NAME)
  worker = createWorker(QUEUE_NAME, processDTEStatusPoll)

  // Upsert the repeatable job — BullMQ deduplicates by jobId + repeat config
  await queue.upsertJobScheduler(
    'dte-poll-repeat',
    { every: POLL_EVERY_MS },
    {
      name: 'poll-dte-status',
      opts: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 10_000 },
      },
    },
  )

  logger.info(`DTE Status Poller started (BullMQ, every ${POLL_EVERY_MS / 1000}s)`)
}

/**
 * Gracefully shut down the worker and close the queue.
 */
export async function stopDTEStatusPoller(): Promise<void> {
  if (worker) {
    await worker.close()
    worker = null
  }
  if (queue) {
    await queue.close()
    queue = null
  }
  logger.info('DTE Status Poller stopped')
}

/**
 * Get the queue instance for admin/status endpoints.
 */
export function getDTEStatusQueue(): Queue | null {
  return queue
}
