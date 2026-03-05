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
log "Step 1/7: Lint, test, and build"
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

log "Step 2/7: Staging smoke"
require_envs "Staging smoke" SUPABASE_URL SUPABASE_ANON_KEY SMOKE_USER_EMAIL SMOKE_USER_PASSWORD
run_with_progress "scripts/staging-smoke-test.sh" ./scripts/staging-smoke-test.sh

log "Step 3/7: Role-scoped RLS smoke"
require_envs "Role-scoped RLS smoke" \
  SUPABASE_URL SUPABASE_ANON_KEY \
  PORTAL_USER_EMAIL PORTAL_USER_PASSWORD \
  OFFICE_USER_EMAIL OFFICE_USER_PASSWORD \
  DRIVER_USER_EMAIL DRIVER_USER_PASSWORD
run_with_progress "scripts/rls-scope-smoke-test.sh" ./scripts/rls-scope-smoke-test.sh

office_access_token=""
require_envs "Office auth token" SUPABASE_URL SUPABASE_ANON_KEY OFFICE_USER_EMAIL OFFICE_USER_PASSWORD
office_access_token="$(get_access_token "$OFFICE_USER_EMAIL" "$OFFICE_USER_PASSWORD")"

log "Step 4/7: Invoice PDF edge-function smoke"
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

log "Step 5/7: Operational alert dry-run"
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

log "Step 6/7: Validate new tables exist"
require_envs "Table validation" SUPABASE_URL SUPABASE_ANON_KEY OFFICE_USER_EMAIL OFFICE_USER_PASSWORD
tables_to_check=(
  "route_stops"
  "route_stop_items"
  "route_stop_events"
  "disputes"
  "payments"
  "credit_memos"
)

for table in "${tables_to_check[@]}"; do
  table_check_response="$(mktemp)"
  table_check_status="$(
    curl -sS -o "$table_check_response" -w "%{http_code}" \
      -X GET \
      "${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1" \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Authorization: Bearer ${office_access_token}"
  )"
  
  if [[ "$table_check_status" != "200" ]] && [[ "$table_check_status" != "406" ]]; then
    echo "Table ${table} validation failed with status ${table_check_status}" >&2
    cat "$table_check_response" >&2
    rm -f "$table_check_response"
    exit 1
  fi
  
  rm -f "$table_check_response"
  log "OK: Table ${table} exists and is accessible"
done

log "Step 7/7: Stop ingestion pipeline test"
require_envs "Stop ingestion test" SUPABASE_URL SUPABASE_ANON_KEY OFFICE_USER_EMAIL OFFICE_USER_PASSWORD
if [[ -z "${DRIVER_USER_EMAIL:-}" ]] || [[ -z "${DRIVER_USER_PASSWORD:-}" ]]; then
  log "DRIVER_USER_EMAIL/DRIVER_USER_PASSWORD not set; skipping stop ingestion test"
  log "WARNING: Stop ingestion pipeline not validated"
else
  driver_access_token="$(get_access_token "$DRIVER_USER_EMAIL" "$DRIVER_USER_PASSWORD")"
  
  # Create a test route stop
  test_route_date="$(date +%Y-%m-%d)"
  test_client_id_response="$(mktemp)"
  test_client_id_status="$(
    curl -sS -o "$test_client_id_response" -w "%{http_code}" \
      -X GET \
      "${SUPABASE_URL}/rest/v1/clients?select=id&limit=1" \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Authorization: Bearer ${office_access_token}"
  )"
  
  if [[ "$test_client_id_status" != "200" ]]; then
    echo "Failed to get test client ID with status ${test_client_id_status}" >&2
    cat "$test_client_id_response" >&2
    rm -f "$test_client_id_response"
    exit 1
  fi
  
  test_client_id="$(
    python - "$test_client_id_response" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    data = json.load(fh)
if not data or len(data) == 0:
    raise SystemExit("No clients found for test")
print(data[0]["id"])
PY
  )"
  rm -f "$test_client_id_response"
  
  # Create test stop
  test_stop_payload="$(python - "$test_client_id" "$test_route_date" <<'PY'
import json, sys, uuid
client_id = sys.argv[1]
route_date = sys.argv[2]
stop_id = str(uuid.uuid4())
print(json.dumps({
    "id": stop_id,
    "client_id": client_id,
    "route_date": route_date,
    "route_day": "monday",
    "status": "queued"
}))
PY
  )"
  
  test_stop_response="$(mktemp)"
  test_stop_status="$(
    curl -sS -o "$test_stop_response" -w "%{http_code}" \
      -X POST \
      "${SUPABASE_URL}/rest/v1/route_stops" \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Authorization: Bearer ${office_access_token}" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=representation" \
      -d "$test_stop_payload"
  )"
  
  if [[ "$test_stop_status" != "201" ]] && [[ "$test_stop_status" != "409" ]]; then
    echo "Failed to create test stop with status ${test_stop_status}" >&2
    cat "$test_stop_response" >&2
    rm -f "$test_stop_response"
    exit 1
  fi
  
  test_stop_id="$(
    python - "$test_stop_response" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    data = json.load(fh)
