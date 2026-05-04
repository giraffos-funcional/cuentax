#!/bin/bash
# CuentaX BFF — Startup script
#
# Note: Playwright was replaced by playwright-core to skip the 97MB Ubuntu
# deps that were stalling SV1 deploys (commit ad60af1). Scrapers (rcv-sync,
# itau-scraper) are lazy and will throw a descriptive error at runtime if
# a chromium binary isn't available — they don't block boot.
#
# To re-enable scrapers, set CHROME_EXECUTABLE_PATH=/path/to/chromium and
# install chromium via the system package manager (or run a separate worker
# container with @playwright/test installed).

set -e

echo "[init] Starting CuentaX BFF..."
cd /app/apps/bff
exec npx tsx src/server.ts
