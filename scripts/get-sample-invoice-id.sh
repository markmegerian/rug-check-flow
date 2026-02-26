#!/usr/bin/env bash
set -euo pipefail

required_vars=(SUPABASE_URL SUPABASE_ANON_KEY OFFICE_USER_EMAIL OFFICE_USER_PASSWORD)
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
  value="$(python - "$value" <<'PY'
import sys
print(sys.argv[1].strip("\r\n"))
PY
)"
  printf -v "$name" '%s' "$value"
}

for var_name in SUPABASE_URL SUPABASE_ANON_KEY OFFICE_USER_EMAIL OFFICE_USER_PASSWORD; do
  sanitize_env_var "$var_name"
done

json_payload_file() {
  local output_file="$1"
  local key1="$2"
  local value1="$3"
  local key2="$4"
  local value2="$5"
  python - "$output_file" "$key1" "$value1" "$key2" "$value2" <<'PY'
import json, sys
with open(sys.argv[1], 'w', encoding='utf-8') as fh:
    json.dump({sys.argv[2]: sys.argv[3], sys.argv[4]: sys.argv[5]}, fh)
PY
}

response_file="$(mktemp)"
login_payload_file="$(mktemp)"
json_payload_file "$login_payload_file" "email" "$OFFICE_USER_EMAIL" "password" "$OFFICE_USER_PASSWORD"
status="$(
  curl -sS -o "$response_file" -w "%{http_code}" \
    -X POST \
    "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Content-Type: application/json" \
    --data-binary "@${login_payload_file}"
)"
rm -f "$login_payload_file"

if [[ "$status" != "200" ]]; then
  echo "Office auth failed with status ${status}" >&2
  cat "$response_file" >&2
  rm -f "$response_file"
  exit 1
fi

office_access_token="$(
  python - "$response_file" <<'PY'
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as fh:
    payload = json.load(fh)
print(payload.get('access_token', ''))
PY
)"
rm -f "$response_file"

if [[ -z "$office_access_token" ]]; then
  echo "Office auth response missing access_token" >&2
  exit 1
fi

invoice_file="$(mktemp)"
invoice_status="$(
  curl -sS -o "$invoice_file" -w "%{http_code}" \
    "${SUPABASE_URL}/rest/v1/invoices?select=id,created_at&order=created_at.desc&limit=1" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${office_access_token}"
)"

if [[ "$invoice_status" != "200" ]]; then
  echo "Invoice lookup failed with status ${invoice_status}" >&2
  cat "$invoice_file" >&2
  rm -f "$invoice_file"
  exit 1
fi

sample_invoice_id="$(
  python - "$invoice_file" <<'PY'
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as fh:
    rows = json.load(fh)
if not rows:
    raise SystemExit('No invoices available for the office user; create one first.')
print(rows[0].get('id', ''))
PY
)"
rm -f "$invoice_file"

if [[ -z "$sample_invoice_id" ]]; then
  echo "Latest invoice row did not include an id" >&2
  exit 1
fi

printf '%s\n' "$sample_invoice_id"
