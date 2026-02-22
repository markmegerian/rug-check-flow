#!/usr/bin/env bash
set -euo pipefail

required_vars=(
  SUPABASE_URL
  SUPABASE_ANON_KEY
  PORTAL_USER_EMAIL
  PORTAL_USER_PASSWORD
  OFFICE_USER_EMAIL
  OFFICE_USER_PASSWORD
  DRIVER_USER_EMAIL
  DRIVER_USER_PASSWORD
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required environment variable: ${var_name}" >&2
    exit 1
  fi
done

login_and_get_token() {
  local email="$1"
  local password="$2"
  local response_file
  response_file="$(mktemp)"
  local payload
  payload=$(printf '{"email":"%s","password":"%s"}' "$email" "$password")
  local status
  status="$(
    curl -sS -o "$response_file" -w "%{http_code}" \
      -X POST \
      "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Content-Type: application/json" \
      -d "$payload"
  )"

  if [[ "$status" != "200" ]]; then
    echo "Auth failed for ${email} with status ${status}" >&2
    cat "$response_file" >&2
    rm -f "$response_file"
    exit 1
  fi

  local token
  token="$(
    python - "$response_file" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    payload = json.load(fh)
print(payload.get("access_token", ""))
PY
  )"
  rm -f "$response_file"

  if [[ -z "$token" ]]; then
    echo "Auth response for ${email} did not include access_token." >&2
    exit 1
  fi

  printf "%s" "$token"
}

query_rest() {
  local token="$1"
  local path="$2"
  local response_file
  response_file="$(mktemp)"
  local status
  status="$(
    curl -sS -o "$response_file" -w "%{http_code}" \
      "${SUPABASE_URL}/rest/v1/${path}" \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Authorization: Bearer ${token}"
  )"

  if [[ "$status" != "200" ]]; then
    echo "REST query failed (${path}) with status ${status}" >&2
    cat "$response_file" >&2
    rm -f "$response_file"
    exit 1
  fi

  printf "%s" "$response_file"
}

assert_all_client_ids_match() {
  local json_file="$1"
  local expected_client_id="$2"
  python - "$json_file" "$expected_client_id" <<'PY'
import json, sys
path = sys.argv[1]
expected = sys.argv[2]
with open(path, "r", encoding="utf-8") as fh:
    rows = json.load(fh)
if not isinstance(rows, list):
    raise SystemExit("Expected list JSON payload")
bad = [row for row in rows if row.get("client_id") not in (None, expected)]
if bad:
    raise SystemExit(f"Found rows outside expected client_id scope: {bad[:3]}")
PY
}

assert_all_driver_ids_match() {
  local json_file="$1"
  local expected_driver_id="$2"
  python - "$json_file" "$expected_driver_id" <<'PY'
import json, sys
path = sys.argv[1]
expected = sys.argv[2]
with open(path, "r", encoding="utf-8") as fh:
    rows = json.load(fh)
if not isinstance(rows, list):
    raise SystemExit("Expected list JSON payload")
bad = [row for row in rows if row.get("assigned_driver_id") not in (None, expected)]
if bad:
    raise SystemExit(f"Found pickup rows not scoped to expected driver_id: {bad[:3]}")
PY
}

echo "==> Authenticating portal/office/driver smoke users"
portal_token="$(login_and_get_token "$PORTAL_USER_EMAIL" "$PORTAL_USER_PASSWORD")"
office_token="$(login_and_get_token "$OFFICE_USER_EMAIL" "$OFFICE_USER_PASSWORD")"
driver_token="$(login_and_get_token "$DRIVER_USER_EMAIL" "$DRIVER_USER_PASSWORD")"

echo "==> Portal scope checks"
portal_invoices_file="$(query_rest "$portal_token" "invoices?select=id,client_id,status&limit=25")"
portal_pickups_file="$(query_rest "$portal_token" "pickup_requests?select=id,client_id,status&limit=25")"
echo "OK: portal invoices and pickup_requests are readable"

if [[ -n "${EXPECTED_PORTAL_CLIENT_ID:-}" ]]; then
  assert_all_client_ids_match "$portal_invoices_file" "$EXPECTED_PORTAL_CLIENT_ID"
  assert_all_client_ids_match "$portal_pickups_file" "$EXPECTED_PORTAL_CLIENT_ID"
  echo "OK: portal rows matched EXPECTED_PORTAL_CLIENT_ID=${EXPECTED_PORTAL_CLIENT_ID}"
fi

echo "==> Office scope checks"
office_invoices_file="$(query_rest "$office_token" "invoices?select=id,client_id,status&limit=25")"
office_pickups_file="$(query_rest "$office_token" "pickup_requests?select=id,client_id,status&limit=25")"
echo "OK: office invoices and pickup_requests are readable"

echo "==> Driver scope checks"
driver_pickups_file="$(query_rest "$driver_token" "pickup_requests?select=id,assigned_driver_id,status&limit=25")"
driver_items_file="$(query_rest "$driver_token" "pickup_request_items?select=id,pickup_request_id&limit=25")"
echo "OK: driver pickup_requests and pickup_request_items are readable"

if [[ -n "${EXPECTED_DRIVER_USER_ID:-}" ]]; then
  assert_all_driver_ids_match "$driver_pickups_file" "$EXPECTED_DRIVER_USER_ID"
  echo "OK: driver pickup rows matched EXPECTED_DRIVER_USER_ID=${EXPECTED_DRIVER_USER_ID}"
fi

rm -f "$portal_invoices_file" "$portal_pickups_file" "$office_invoices_file" "$office_pickups_file" "$driver_pickups_file" "$driver_items_file"
echo "RLS scope smoke test completed successfully."
