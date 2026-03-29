#!/usr/bin/env bash
# CuentaX CI Smoke Test — Minimal BFF readiness check
# Usage: ./infra/scripts/smoke-test-ci.sh <BFF_URL>
# Example: ./infra/scripts/smoke-test-ci.sh https://cuentaxapi.giraffos.com
#
# Exit code: 0 = healthy, 1 = unhealthy
# Designed for Coolify post-deploy webhooks or GitHub Actions.

set -euo pipefail

BFF_URL="${1:?Usage: $0 <BFF_URL>}"
TIMEOUT=60
MAX_RETRIES=12
RETRY_INTERVAL=5

# Remove trailing slash
BFF_URL="${BFF_URL%/}"

ENDPOINT="${BFF_URL}/health/ready"

echo "smoke-test-ci: checking ${ENDPOINT} (timeout=${TIMEOUT}s, retries=${MAX_RETRIES})"

START_TIME=$(date +%s)
attempt=0

while [[ $attempt -lt $MAX_RETRIES ]]; do
  attempt=$((attempt + 1))
  elapsed=$(( $(date +%s) - START_TIME ))

  if [[ $elapsed -ge $TIMEOUT ]]; then
    echo "smoke-test-ci: FAIL - timeout after ${elapsed}s"
    exit 1
  fi

  body=$(curl -sf --connect-timeout 5 --max-time 10 "$ENDPOINT" 2>/dev/null) || {
    echo "smoke-test-ci: attempt ${attempt}/${MAX_RETRIES} - not ready (${elapsed}s elapsed)"
    sleep "$RETRY_INTERVAL"
    continue
  }

  if echo "$body" | grep -q '"status"'; then
    status_value=""
    if command -v jq &>/dev/null; then
      status_value=$(echo "$body" | jq -r '.status' 2>/dev/null)
    else
      # Fallback: extract status value with grep
      status_value=$(echo "$body" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
    fi

    if [[ "$status_value" == "ok" ]]; then
      echo "smoke-test-ci: PASS - BFF ready (attempt ${attempt}, ${elapsed}s elapsed)"
      exit 0
    else
      echo "smoke-test-ci: attempt ${attempt}/${MAX_RETRIES} - status=${status_value} (${elapsed}s elapsed)"
    fi
  else
    echo "smoke-test-ci: attempt ${attempt}/${MAX_RETRIES} - unexpected response (${elapsed}s elapsed)"
  fi

  sleep "$RETRY_INTERVAL"
done

echo "smoke-test-ci: FAIL - BFF not ready after ${MAX_RETRIES} attempts"
exit 1
