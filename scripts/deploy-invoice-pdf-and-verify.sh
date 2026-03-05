#!/usr/bin/env bash
set -euo pipefail

required_vars=(SUPABASE_ACCESS_TOKEN SUPABASE_URL SUPABASE_ANON_KEY OFFICE_USER_EMAIL OFFICE_USER_PASSWORD)
for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required environment variable: ${var_name}" >&2
    exit 1
  fi
done

sanitize_env_var() {
  local name="$1"
  if [[ -z "${!name+x}" ]]; then
    return
  fi
  local value
  value="${!name}"
  value="$(python3 - "$value" <<'PY'
import sys
print(sys.argv[1].strip("\r\n"))
PY
)"
  printf -v "$name" '%s' "$value"
}

for var_name in SUPABASE_ACCESS_TOKEN SUPABASE_URL SUPABASE_ANON_KEY OFFICE_USER_EMAIL OFFICE_USER_PASSWORD SAMPLE_INVOICE_ID SUPABASE_PROJECT_REF; do
  sanitize_env_var "$var_name"
done

json_payload_file() {
  local output_file="$1"
  local key1="$2"
  local value1="$3"
  local key2="${4:-}"
  local value2="${5:-}"
  python3 - "$output_file" "$key1" "$value1" "$key2" "$value2" <<'PY'
import json, sys
payload = {sys.argv[2]: sys.argv[3]}
if len(sys.argv) >= 6 and sys.argv[4]:
    payload[sys.argv[4]] = sys.argv[5]
with open(sys.argv[1], 'w', encoding='utf-8') as fh:
    json.dump(payload, fh)
PY
}

project_ref="${SUPABASE_PROJECT_REF:-}"
if [[ -z "$project_ref" ]]; then
  project_ref="$(python3 - <<'PY'
import os
from urllib.parse import urlparse
host = urlparse(os.environ['SUPABASE_URL']).hostname or ''
print(host.split('.')[0] if host else '')
PY
)"
fi

if [[ -z "$project_ref" ]]; then
  echo "Could not derive SUPABASE_PROJECT_REF from SUPABASE_URL" >&2
  exit 1
fi

export SUPABASE_PROJECT_REF="$project_ref"

echo "==> Deploying invoice-pdf function to project ${SUPABASE_PROJECT_REF}"
npx -y supabase functions deploy invoice-pdf --project-ref "$SUPABASE_PROJECT_REF"

echo "==> Verifying invoice-pdf endpoint"
invoice_id="${SAMPLE_INVOICE_ID:-}"
if [[ -z "$invoice_id" ]]; then
  invoice_id="$(./scripts/get-sample-invoice-id.sh)"
fi

auth_response="$(mktemp)"
login_payload_file="$(mktemp)"
json_payload_file "$login_payload_file" "email" "$OFFICE_USER_EMAIL" "password" "$OFFICE_USER_PASSWORD"
status="$(curl -sS -o "$auth_response" -w '%{http_code}' \
  -X POST \
  "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  --data-binary "@${login_payload_file}")"
rm -f "$login_payload_file"

if [[ "$status" != "200" ]]; then
  echo "Office auth failed with status ${status}" >&2
  cat "$auth_response" >&2
  rm -f "$auth_response"
  exit 1
fi

office_access_token="$(python3 - "$auth_response" <<'PY'
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as fh:
    payload = json.load(fh)
print(payload.get('access_token', ''))
PY
)"
rm -f "$auth_response"

if [[ -z "$office_access_token" ]]; then
  echo "Auth response missing access_token" >&2
  exit 1
fi

response_file="$(mktemp)"
invoice_payload_file="$(mktemp)"
json_payload_file "$invoice_payload_file" "invoice_id" "$invoice_id"
invoke_status="$(curl -sS -o "$response_file" -w '%{http_code}' \
  -X POST \
  "${SUPABASE_URL}/functions/v1/invoice-pdf" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${office_access_token}" \
  -H "Content-Type: application/json" \
  --data-binary "@${invoice_payload_file}")"
rm -f "$invoice_payload_file"

cat "$response_file"
echo

if [[ "$invoke_status" != "200" ]]; then
  echo "invoice-pdf verification failed with status ${invoke_status}" >&2
  rm -f "$response_file"
  exit 1
fi

rm -f "$response_file"

echo "invoice-pdf deploy + verification completed successfully."
