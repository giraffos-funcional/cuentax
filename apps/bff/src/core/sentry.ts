/**
 * CUENTAX BFF — Sentry Error Tracking (Optional)
 * Initializes Sentry only when SENTRY_DSN is configured.
 * The app works normally without it.
 */

import * as Sentry from '@sentry/node'
import { config } from './config'

const SENTRY_DSN = process.env.SENTRY_DSN || ''

export function initSentry(): void {
  if (!SENTRY_DSN) {
    console.info('Sentry DSN not configured — error tracking disabled')
    return
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: config.NODE_ENV,
    release: `cuentax-bff@${process.env.npm_package_version ?? '0.1.0'}`,
    tracesSampleRate: config.NODE_ENV === 'production' ? 0.1 : 1.0,
    beforeSend(event) {
      // Strip sensitive headers before sending to Sentry
      if (event.request?.headers) {
        delete event.request.headers['authorization']
        delete event.request.headers['cookie']
        delete event.request.headers['x-api-key']
      }
      return event
    },
  })

  console.info('Sentry initialized')
}

export function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!SENTRY_DSN) return
  Sentry.captureException(err, { extra: context })
}

export { Sentry }
