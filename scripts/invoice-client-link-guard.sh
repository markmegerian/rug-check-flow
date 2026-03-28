#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_URL:?Missing SUPABASE_URL}"

if [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  api_key="$SUPABASE_SERVICE_ROLE_KEY"
  token="$SUPABASE_SERVICE_ROLE_KEY"
  mode="service-role"
else
  : "${SUPABASE_ANON_KEY:?Missing SUPABASE_ANON_KEY}"
  if [[ -z "${OFFICE_ACCESS_TOKEN:-}" ]]; then
    : "${OFFICE_USER_EMAIL:?Missing OFFICE_USER_EMAIL}"
    : "${OFFICE_USER_PASSWORD:?Missing OFFICE_USER_PASSWORD}"
    auth_file="$(mktemp)"
    status="$({
      curl -sS -o "$auth_file" -w "%{http_code}" -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
        -H "apikey: ${SUPABASE_ANON_KEY}" -H "Content-Type: application/json" \
        -d "$(jq -cn --arg email "$OFFICE_USER_EMAIL" --arg password "$OFFICE_USER_PASSWORD" "{email:\$email,password:\$password}")"
    })"
    [[ "$status" == "200" ]] || { echo "Office auth failed: $status" >&2; cat "$auth_file" >&2; exit 1; }
    OFFICE_ACCESS_TOKEN="$(jq -r ".access_token // empty" "$auth_file")"
    rm -f "$auth_file"
  fi
  api_key="$SUPABASE_ANON_KEY"
  token="$OFFICE_ACCESS_TOKEN"
  mode="office"
fi

echo "==> Verifying invoice client-link guard ($mode)"
invoice_number="AUDIT-GUARD-$(date +%s)-$RANDOM"
payload="$(jq -cn --arg invoice_number "$invoice_number" "{invoice_number:\$invoice_number,client_id:null,status:\"draft\",total:0}")"
resp="$(mktemp)"
status="$({
  curl -sS -o "$resp" -w "%{http_code}" -X POST "${SUPABASE_URL}/rest/v1/invoices" \
    -H "apikey: ${api_key}" -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" -H "Prefer: return=representation" -d "$payload"
})"
if [[ "$status" == "201" ]]; then
  created_id="$(jq -r ".id // .[0].id // empty" "$resp")"
  [[ -z "$created_id" ]] || curl -sS -o /dev/null -X DELETE "${SUPABASE_URL}/rest/v1/invoices?id=eq.${created_id}" -H "apikey: ${api_key}" -H "Authorization: Bearer ${token}"
  echo "Guard failed: invoice insert unexpectedly succeeded for ${invoice_number}" >&2
  cat "$resp" >&2
  exit 1
fi
[[ "$status" == "400" ]] || { echo "Unexpected status: $status" >&2; cat "$resp" >&2; exit 1; }
code="$(jq -r ".code // empty" "$resp")"
msg="$(jq -r ".message // empty" "$resp")"
rm -f "$resp"
[[ "$code" == "23514" || "$msg" == *client_id* ]] || { echo "Unexpected guard failure: code=$code msg=$msg" >&2; exit 1; }
check="$(mktemp)"
status="$({
  curl -sS -o "$check" -w "%{http_code}" "${SUPABASE_URL}/rest/v1/invoices?select=id&invoice_number=eq.${invoice_number}" \
    -H "apikey: ${api_key}" -H "Authorization: Bearer ${token}"
})"
[[ "$status" == "200" ]] || { echo "Failed cleanup verification: $status" >&2; cat "$check" >&2; exit 1; }
count="$(jq "length" "$check")"
rm -f "$check"
[[ "$count" == "0" ]] || { echo "Guard probe left behind $count invoice row(s)" >&2; exit 1; }
echo "OK: invoice guard rejected unlinked invoice and no row was created"
