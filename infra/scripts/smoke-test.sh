#!/usr/bin/env bash
# CuentaX Post-Deploy Smoke Tests
# Usage: ./infra/scripts/smoke-test.sh [--timeout 120] [--env production]
#
# Verifies all CuentaX services are healthy after a deploy.
# Retries failed checks up to 5 times with 5-second intervals.
# Exit code: 0 = all pass, 1 = any fail.

set -euo pipefail

# ── Defaults ────────────────────────────────────────────────
TIMEOUT=120
ENV="production"
MAX_RETRIES=5
RETRY_INTERVAL=5

# ── URL Maps ────────────────────────────────────────────────
declare -A URLS_production=(
  [BFF]="https://cuentaxapi.giraffos.com"
  [WEB]="https://cuentax.giraffos.com"
  [ODOO]="https://cuentaxodoo.giraffos.com"
)

declare -A URLS_staging=(
  [BFF]="https://cuentaxapi-staging.giraffos.com"
  [WEB]="https://cuentax-staging.giraffos.com"
  [ODOO]="https://cuentaxodoo-staging.giraffos.com"
)

# ── Color helpers ───────────────────────────────────────────
if [[ -t 1 ]]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  YELLOW='\033[0;33m'
  CYAN='\033[0;36m'
  BOLD='\033[1m'
  RESET='\033[0m'
else
  GREEN='' RED='' YELLOW='' CYAN='' BOLD='' RESET=''
fi

pass() { echo -e "  ${GREEN}PASS${RESET} $1"; }
fail() { echo -e "  ${RED}FAIL${RESET} $1"; }
info() { echo -e "${CYAN}$1${RESET}"; }
header() { echo -e "\n${BOLD}$1${RESET}"; }

# ── Counters ────────────────────────────────────────────────
PASSED=0
FAILED=0
TESTS=()

record_pass() { PASSED=$((PASSED + 1)); TESTS+=("PASS: $1"); }
record_fail() { FAILED=$((FAILED + 1)); TESTS+=("FAIL: $1"); }

# ── Parse args ──────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --env)     ENV="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: $0 [--timeout SECONDS] [--env production|staging]"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Resolve URLs ────────────────────────────────────────────
env_var="URLS_${ENV}"
if ! declare -p "$env_var" &>/dev/null; then
  echo "Unknown environment: ${ENV}. Supported: production, staging"
  exit 1
fi

# Copy the correct URL map
declare -n URL_MAP="$env_var"
BFF_URL="${URL_MAP[BFF]}"
WEB_URL="${URL_MAP[WEB]}"
ODOO_URL="${URL_MAP[ODOO]}"

# ── jq availability ─────────────────────────────────────────
HAS_JQ=false
if command -v jq &>/dev/null; then
  HAS_JQ=true
fi

# ── HTTP check with retries ────────────────────────────────
# check_endpoint NAME URL PATH [EXPECTED_BODY_SUBSTR]
check_endpoint() {
  local name="$1" url="$2" path="$3" expected="${4:-}"
  local full_url="${url}${path}"
  local attempt=0

  while [[ $attempt -lt $MAX_RETRIES ]]; do
    attempt=$((attempt + 1))
    local http_code body
    body=$(curl -sf --connect-timeout 10 --max-time 15 "$full_url" 2>/dev/null) && http_code=200 || http_code=0

    if [[ $http_code -eq 200 ]]; then
      if [[ -n "$expected" ]]; then
        if echo "$body" | grep -q "$expected"; then
          pass "$name ($path)"
          record_pass "$name ($path)"
          return 0
        fi
      else
        pass "$name ($path)"
        record_pass "$name ($path)"
        return 0
      fi
    fi

    if [[ $attempt -lt $MAX_RETRIES ]]; then
      echo -e "  ${YELLOW}RETRY${RESET} $name ($path) - attempt $attempt/$MAX_RETRIES, waiting ${RETRY_INTERVAL}s..."
      sleep "$RETRY_INTERVAL"
    fi
  done

  fail "$name ($path) - failed after $MAX_RETRIES attempts"
  record_fail "$name ($path)"
  return 1
}

