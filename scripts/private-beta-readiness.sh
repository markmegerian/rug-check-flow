#!/usr/bin/env bash
set -euo pipefail

timestamp() {
  date '+%Y-%m-%d %H:%M:%S'
}

log() {
  echo "[$(timestamp)] $*"
}

run_with_progress() {
  local label="$1"
  shift

  log "START: ${label}"
  local start_time=$SECONDS

  (
    while true; do
      sleep 20
      log "... still running: ${label}"
    done
  ) &
  local heartbeat_pid=$!

  set +e
  "$@"
  local cmd_status=$?
  set -e

  kill "$heartbeat_pid" >/dev/null 2>&1 || true
  wait "$heartbeat_pid" 2>/dev/null || true

  local duration=$((SECONDS - start_time))
  if [[ "$cmd_status" -ne 0 ]]; then
    log "FAIL: ${label} (${duration}s)"
    return "$cmd_status"
  fi

  log "DONE: ${label} (${duration}s)"
}

require_envs() {
  local context="$1"
  shift
  local missing=()
  for var_name in "$@"; do
    if [[ -z "${!var_name:-}" ]]; then
      missing+=("$var_name")
    fi
  done
  if (( ${#missing[@]} > 0 )); then
    echo "${context} requires environment variables: ${missing[*]}" >&2
    exit 1
  fi
}

get_access_token() {
  local email="$1"
  local password="$2"
  local response_file
  response_file="$(mktemp)"
  local status
  status="$(
    curl -sS -o "$response_file" -w "%{http_code}" \
      -X POST \
      "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Content-Type: application/json" \
      -d "$(printf '{"email":"%s","password":"%s"}' "$email" "$password")"
  )"

  if [[ "$status" != "200" ]]; then
    echo "Auth failed for ${email} with status ${status}" >&2
    cat "$response_file" >&2
    rm -f "$response_file"
    return 1
  fi

  local access_token
  access_token="$(
    python - "$response_file" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    payload = json.load(fh)
print(payload.get("access_token", ""))
PY
  )"
  rm -f "$response_file"
  if [[ -z "$access_token" ]]; then
    echo "Auth response for ${email} did not include access_token." >&2
    return 1
  fi
  printf "%s" "$access_token"
}

log "==> Private beta readiness checks"
log "Step 1/5: Lint, test, and build"
run_with_progress "npm run lint" npm run lint
# Keep unit tests deterministic here; role-scoped network validation runs in Step 3.
run_with_progress "npm run test (isolated from smoke env vars)" bash -c '
  unset SUPABASE_URL SUPABASE_ANON_KEY \
    PORTAL_USER_EMAIL PORTAL_USER_PASSWORD \
    OFFICE_USER_EMAIL OFFICE_USER_PASSWORD \
    DRIVER_USER_EMAIL DRIVER_USER_PASSWORD \
    EXPECTED_PORTAL_CLIENT_ID EXPECTED_DRIVER_USER_ID
  npm run test
'
run_with_progress "npm run build" npm run build

log "Step 2/5: Staging smoke"
require_envs "Staging smoke" SUPABASE_URL SUPABASE_ANON_KEY SMOKE_USER_EMAIL SMOKE_USER_PASSWORD
run_with_progress "scripts/staging-smoke-test.sh" ./scripts/staging-smoke-test.sh

log "Step 3/5: Role-scoped RLS smoke"
require_envs "Role-scoped RLS smoke" \
  SUPABASE_URL SUPABASE_ANON_KEY \
  PORTAL_USER_EMAIL PORTAL_USER_PASSWORD \
  OFFICE_USER_EMAIL OFFICE_USER_PASSWORD \
  DRIVER_USER_EMAIL DRIVER_USER_PASSWORD
run_with_progress "scripts/rls-scope-smoke-test.sh" ./scripts/rls-scope-smoke-test.sh

office_access_token=""
require_envs "Office auth token" SUPABASE_URL SUPABASE_ANON_KEY OFFICE_USER_EMAIL OFFICE_USER_PASSWORD
office_access_token="$(get_access_token "$OFFICE_USER_EMAIL" "$OFFICE_USER_PASSWORD")"

log "Step 4/5: Invoice PDF edge-function smoke"
require_envs "Invoice PDF smoke" SUPABASE_URL SUPABASE_ANON_KEY OFFICE_USER_EMAIL OFFICE_USER_PASSWORD
if [[ -z "${SAMPLE_INVOICE_ID:-}" ]]; then
  log "SAMPLE_INVOICE_ID not set; deriving latest visible invoice id from office scope"
  SAMPLE_INVOICE_ID="$(./scripts/get-sample-invoice-id.sh)"
  export SAMPLE_INVOICE_ID
  log "Using SAMPLE_INVOICE_ID=${SAMPLE_INVOICE_ID}"
fi
invoice_pdf_response="$(mktemp)"
invoice_pdf_status="$(
  curl -sS -o "$invoice_pdf_response" -w "%{http_code}" \
    -X POST \
    "${SUPABASE_URL}/functions/v1/invoice-pdf" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${office_access_token}" \
    -H "Content-Type: application/json" \
    -d "$(printf '{"invoice_id":"%s"}' "$SAMPLE_INVOICE_ID")"
)"

if [[ "$invoice_pdf_status" != "200" ]]; then
  echo "invoice-pdf function failed with status ${invoice_pdf_status}" >&2
  cat "$invoice_pdf_response" >&2
  rm -f "$invoice_pdf_response"
  exit 1
fi

python - "$invoice_pdf_response" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    payload = json.load(fh)
if not payload.get("signed_url"):
    raise SystemExit("invoice-pdf response missing signed_url")
print("OK: invoice-pdf signed URL returned")
PY
rm -f "$invoice_pdf_response"

log "Step 5/5: Operational alert dry-run"
require_envs "Operational alert dry-run" SUPABASE_URL SUPABASE_ANON_KEY OFFICE_USER_EMAIL OFFICE_USER_PASSWORD
alert_response_file="$(mktemp)"
alert_status="$(
  curl -sS -o "$alert_response_file" -w "%{http_code}" \
    -X POST \
    "${SUPABASE_URL}/functions/v1/operational-alerts" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${office_access_token}" \
    -H "Content-Type: application/json" \
    -d '{"dry_run":true}'
)"

if [[ "$alert_status" != "200" ]]; then
  echo "operational-alerts dry-run failed with status ${alert_status}" >&2
  cat "$alert_response_file" >&2
  rm -f "$alert_response_file"
  exit 1
fi

python - "$alert_response_file" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    payload = json.load(fh)
if not payload.get("success"):
    raise SystemExit("operational-alerts dry-run did not return success=true")
print("OK: operational-alerts dry-run returned success")
PY
rm -f "$alert_response_file"

log "Private beta readiness checks completed."
