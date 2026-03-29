/**
 * CUENTAX Web — Sentry Edge Runtime Config (Optional)
 * Only initializes when SENTRY_DSN is set.
 */

import * as Sentry from '@sentry/nextjs'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  })
}
