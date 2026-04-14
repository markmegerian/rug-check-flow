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
  value="$(printf "%s" "$value" | tr -d "\r\n")"
  printf -v "$name" "%s" "$value"
}

for var_name in SUPABASE_URL SUPABASE_ANON_KEY OFFICE_USER_EMAIL OFFICE_USER_PASSWORD SAMPLE_INVOICE_ID; do
  sanitize_env_var "$var_name"
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

office_access_token="$(jq -r '.access_token // empty' "$auth_response")"
rm -f "$auth_response"

if [[ -z "$office_access_token" ]]; then
  echo "Office auth response missing access_token" >&2
  exit 1
fi

invoice_url="${SUPABASE_URL}/rest/v1/invoices?select=id,invoice_number,client_id,status,pdf_storage_path,created_at"
if [[ -n "${SAMPLE_INVOICE_ID:-}" ]]; then
  invoice_url+="&id=eq.${SAMPLE_INVOICE_ID}"
else
  invoice_url+="&client_id=not.is.null&order=created_at.desc&limit=1"
fi

invoice_response="$(mktemp)"
invoice_status="$(curl -sS -o "$invoice_response" -w "%{http_code}" "$invoice_url" -H "apikey: ${SUPABASE_ANON_KEY}" -H "Authorization: Bearer ${office_access_token}")"

if [[ "$invoice_status" != "200" ]]; then
  echo "Invoice lookup failed with status ${invoice_status}" >&2
  cat "$invoice_response" >&2
  rm -f "$invoice_response"
  exit 1
fi

invoice_count="$(jq 'length' "$invoice_response")"
if [[ "$invoice_count" == "0" ]]; then
  echo "SKIP: no linked invoice available for authenticated smoke."
  rm -f "$invoice_response"
  exit 0
fi

invoice_id="$(jq -r '.[0].id // empty' "$invoice_response")"
invoice_number="$(jq -r '.[0].invoice_number // empty' "$invoice_response")"
client_id="$(jq -r '.[0].client_id // empty' "$invoice_response")"
pdf_storage_path="$(jq -r '.[0].pdf_storage_path // empty' "$invoice_response")"
rm -f "$invoice_response"

if [[ -z "$invoice_id" || -z "$client_id" ]]; then
  echo "Authenticated smoke requires an invoice with non-null client_id." >&2
  exit 1
fi

if [[ "$pdf_storage_path" == *"clients/unlinked/"* ]]; then
  echo "Selected invoice ${invoice_number} still points at an unlinked PDF path: ${pdf_storage_path}" >&2
  exit 1
fi

echo "==> Verifying authenticated invoice flow for ${invoice_number} (${invoice_id})"
pdf_response="$(mktemp)"
pdf_payload="$(jq -cn --arg invoice_id "$invoice_id" '{invoice_id:$invoice_id,force_regenerate:true}')"
pdf_status="$(curl -sS -o "$pdf_response" -w "%{http_code}" -X POST "${SUPABASE_URL}/functions/v1/invoice-pdf" -H "apikey: ${SUPABASE_ANON_KEY}" -H "Authorization: Bearer ${office_access_token}" -H "Content-Type: application/json" -d "$pdf_payload")"

if [[ "$pdf_status" != "200" ]]; then
  echo "invoice-pdf function failed with status ${pdf_status}" >&2
  cat "$pdf_response" >&2
  rm -f "$pdf_response"
  exit 1
fi

signed_url="$(jq -r '.signed_url // empty' "$pdf_response")"
artifact_path="$(jq -r '.path // empty' "$pdf_response")"
rm -f "$pdf_response"

if [[ -z "$signed_url" ]]; then
  echo "invoice-pdf response missing signed_url" >&2
  exit 1
fi

echo "OK: authenticated invoice smoke passed"
echo "invoice_number=${invoice_number}"
echo "invoice_id=${invoice_id}"
echo "client_id=${client_id}"
echo "path=${artifact_path}"
