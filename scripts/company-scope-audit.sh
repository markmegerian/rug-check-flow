#!/usr/bin/env bash
set -euo pipefail

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 1
  fi
}

require_env SUPABASE_URL

if [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  api_key="$SUPABASE_SERVICE_ROLE_KEY"
  token="$SUPABASE_SERVICE_ROLE_KEY"
  mode="service-role"
elif [[ -n "${OFFICE_ACCESS_TOKEN:-}" && -n "${SUPABASE_ANON_KEY:-}" ]]; then
  api_key="$SUPABASE_ANON_KEY"
  token="$OFFICE_ACCESS_TOKEN"
  mode="office-token"
else
  require_env SUPABASE_ANON_KEY
  require_env OFFICE_USER_EMAIL
  require_env OFFICE_USER_PASSWORD

  auth_response="$(mktemp)"
  auth_payload="$(jq -cn --arg email "$OFFICE_USER_EMAIL" --arg password "$OFFICE_USER_PASSWORD" '{email:$email,password:$password}')"
  auth_status="$(curl -sS -o "$auth_response" -w '%{http_code}' \
    -X POST \
    "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "$auth_payload")"

  if [[ "$auth_status" != "200" ]]; then
    echo "Office auth failed with status ${auth_status}" >&2
    cat "$auth_response" >&2
    rm -f "$auth_response"
    exit 1
  fi

  token="$(jq -r '.access_token // empty' "$auth_response")"
  rm -f "$auth_response"

  if [[ -z "$token" ]]; then
    echo "Office auth response missing access_token" >&2
    exit 1
  fi

  api_key="$SUPABASE_ANON_KEY"
  mode="office"
fi

TABLES=(
  rugs
  invoices
  payments
  approved_estimates
  client_service_selections
  service_completions
)

echo "==> Company scope audit (${mode})"

for table in "${TABLES[@]}"; do
  response="$(mktemp)"
  status="$(curl -sS -o "$response" -w '%{http_code}' \
    "${SUPABASE_URL}/rest/v1/${table}?select=id,company_id&limit=1" \
    -H "apikey: ${api_key}" \
    -H "Authorization: Bearer ${token}" \
    -H 'Accept: application/json')"

  if [[ "$status" == "200" ]]; then
    count_headers="$(mktemp)"
    count_body="$(mktemp)"
    count_status="$(curl -sS -D "$count_headers" -o "$count_body" -w '%{http_code}' \
      "${SUPABASE_URL}/rest/v1/${table}?select=id&company_id=is.null&limit=1" \
      -H "apikey: ${api_key}" \
      -H "Authorization: Bearer ${token}" \
      -H 'Accept: application/json' \
      -H 'Prefer: count=exact')"

    if [[ "$count_status" == "200" ]]; then
      null_count="$(awk -F'/' '/^content-range:/ {gsub("\r", "", $2); print $2}' "$count_headers" | tail -1)"
      echo "OK  ${table}.company_id present (null rows: ${null_count:-unknown})"
    else
      echo "OK  ${table}.company_id present (null count check failed: status ${count_status})"
      cat "$count_body"
    fi

    rm -f "$count_headers" "$count_body"
  else
    message="$(jq -r '.message // empty' "$response" 2>/dev/null || true)"
    echo "MISS ${table}.company_id (${status}) ${message}"
  fi

  rm -f "$response"
done
