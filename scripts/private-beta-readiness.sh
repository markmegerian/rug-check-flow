#!/usr/bin/env bash
set -euo pipefail

echo "==> Private beta readiness checks"
echo "Step 1/4: Lint, test, and build"
npm run lint
npm run test
npm run build

echo "Step 2/4: Staging smoke"
if [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_ANON_KEY:-}" && -n "${SMOKE_USER_EMAIL:-}" && -n "${SMOKE_USER_PASSWORD:-}" ]]; then
  ./scripts/staging-smoke-test.sh
else
  echo "Skipping staging smoke (set SUPABASE_URL, SUPABASE_ANON_KEY, SMOKE_USER_EMAIL, SMOKE_USER_PASSWORD)."
fi

echo "Step 3/4: Role-scoped RLS smoke"
if [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_ANON_KEY:-}" && -n "${PORTAL_USER_EMAIL:-}" && -n "${PORTAL_USER_PASSWORD:-}" && -n "${OFFICE_USER_EMAIL:-}" && -n "${OFFICE_USER_PASSWORD:-}" && -n "${DRIVER_USER_EMAIL:-}" && -n "${DRIVER_USER_PASSWORD:-}" ]]; then
  ./scripts/rls-scope-smoke-test.sh
else
  echo "Skipping RLS smoke (set portal/office/driver auth env vars)."
fi

echo "Step 4/4: Invoice PDF edge-function smoke"
if [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_ANON_KEY:-}" && -n "${OFFICE_USER_EMAIL:-}" && -n "${OFFICE_USER_PASSWORD:-}" && -n "${SAMPLE_INVOICE_ID:-}" ]]; then
  auth_response_file="$(mktemp)"
  auth_status="$(
    curl -sS -o "$auth_response_file" -w "%{http_code}" \
      -X POST \
      "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Content-Type: application/json" \
      -d "$(printf '{"email":"%s","password":"%s"}' "$OFFICE_USER_EMAIL" "$OFFICE_USER_PASSWORD")"
  )"

  if [[ "$auth_status" != "200" ]]; then
    echo "Office auth failed with status ${auth_status}" >&2
    cat "$auth_response_file" >&2
    rm -f "$auth_response_file"
    exit 1
  fi

  office_access_token="$(
    python - "$auth_response_file" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    payload = json.load(fh)
print(payload.get("access_token", ""))
PY
  )"
  rm -f "$auth_response_file"

  if [[ -z "$office_access_token" ]]; then
    echo "Office auth response did not include access_token." >&2
    exit 1
  fi

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

echo "Private beta readiness checks completed."