# ── BFF deep health check ──────────────────────────────────
check_bff_dependencies() {
  local full_url="${BFF_URL}/health/ready"
  local body
  body=$(curl -sf --connect-timeout 10 --max-time 15 "$full_url" 2>/dev/null) || {
    fail "BFF dependency check - could not reach /health/ready"
    record_fail "BFF dependency check"
    return 1
  }

  if [[ "$HAS_JQ" == "true" ]]; then
    # Check Redis status
    local redis_status
    redis_status=$(echo "$body" | jq -r '.dependencies.redis // .info.redis // empty' 2>/dev/null)
    if [[ "$redis_status" == "ok" || "$redis_status" == "connected" ]]; then
      pass "BFF dependency: Redis ($redis_status)"
      record_pass "BFF dependency: Redis"
    elif [[ -n "$redis_status" ]]; then
      fail "BFF dependency: Redis ($redis_status)"
      record_fail "BFF dependency: Redis"
    else
      # Try alternate JSON structures
      if echo "$body" | jq -e '.dependencies' &>/dev/null; then
        local redis_found
        redis_found=$(echo "$body" | jq -r '.. | objects | select(has("redis")) | .redis' 2>/dev/null | head -1)
        if [[ "$redis_found" == "ok" || "$redis_found" == "connected" ]]; then
          pass "BFF dependency: Redis ($redis_found)"
          record_pass "BFF dependency: Redis"
        else
          echo -e "  ${YELLOW}SKIP${RESET} BFF dependency: Redis - could not parse status"
        fi
      fi
    fi

    # Check PostgreSQL status
    local pg_status
    pg_status=$(echo "$body" | jq -r '.dependencies.postgres // .dependencies.postgresql // .dependencies.database // .info.postgres // empty' 2>/dev/null)
    if [[ "$pg_status" == "ok" || "$pg_status" == "connected" ]]; then
      pass "BFF dependency: PostgreSQL ($pg_status)"
      record_pass "BFF dependency: PostgreSQL"
    elif [[ -n "$pg_status" ]]; then
      fail "BFF dependency: PostgreSQL ($pg_status)"
      record_fail "BFF dependency: PostgreSQL"
    else
      if echo "$body" | jq -e '.dependencies' &>/dev/null; then
        local pg_found
        pg_found=$(echo "$body" | jq -r '.. | objects | select(has("database") or has("postgres") or has("postgresql")) | to_entries[] | select(.key | test("postgres|database")) | .value' 2>/dev/null | head -1)
        if [[ "$pg_found" == "ok" || "$pg_found" == "connected" ]]; then
          pass "BFF dependency: PostgreSQL ($pg_found)"
          record_pass "BFF dependency: PostgreSQL"
        else
          echo -e "  ${YELLOW}SKIP${RESET} BFF dependency: PostgreSQL - could not parse status"
        fi
      fi
    fi

    # Check circuit breakers
    local circuits
    circuits=$(echo "$body" | jq -r '.circuitBreakers // .circuits // empty' 2>/dev/null)
    if [[ -n "$circuits" && "$circuits" != "null" ]]; then
      local open_circuits
      open_circuits=$(echo "$circuits" | jq -r 'to_entries[] | select(.value == "open" or .value.state == "open") | .key' 2>/dev/null)
      if [[ -z "$open_circuits" ]]; then
        pass "BFF circuit breakers: all closed"
        record_pass "BFF circuit breakers"
      else
        fail "BFF circuit breakers OPEN: $open_circuits"
        record_fail "BFF circuit breakers"
      fi
    else
      echo -e "  ${YELLOW}SKIP${RESET} BFF circuit breakers - not found in response"
    fi
  else
    # Fallback without jq: simple grep checks
    if echo "$body" | grep -qi '"redis"[[:space:]]*:[[:space:]]*"ok"'; then
      pass "BFF dependency: Redis (ok)"
      record_pass "BFF dependency: Redis"
    else
      echo -e "  ${YELLOW}SKIP${RESET} BFF dependency: Redis - install jq for detailed checks"
    fi

    if echo "$body" | grep -qi '"postgres\(ql\)\?\|database"[[:space:]]*:[[:space:]]*"ok"'; then
      pass "BFF dependency: PostgreSQL (ok)"
      record_pass "BFF dependency: PostgreSQL"
    else
      echo -e "  ${YELLOW}SKIP${RESET} BFF dependency: PostgreSQL - install jq for detailed checks"
    fi

    if echo "$body" | grep -qi '"open"'; then
      fail "BFF circuit breakers: found open circuit(s)"
      record_fail "BFF circuit breakers"
    else
      pass "BFF circuit breakers: no open circuits detected"
      record_pass "BFF circuit breakers"
    fi
  fi
}

# ── Main ────────────────────────────────────────────────────
START_TIME=$(date +%s)

echo ""
info "=============================================="
info "  CuentaX Smoke Tests"
info "  Environment: ${ENV}"
info "  Timeout: ${TIMEOUT}s"
info "  Started: $(date '+%Y-%m-%d %H:%M:%S')"
info "=============================================="

# -- BFF checks --
header "[1/4] BFF Health Checks"
check_endpoint "BFF readiness" "$BFF_URL" "/health/ready" '"status"' || true
check_endpoint "BFF liveness"  "$BFF_URL" "/health/live" "" || true

header "[2/4] BFF Dependency Checks"
check_bff_dependencies || true

# -- Web check --
header "[3/4] Web (Next.js) Health Check"
check_endpoint "Web health" "$WEB_URL" "/api/health" "" || true

# -- Odoo check --
header "[4/4] Odoo Health Check"
# Try /web/health first; Odoo may only serve /web/login
check_endpoint "Odoo health" "$ODOO_URL" "/web/health" "" || \
  check_endpoint "Odoo login fallback" "$ODOO_URL" "/web/login" "" || true

# ── Summary ─────────────────────────────────────────────────
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
TOTAL=$((PASSED + FAILED))

echo ""
header "=============================================="
header "  Summary"
header "=============================================="
echo ""

for t in "${TESTS[@]}"; do
  if [[ "$t" == PASS:* ]]; then
    echo -e "  ${GREEN}PASS${RESET} ${t#PASS: }"
  else
    echo -e "  ${RED}FAIL${RESET} ${t#FAIL: }"
  fi
done

echo ""
echo -e "  Total:  ${TOTAL}"
echo -e "  Passed: ${GREEN}${PASSED}${RESET}"
echo -e "  Failed: ${RED}${FAILED}${RESET}"
echo -e "  Duration: ${DURATION}s"
echo ""

if [[ $FAILED -gt 0 ]]; then
  echo -e "${RED}${BOLD}SMOKE TESTS FAILED${RESET}"
  exit 1
else
  echo -e "${GREEN}${BOLD}ALL SMOKE TESTS PASSED${RESET}"
  exit 0
fi
