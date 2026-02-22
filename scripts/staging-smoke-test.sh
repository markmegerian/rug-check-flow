#!/usr/bin/env bash
set -euo pipefail

required_vars=(
  SUPABASE_URL
  SUPABASE_ANON_KEY
  SMOKE_USER_EMAIL
  SMOKE_USER_PASSWORD
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required environment variable: ${var_name}" >&2
    exit 1
  fi
done

echo "==> Authenticating smoke test user"
auth_payload=$(printf '{"email":"%s","password":"%s"}' "$SMOKE_USER_EMAIL" "$SMOKE_USER_PASSWORD")
auth_response_file="$(mktemp)"
auth_status="$(
  curl -sS -o "$auth_response_file" -w "%{http_code}" \
    -X POST \
    "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "$auth_payload"
)"

if [[ "$auth_status" != "200" ]]; then
  echo "Auth failed with status ${auth_status}" >&2
  cat "$auth_response_file" >&2
  rm -f "$auth_response_file"
  exit 1
fi

access_token="$(
  python - "$auth_response_file" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    payload = json.load(fh)
print(payload.get("access_token", ""))
PY
)"

rm -f "$auth_response_file"

if [[ -z "$access_token" ]]; then
  echo "Auth succeeded but no access_token was returned." >&2
  exit 1
fi

check_table() {
  local table="$1"
  local out_file
  out_file="$(mktemp)"
  local status
  status="$(
    curl -sS -o "$out_file" -w "%{http_code}" \
      "${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1" \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Authorization: Bearer ${access_token}"
  )"

  if [[ "$status" != "200" ]]; then
    echo "Table check failed for ${table} (status ${status})" >&2
    cat "$out_file" >&2
    rm -f "$out_file"
    exit 1
  fi

  rm -f "$out_file"
  echo "OK: ${table}"
}

echo "==> Validating workflow table access"
check_table "pickup_requests"
check_table "estimates"
check_table "invoices"

check_route() {
  local route="$1"
  local status
  status="$(
    curl -sS -o /dev/null -w "%{http_code}" \
      "${APP_BASE_URL%/}${route}"
  )"

  if [[ "$status" -lt 200 || "$status" -ge 500 ]]; then
    echo "Route check failed for ${route} (status ${status})" >&2
    exit 1
  fi

  echo "OK: route ${route} (${status})"
}

if [[ -n "${APP_BASE_URL:-}" ]]; then
  echo "==> Validating frontend route reachability"
  check_route "/"
  check_route "/auth"
  check_route "/portal"
fi

echo "Smoke test completed successfully."
