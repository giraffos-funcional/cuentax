#!/bin/bash
# CuentaX BFF — Startup script
# Installs Playwright Chromium browser if not already present, then starts the app.

set -e

echo "[init] Checking Playwright Chromium..."

# Install Chromium browser (skip if already installed)
if npx playwright install chromium 2>&1; then
  echo "[init] Playwright Chromium ready"
else
  echo "[init] WARNING: Playwright Chromium install failed — RCV sync will be unavailable"
fi

echo "[init] Starting CuentaX BFF..."
cd /app/apps/bff
exec npx tsx src/server.ts
