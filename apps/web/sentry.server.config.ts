/**
 * CUENTAX Web — Sentry Server-Side Config (Optional)
 * Only initializes when SENTRY_DSN is set.
 */

import * as Sentry from '@sentry/nextjs'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  })
}
