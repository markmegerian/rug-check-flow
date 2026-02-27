#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() {
  printf '[phase5.3][%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

declare -a GATE_RESULTS=()
HAS_SKIP=0

record_result() {
  local name="$1"
  local status="$2"
  GATE_RESULTS+=("${name}|${status}")
}

print_summary() {
  log "SUMMARY: phase5.3 gate results"
  for item in "${GATE_RESULTS[@]}"; do
    local name="${item%%|*}"
    local status="${item##*|}"
    log "SUMMARY: ${name}=${status}"
  done
}

require_env() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    log "missing required env: $key"
    return 1
  fi
}

run_step() {
  local name="$1"
  shift
  log "START: $name"
  "$@"
  log "DONE : $name"
  record_result "$name" "PASS"
}

skip_step() {
  local name="$1"
  local reason="$2"
  log "SKIP : $name ($reason)"
  record_result "$name" "SKIP"
  HAS_SKIP=1
}

log "Phase 5.3 pre-live gate started"

run_step "lint" npm run lint
run_step "test" env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u PORTAL_USER_EMAIL -u PORTAL_USER_PASSWORD -u OFFICE_USER_EMAIL -u OFFICE_USER_PASSWORD -u DRIVER_USER_EMAIL -u DRIVER_USER_PASSWORD -u EXPECTED_PORTAL_CLIENT_ID -u EXPECTED_DRIVER_USER_ID npm run test
run_step "build" npm run build

if [[ -n "${SUPABASE_URL:-}" || -n "${SUPABASE_ANON_KEY:-}" ]]; then
  require_env SUPABASE_URL
  require_env SUPABASE_ANON_KEY
fi

if [[ -n "${SMOKE_USER_EMAIL:-}" || -n "${SMOKE_USER_PASSWORD:-}" ]]; then
  require_env SMOKE_USER_EMAIL
  require_env SMOKE_USER_PASSWORD
  run_step "staging smoke" ./scripts/staging-smoke-test.sh
else
  skip_step "staging smoke" "SMOKE_USER_EMAIL/SMOKE_USER_PASSWORD not set"
fi

if [[ -n "${OFFICE_USER_EMAIL:-}" || -n "${OFFICE_USER_PASSWORD:-}" || -n "${DRIVER_USER_EMAIL:-}" || -n "${DRIVER_USER_PASSWORD:-}" || -n "${PORTAL_USER_EMAIL:-}" || -n "${PORTAL_USER_PASSWORD:-}" ]]; then
  require_env OFFICE_USER_EMAIL
  require_env OFFICE_USER_PASSWORD
  require_env DRIVER_USER_EMAIL
  require_env DRIVER_USER_PASSWORD
  require_env PORTAL_USER_EMAIL
  require_env PORTAL_USER_PASSWORD
  run_step "rls scope smoke" ./scripts/rls-scope-smoke-test.sh
  run_step "private beta readiness" ./scripts/private-beta-readiness.sh
else
  skip_step "rls scope smoke" "role credentials not fully set"
  skip_step "private beta readiness" "role credentials not fully set"
fi

if [[ "${PHASE53_REQUIRE_STAGING_CREDS:-false}" == "true" ]]; then
  if [[ -z "${SMOKE_USER_EMAIL:-}" || -z "${SMOKE_USER_PASSWORD:-}" || -z "${OFFICE_USER_EMAIL:-}" || -z "${OFFICE_USER_PASSWORD:-}" || -z "${DRIVER_USER_EMAIL:-}" || -z "${DRIVER_USER_PASSWORD:-}" || -z "${PORTAL_USER_EMAIL:-}" || -z "${PORTAL_USER_PASSWORD:-}" ]]; then
    log "ERROR: PHASE53_REQUIRE_STAGING_CREDS=true but required staging credentials are missing"
    print_summary
    exit 1
  fi
fi

if [[ "${PHASE53_FAIL_ON_SKIP:-false}" == "true" && "$HAS_SKIP" -eq 1 ]]; then
  log "ERROR: PHASE53_FAIL_ON_SKIP=true and one or more checks were skipped"
  print_summary
  exit 1
fi

log "Phase 5.3 pre-live gate finished"
print_summary

if [[ -x "./scripts/next-stage.sh" ]]; then
  ./scripts/next-stage.sh --after 5.3
fi
