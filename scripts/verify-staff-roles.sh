#!/usr/bin/env bash
set -euo pipefail

required_vars=(
  SUPABASE_URL
  SUPABASE_ANON_KEY
  OFFICE_USER_EMAIL
  OFFICE_USER_PASSWORD
  CHECKIN_USER_EMAIL
  CHECKIN_USER_PASSWORD
  DRIVER_USER_EMAIL
  DRIVER_USER_PASSWORD
)
for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required environment variable: ${var_name}" >&2
    exit 1
  fi
done

office_expected_role="${OFFICE_EXPECTED_ROLE:-office}"
checkin_expected_role="${CHECKIN_EXPECTED_ROLE:-checkin_staff}"
driver_expected_role="${DRIVER_EXPECTED_ROLE:-driver}"

users=(
  "${OFFICE_USER_EMAIL}:${OFFICE_USER_PASSWORD}:${office_expected_role}"
  "${CHECKIN_USER_EMAIL}:${CHECKIN_USER_PASSWORD}:${checkin_expected_role}"
  "${DRIVER_USER_EMAIL}:${DRIVER_USER_PASSWORD}:${driver_expected_role}"
)

for spec in "${users[@]}"; do
  IFS=':' read -r email password expected_role <<<"$spec"

  response_file="$(mktemp)"
  status="$(
    curl -sS -o "$response_file" -w "%{http_code}" \
      -X POST \
      "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Content-Type: application/json" \
      -d "$(printf '{\"email\":\"%s\",\"password\":\"%s\"}' "$email" "$password")"
  )"

  if [[ "$status" != "200" ]]; then
    echo "Auth failed for ${email} with status ${status}" >&2
    cat "$response_file" >&2
    rm -f "$response_file"
    exit 1
  fi

  auth_payload="$(cat "$response_file")"
  rm -f "$response_file"

  auth_file="$(mktemp)"
  printf '%s' "$auth_payload" > "$auth_file"
  read -r user_id access_token < <(
    python - "$auth_file" <<'PY'
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as fh:
    payload = json.load(fh)
user = payload.get('user') or {}
print(user.get('id',''), payload.get('access_token',''))
PY
  )
  rm -f "$auth_file"

  if [[ -z "$user_id" || -z "$access_token" ]]; then
    echo "Auth response missing user id or access token for ${email}" >&2
    exit 1
  fi

  roles_file="$(mktemp)"
  roles_status="$(
    curl -sS -o "$roles_file" -w "%{http_code}" \
      "${SUPABASE_URL}/rest/v1/user_roles?select=role&user_id=eq.${user_id}" \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Authorization: Bearer ${access_token}"
  )"

  if [[ "$roles_status" != "200" ]]; then
    echo "Role lookup failed for ${email} with status ${roles_status}" >&2
    cat "$roles_file" >&2
    rm -f "$roles_file"
    exit 1
  fi

  actual_role="$(python - <<'PY' "$roles_file"
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as fh:
    rows = json.load(fh)
print((rows[0].get('role') if rows else ''))
PY
)"
  rm -f "$roles_file"

  if [[ "$actual_role" != "$expected_role" ]]; then
    echo "Role mismatch for ${email}: expected ${expected_role}, got ${actual_role:-<none>}" >&2
    exit 1
  fi

  echo "OK: ${email} has role ${actual_role}"
done
