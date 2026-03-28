#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_URL:?Missing SUPABASE_URL}"

if [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  api_key="$SUPABASE_SERVICE_ROLE_KEY"
  token="$SUPABASE_SERVICE_ROLE_KEY"
  mode="service-role"
else
  required_vars=(SUPABASE_ANON_KEY OFFICE_USER_EMAIL OFFICE_USER_PASSWORD)
  for var_name in "${required_vars[@]}"; do
    if [[ -z "${!var_name:-}" ]]; then
      echo "Missing required environment variable: ${var_name}" >&2
      exit 1
    fi
  done

  auth_response="$(mktemp)"
  auth_payload="$(jq -cn --arg email "$OFFICE_USER_EMAIL" --arg password "$OFFICE_USER_PASSWORD" '{email:$email,password:$password}')"
  auth_status="$(curl -sS -o "$auth_response" -w "%{http_code}" -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" -H "apikey: ${SUPABASE_ANON_KEY}" -H "Content-Type: application/json" -d "$auth_payload")"

  if [[ "$auth_status" != "200" ]]; then
    echo "Office auth failed with status ${auth_status}" >&2
    cat "$auth_response" >&2
    rm -f "$auth_response"
    exit 1
  fi

  token="$(jq -r '.access_token // empty' "$auth_response")"
  rm -f "$auth_response"

  api_key="$SUPABASE_ANON_KEY"
  mode="office"
fi

check_column() {
  local table="$1"
  local column="$2"
  local response="$(mktemp)"
  local status="$(curl -sS -o "$response" -w "%{http_code}" "${SUPABASE_URL}/rest/v1/${table}?select=id,${column}&limit=1" -H "apikey: ${api_key}" -H "Authorization: Bearer ${token}")"
  if [[ "$status" != "200" ]]; then
    echo "Column smoke failed for ${table}.${column} (status ${status})" >&2
    cat "$response" >&2
    rm -f "$response"
    exit 1
  fi
  rm -f "$response"
  echo "OK: ${table}.${column}"
}

echo "==> Verifying company-scope columns (${mode})"
check_column clients company_id
check_column portal_users company_id
