/**
 * CUENTAX — DTE Status Polling Job
 * ==================================
 * Tarea que corre en background cada 2 minutos.
 * Consulta al SII el estado de todos los DTEs "enviados"
 * y actualiza la DB con el resultado (aceptado / rechazado).
 *
 * En producción: mover a una Cola (BullMQ + Redis) para
 * garantizar ejecución exacta y reintentos.
 */

import { siiBridgeAdapter } from '@/adapters/sii-bridge.adapter'
import { dteRepository } from '@/repositories/dte.repository'
import { logger } from '@/core/logger'

const POLL_INTERVAL_MS = 2 * 60 * 1000 // 2 minutos

class DTEStatusPoller {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false

  start() {
    if (this.timer) return
    logger.info('🔄 DTE Status Poller iniciado (cada 2 min)')
    this.timer = setInterval(() => this.run(), POLL_INTERVAL_MS)
    // Primera ejecución inmediata
    setTimeout(() => this.run(), 5_000)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      logger.info('⏹ DTE Status Poller detenido')
    }
  }

  private async run() {
    if (this.running) {
      logger.debug('Status poll ya en ejecución, saltando...')
      return
    }

    this.running = true
    logger.debug('Ejecutando DTE status poll...')

    try {
      // Obtener todos los DTEs en estado "enviado" con track_id
      const pending = await dteRepository.findPendingPolling()

      if (pending.length === 0) {
        logger.debug('No hay DTEs pendientes de poll')
        return
      }

      logger.info({ count: pending.length }, `Polleando estado de ${pending.length} DTEs`)

      // Consultar estado en lotes (3 a la vez para no saturar el SII)
      const BATCH_SIZE = 3
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const batch = pending.slice(i, i + BATCH_SIZE)

        await Promise.allSettled(
          batch.map(async (dte) => {
            if (!dte.track_id) return

            try {
              // Obtener RUT empresa desde el company_id — simplificado
              // TODO: resolver company_rut desde DB
              const companyRut = '12345678-9'

              const status = await siiBridgeAdapter.getDTEStatus(dte.track_id, companyRut)
              const nuevoEstado = this._mapSIIStatus(status.estado)

              if (nuevoEstado !== dte.estado) {
                await dteRepository.updateEstado(dte.track_id, nuevoEstado)
                logger.info(
                  { folio: dte.folio, track_id: dte.track_id, de: dte.estado, a: nuevoEstado },
                  'Estado DTE actualizado desde SII'
                )
              }
            } catch (err) {
              logger.warn({ track_id: dte.track_id, err }, 'Error polleando estado DTE')
            }
          })
        )

        // Pausa entre lotes para no sobrecargar el SII
        if (i + BATCH_SIZE < pending.length) {
          await new Promise(r => setTimeout(r, 1_000))
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error en DTE status poll job')
    } finally {
      this.running = false
    }
  }

  /** Mapea los estados del SII a nuestro enum interno */
  private _mapSIIStatus(siiEstado: string): string {
    const map: Record<string, string> = {
      'EPR': 'enviado',      // En proceso
      'ACD': 'aceptado',     // Aceptado con discrepancias
      'RSC': 'aceptado',     // Aceptado sin reclamo
      'RCT': 'rechazado',    // Rechazado
      'VOF': 'rechazado',    // Verificación de firma falló
      'RFR': 'rechazado',    // Rechazado por firma
      'RPT': 'rechazado',    // Rechazado por contenido
      '00':  'aceptado',     // Código OK del SII
      '01':  'rechazado',
    }
    return map[siiEstado] ?? 'enviado'
  }
}

export const dteStatusPoller = new DTEStatusPoller()
