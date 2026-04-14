#!/usr/bin/env bash
set -euo pipefail

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

json_get() {
  local file="$1"
  local expr="$2"
  python - "$file" "$expr" <<'PY'
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as fh:
    payload = json.load(fh)
expr = sys.argv[2]
if expr == 'access_token':
    print(payload.get('access_token', ''))
elif expr == 'user_id':
    print(payload.get('user', {}).get('id', ''))
PY
}

json_payload_file() {
  local output_file="$1"
  local key1="$2"
  local value1="$3"
  local key2="$4"
  local value2="$5"
  python - "$output_file" "$key1" "$value1" "$key2" "$value2" <<'PY'
import json,sys
with open(sys.argv[1], 'w', encoding='utf-8') as fh:
    json.dump({sys.argv[2]: sys.argv[3], sys.argv[4]: sys.argv[5]}, fh)
PY
}

json_payload_single() {
  local key="$1"
  local value="$2"
  python - "$key" "$value" <<'PY'
import json,sys
print(json.dumps({sys.argv[1]: sys.argv[2]}))
PY
}


http_check() {
  local label="$1"
  local url="$2"
  local method="${3:-GET}"
  local data="${4:-}"
  local auth_header="${5:-}"

  local out_file
  out_file="$(mktemp)"

  local -a curl_args
  curl_args=(
    -sS -o "$out_file" -w '%{http_code}'
    -X "$method"
    "$url"
    -H "apikey: ${SUPABASE_ANON_KEY}"
  )
  if [[ -n "$auth_header" ]]; then
    curl_args+=( -H "$auth_header" )
  fi
  if [[ -n "$data" ]]; then
    curl_args+=( -H "Content-Type: application/json" -d "$data" )
  fi

  local status
  status="$(curl "${curl_args[@]}")"

  local ok="false"
  if [[ "$status" =~ ^2 ]]; then
    ok="true"
  fi

  echo "{\"label\":\"${label}\",\"url\":\"${url}\",\"status\":${status},\"ok\":${ok},\"body\":$(python - <<'PY' "$out_file"
import json,sys
text=open(sys.argv[1],encoding='utf-8').read()
print(json.dumps(text[:500]))
PY
)}"
  rm -f "$out_file"
}

require_envs "Synthetic probe" SUPABASE_URL SUPABASE_ANON_KEY OFFICE_USER_EMAIL OFFICE_USER_PASSWORD

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

for var_name in SUPABASE_URL SUPABASE_ANON_KEY OFFICE_USER_EMAIL OFFICE_USER_PASSWORD SAMPLE_INVOICE_ID APP_BASE_URL; do
  sanitize_env_var "$var_name"
done

report_dir="${PROBE_REPORT_DIR:-artifacts}"
mkdir -p "$report_dir"
report_file="${report_dir}/synthetic-probe-report.json"

# Authenticate office user
login_file="$(mktemp)"
login_payload_file="$(mktemp)"
json_payload_file "$login_payload_file" "email" "$OFFICE_USER_EMAIL" "password" "$OFFICE_USER_PASSWORD"
login_status="$(curl -sS -o "$login_file" -w '%{http_code}' -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" -H "apikey: ${SUPABASE_ANON_KEY}" -H "Content-Type: application/json" --data-binary "@${login_payload_file}")"
rm -f "$login_payload_file"
if [[ "$login_status" != "200" ]]; then
  echo "Office authentication failed with status ${login_status}" >&2
  cat "$login_file" >&2
  rm -f "$login_file"
  exit 1
fi
office_token="$(json_get "$login_file" access_token)"
rm -f "$login_file"
if [[ -z "$office_token" ]]; then
  echo "Could not parse office access token" >&2
  exit 1
fi

if [[ -z "${SAMPLE_INVOICE_ID:-}" ]]; then
  SAMPLE_INVOICE_ID="$(./scripts/get-sample-invoice-id.sh || true)"
fi

results_file="$(mktemp)"
{
  http_check "rest.pickup_requests" "${SUPABASE_URL}/rest/v1/pickup_requests?select=id&limit=1" "GET" "" "Authorization: Bearer ${office_token}"
  http_check "rest.estimates" "${SUPABASE_URL}/rest/v1/estimates?select=id&limit=1" "GET" "" "Authorization: Bearer ${office_token}"
  http_check "rest.invoices" "${SUPABASE_URL}/rest/v1/invoices?select=id&limit=1" "GET" "" "Authorization: Bearer ${office_token}"
  if [[ -n "${SAMPLE_INVOICE_ID:-}" ]]; then
    http_check "fn.invoice-pdf" "${SUPABASE_URL}/functions/v1/invoice-pdf" "POST" "$(json_payload_single "invoice_id" "$SAMPLE_INVOICE_ID")" "Authorization: Bearer ${office_token}"
  else
    echo '{"label":"fn.invoice-pdf","url":"skipped:no-sample-invoice","status":204,"ok":true,"body":"skipped because no sample invoice exists"}'
  fi
  http_check "fn.operational-alerts" "${SUPABASE_URL}/functions/v1/operational-alerts" "POST" '{"dry_run":true}' "Authorization: Bearer ${office_token}"
} > "$results_file"

if [[ -n "${APP_BASE_URL:-}" ]]; then
  for route in / /auth /facility /portal /driver; do
    http_check "app.route${route}" "${APP_BASE_URL%/}${route}" >> "$results_file"
  done
fi

python - "$results_file" "$report_file" <<'PY'
import json,sys,datetime
rows=[json.loads(line) for line in open(sys.argv[1],encoding='utf-8') if line.strip()]
summary={
  'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z'),
  'total': len(rows),
  'passed': sum(1 for r in rows if r.get('ok')),
  'failed': sum(1 for r in rows if not r.get('ok')),
  'checks': rows,
}
with open(sys.argv[2],'w',encoding='utf-8') as fh:
  json.dump(summary,fh,indent=2)
print(json.dumps(summary,indent=2))
if summary['failed']:
  raise SystemExit(1)
PY

rm -f "$results_file"
echo "Synthetic probe completed. Report: ${report_file}"
