#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() {
  printf '[phase5.3][%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
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
  log "SKIP : staging smoke (SMOKE_USER_EMAIL/SMOKE_USER_PASSWORD not set)"
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
  log "SKIP : role-scope and readiness checks (role credentials not fully set)"
fi

log "Phase 5.3 pre-live gate finished"

if [[ -x "./scripts/next-stage.sh" ]]; then
  ./scripts/next-stage.sh --after 5.3
fi
