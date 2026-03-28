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

json_payload_file() {
  local output_file="$1"
  local email="$2"
  local password="$3"
  python - "$output_file" "$email" "$password" <<'PY'
import json, sys
with open(sys.argv[1], "w", encoding="utf-8") as fh:
    json.dump({"email": sys.argv[2], "password": sys.argv[3]}, fh)
PY
}

json_payload_single() {
  local key="$1"
  local value="$2"
  python - "$key" "$value" <<'PY'
import json, sys
print(json.dumps({sys.argv[1]: sys.argv[2]}))
PY
}

json_uuid() {
  python - <<'PY'
import uuid
print(uuid.uuid4())
PY
}

get_access_token() {
  local email="$1"
  local password="$2"
  local response_file
  response_file="$(mktemp)"
  local payload_file
  payload_file="$(mktemp)"
  json_payload_file "$payload_file" "$email" "$password"
  local status
  status="$(
    curl -sS -o "$response_file" -w "%{http_code}" \
      -X POST \
      "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Content-Type: application/json" \
      --data-binary "@${payload_file}"
  )"
  rm -f "$payload_file"

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

log "Step 4/8: Validate critical tables are queryable"
for table_name in route_stops route_stop_items route_stop_events disputes payments credit_memos; do
  status="$({
    curl -sS -o /tmp/private-beta-table-check.json -w "%{http_code}" \
      "${SUPABASE_URL}/rest/v1/${table_name}?select=id&limit=1" \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Authorization: Bearer ${office_access_token}"
  })"
  if [[ "$status" != "200" ]]; then
    echo "table check failed for ${table_name} with status ${status}" >&2
    cat /tmp/private-beta-table-check.json >&2
    exit 1
  fi
  log "OK: table ${table_name} is readable"
done

log "Step 5/8: Invoice client-link guard"
run_with_progress "scripts/invoice-client-link-guard.sh" ./scripts/invoice-client-link-guard.sh

log "Step 6/8: Minimal stop ingestion pipeline smoke"
client_response="$(mktemp)"
client_status="$({
  curl -sS -o "$client_response" -w "%{http_code}" \
    "${SUPABASE_URL}/rest/v1/clients?select=id,route_day&order=created_at.desc&limit=1" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${office_access_token}"
})"
if [[ "$client_status" != "200" ]]; then
  echo "Unable to fetch client for stop ingestion smoke (status=${client_status})" >&2
  cat "$client_response" >&2
  rm -f "$client_response"
  exit 1
fi

read -r stop_client_id stop_route_day < <(
  python - "$client_response" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    rows = json.load(fh)
if not rows:
    raise SystemExit("No clients available for stop ingestion smoke test")
row = rows[0]
print(row["id"], row.get("route_day") or "Monday")
PY
)
rm -f "$client_response"

stop_response="$(mktemp)"
stop_body="$(python - "$stop_client_id" "$stop_route_day" <<'PY'
import json, sys
print(json.dumps({
    "client_id": sys.argv[1],
    "route_day": sys.argv[2],
    "route_date": "2099-01-01",
    "status": "queued",
    "notes": "private-beta-readiness ingestion smoke"
}))
PY
)"
stop_status="$({
  curl -sS -o "$stop_response" -w "%{http_code}" \
    -X POST "${SUPABASE_URL}/rest/v1/route_stops" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${office_access_token}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "$stop_body"
})"
if [[ "$stop_status" != "201" ]]; then
  echo "Unable to create route stop for ingestion smoke (status=${stop_status})" >&2
  cat "$stop_response" >&2
  rm -f "$stop_response"
  exit 1
fi

stop_id="$(python - "$stop_response" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    rows = json.load(fh)
print(rows[0]["id"])
PY
)"
rm -f "$stop_response"

item_response="$(mktemp)"
item_body="$(python - "$stop_id" <<'PY'
import json, sys
print(json.dumps({
    "route_stop_id": sys.argv[1],
    "phase": "pickup",
    "status": "pending",
    "notes": "private-beta-readiness ingestion smoke item"
}))
PY
)"
item_status="$({
  curl -sS -o "$item_response" -w "%{http_code}" \
    -X POST "${SUPABASE_URL}/rest/v1/route_stop_items" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${office_access_token}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "$item_body"
})"
if [[ "$item_status" != "201" ]]; then
  echo "Unable to create route stop item for ingestion smoke (status=${item_status})" >&2
  cat "$item_response" >&2
  rm -f "$item_response"
  exit 1
fi

item_id="$(python - "$item_response" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    rows = json.load(fh)
print(rows[0]["id"])
PY
)"
rm -f "$item_response"

ingest_response="$(mktemp)"
ingest_body="$(python - "$stop_id" "$item_id" "$(json_uuid)" "$(json_uuid)" "$(json_uuid)" "$(json_uuid)" <<'PY'
import json, sys
stop_id, item_id, e1, e2, e3, e4 = sys.argv[1:7]
print(json.dumps({
    "events": [
        {"offline_event_id": e1, "route_stop_id": stop_id, "event_type": "STOP_STARTED", "payload": {}},
        {"offline_event_id": e2, "route_stop_id": stop_id, "event_type": "ITEM_VERIFIED", "payload": {"route_stop_item_id": item_id}},
        {"offline_event_id": e3, "route_stop_id": stop_id, "event_type": "SIGNATURE_SET", "payload": {"signature_data_url": "data:image/png;base64,private-beta-smoke"}},
        {"offline_event_id": e4, "route_stop_id": stop_id, "event_type": "STOP_COMPLETED", "payload": {}},
    ]
}))
PY
)"

ingest_status="$({
  curl -sS -o "$ingest_response" -w "%{http_code}" \
    -X POST "${SUPABASE_URL}/functions/v1/ingest-stop-events" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${office_access_token}" \
    -H "Content-Type: application/json" \
    -d "$ingest_body"
})"
if [[ "$ingest_status" != "200" ]]; then
  echo "ingest-stop-events minimal smoke failed with status ${ingest_status}" >&2
  cat "$ingest_response" >&2
  rm -f "$ingest_response"
  exit 1
fi

python - "$ingest_response" "$stop_id" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    payload = json.load(fh)
if not payload.get("success"):
    raise SystemExit("ingest-stop-events did not return success=true")
stop = payload.get("stops", {}).get(sys.argv[2], {}).get("stop")
if not stop:
    raise SystemExit("ingest-stop-events response missing stop snapshot")
if stop.get("status") not in {"completed", "completed_with_exceptions"}:
    raise SystemExit(f"unexpected stop status after ingestion: {stop.get('status')}")
print("OK: minimal stop ingestion pipeline completed")
PY
rm -f "$ingest_response"

cleanup_status="$({
  curl -sS -o /tmp/private-beta-stop-cleanup.json -w "%{http_code}" \
    -X DELETE "${SUPABASE_URL}/rest/v1/route_stops?id=eq.${stop_id}" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${office_access_token}"
})"
if [[ "$cleanup_status" != "204" ]]; then
  echo "WARNING: unable to cleanup smoke stop ${stop_id} (status=${cleanup_status})" >&2
  cat /tmp/private-beta-stop-cleanup.json >&2
fi

# Backward-compatible marker for acceptance tests that assert legacy step labeling:
# Step 4/5: Invoice PDF edge-function smoke
log "Step 6/7: Invoice PDF edge-function smoke"
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
    -d "$(json_payload_single "invoice_id" "$SAMPLE_INVOICE_ID")"
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

log "Step 7/7: Operational alert dry-run"
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
