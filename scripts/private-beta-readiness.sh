#!/usr/bin/env bash
set -euo pipefail

get_access_token() {
  local email="$1"
  local password="$2"
  local response_file
  response_file="$(mktemp)"
  local status
  status="$(
    curl -sS -o "$response_file" -w "%{http_code}" \
      -X POST \
      "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Content-Type: application/json" \
      -d "$(printf '{"email":"%s","password":"%s"}' "$email" "$password")"
  )"

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

echo "==> Private beta readiness checks"
echo "Step 1/5: Lint, test, and build"
npm run lint
npm run test
npm run build

echo "Step 2/5: Staging smoke"
if [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_ANON_KEY:-}" && -n "${SMOKE_USER_EMAIL:-}" && -n "${SMOKE_USER_PASSWORD:-}" ]]; then
  ./scripts/staging-smoke-test.sh
else
  echo "Skipping staging smoke (set SUPABASE_URL, SUPABASE_ANON_KEY, SMOKE_USER_EMAIL, SMOKE_USER_PASSWORD)."
fi

echo "Step 3/5: Role-scoped RLS smoke"
if [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_ANON_KEY:-}" && -n "${PORTAL_USER_EMAIL:-}" && -n "${PORTAL_USER_PASSWORD:-}" && -n "${OFFICE_USER_EMAIL:-}" && -n "${OFFICE_USER_PASSWORD:-}" && -n "${DRIVER_USER_EMAIL:-}" && -n "${DRIVER_USER_PASSWORD:-}" ]]; then
  ./scripts/rls-scope-smoke-test.sh
else
  echo "Skipping RLS smoke (set portal/office/driver auth env vars)."
fi

office_access_token=""
if [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_ANON_KEY:-}" && -n "${OFFICE_USER_EMAIL:-}" && -n "${OFFICE_USER_PASSWORD:-}" ]]; then
  office_access_token="$(get_access_token "$OFFICE_USER_EMAIL" "$OFFICE_USER_PASSWORD")"
fi

echo "Step 4/5: Invoice PDF edge-function smoke"
if [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_ANON_KEY:-}" && -n "${OFFICE_USER_EMAIL:-}" && -n "${OFFICE_USER_PASSWORD:-}" && -n "${SAMPLE_INVOICE_ID:-}" ]]; then
  invoice_pdf_response="$(mktemp)"
  invoice_pdf_status="$(
    curl -sS -o "$invoice_pdf_response" -w "%{http_code}" \
      -X POST \
      "${SUPABASE_URL}/functions/v1/invoice-pdf" \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Authorization: Bearer ${office_access_token}" \
      -H "Content-Type: application/json" \
      -d "$(printf '{"invoice_id":"%s"}' "$SAMPLE_INVOICE_ID")"
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
else
  echo "Skipping invoice-pdf smoke (set SUPABASE_URL, SUPABASE_ANON_KEY, OFFICE_USER_EMAIL, OFFICE_USER_PASSWORD, SAMPLE_INVOICE_ID)."
fi

echo "Step 5/5: Operational alert dry-run"
if [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_ANON_KEY:-}" && -n "${office_access_token:-}" ]]; then
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
else
  echo "Skipping operational-alerts dry-run (set SUPABASE_URL, SUPABASE_ANON_KEY, OFFICE_USER_EMAIL, OFFICE_USER_PASSWORD)."
fi

echo "Private beta readiness checks completed."