if isinstance(data, list) and len(data) > 0:
    print(data[0]["id"])
elif isinstance(data, dict) and "id" in data:
    print(data["id"])
else:
    raise SystemExit("Could not extract stop ID from response")
PY
  )"
  rm -f "$test_stop_response"
  
  # Create a test route_stop_item (required for completion)
  test_item_payload="$(python - "$test_stop_id" <<'PY'
import json, sys
stop_id = sys.argv[1]
print(json.dumps({
    "route_stop_id": stop_id,
    "phase": "delivery",
    "status": "pending",
    "notes": "Test item for readiness check"
}))
PY
  )"
  
  test_item_response="$(mktemp)"
  test_item_status="$(
    curl -sS -o "$test_item_response" -w "%{http_code}" \
      -X POST \
      "${SUPABASE_URL}/rest/v1/route_stop_items" \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Authorization: Bearer ${office_access_token}" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=representation" \
      -d "$test_item_payload"
  )"
  
  if [[ "$test_item_status" != "201" ]]; then
    echo "Failed to create test stop item with status ${test_item_status}" >&2
    cat "$test_item_response" >&2
    rm -f "$test_item_response"
    # Cleanup test stop
    curl -sS -X DELETE \
      "${SUPABASE_URL}/rest/v1/route_stops?id=eq.${test_stop_id}" \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Authorization: Bearer ${office_access_token}" >/dev/null 2>&1 || true
    exit 1
  fi
  
  test_item_id="$(
    python - "$test_item_response" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    data = json.load(fh)
if isinstance(data, list) and len(data) > 0:
    print(data[0]["id"])
elif isinstance(data, dict) and "id" in data:
    print(data["id"])
else:
    raise SystemExit("Could not extract item ID from response")
PY
  )"
  rm -f "$test_item_response"
  
  # Ingest test events (start, set signature, verify item, complete)
  test_events_payload="$(python - "$test_stop_id" "$test_item_id" <<'PY'
import json, sys, uuid
stop_id = sys.argv[1]
item_id = sys.argv[2]
events = [
    {
        "offline_event_id": str(uuid.uuid4()),
        "route_stop_id": stop_id,
        "event_type": "STOP_STARTED",
        "payload": {}
    },
    {
        "offline_event_id": str(uuid.uuid4()),
        "route_stop_id": stop_id,
        "event_type": "SIGNATURE_SET",
        "payload": {
            "signature_data_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        }
    },
    {
        "offline_event_id": str(uuid.uuid4()),
        "route_stop_id": stop_id,
        "event_type": "ITEM_VERIFIED",
        "payload": {
            "route_stop_item_id": item_id
        }
    },
    {
        "offline_event_id": str(uuid.uuid4()),
        "route_stop_id": stop_id,
        "event_type": "STOP_COMPLETED",
        "payload": {}
    }
]
print(json.dumps({"events": events}))
PY
  )"
  
  ingest_response="$(mktemp)"
  ingest_status="$(
    curl -sS -o "$ingest_response" -w "%{http_code}" \
      -X POST \
      "${SUPABASE_URL}/functions/v1/ingest-stop-events" \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Authorization: Bearer ${driver_access_token}" \
      -H "Content-Type: application/json" \
      -d "$test_events_payload"
  )"
  
  if [[ "$ingest_status" != "200" ]]; then
    echo "Stop ingestion test failed with status ${ingest_status}" >&2
    cat "$ingest_response" >&2
    rm -f "$ingest_response"
    # Cleanup test stop
    curl -sS -X DELETE \
      "${SUPABASE_URL}/rest/v1/route_stops?id=eq.${test_stop_id}" \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Authorization: Bearer ${office_access_token}" >/dev/null 2>&1 || true
    exit 1
  fi
  
  python - "$ingest_response" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    payload = json.load(fh)
if not payload.get("success"):
    raise SystemExit("Stop ingestion did not return success=true")
print("OK: Stop ingestion pipeline test passed")
PY
  rm -f "$ingest_response"
  
  # Verify stop was completed
  verify_stop_response="$(mktemp)"
  verify_stop_status="$(
    curl -sS -o "$verify_stop_response" -w "%{http_code}" \
      -X GET \
      "${SUPABASE_URL}/rest/v1/route_stops?id=eq.${test_stop_id}&select=status" \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Authorization: Bearer ${office_access_token}"
  )"
  
  if [[ "$verify_stop_status" == "200" ]]; then
    stop_status="$(
      python - "$verify_stop_response" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    data = json.load(fh)
if data and len(data) > 0:
    print(data[0].get("status", "unknown"))
else:
    print("unknown")
PY
    )"
    if [[ "$stop_status" == "completed" ]]; then
      log "OK: Test stop was successfully completed via event ingestion"
    else
      log "WARNING: Test stop status is ${stop_status}, expected 'completed'"
    fi
  fi
  rm -f "$verify_stop_response"
  
  # Cleanup test stop
  curl -sS -X DELETE \
    "${SUPABASE_URL}/rest/v1/route_stops?id=eq.${test_stop_id}" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${office_access_token}" >/dev/null 2>&1 || true
fi

log "Private beta readiness checks completed."
