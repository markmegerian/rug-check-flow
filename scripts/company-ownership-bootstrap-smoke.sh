#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_URL:?Missing SUPABASE_URL}"

if [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  api_key="$SUPABASE_SERVICE_ROLE_KEY"
  token="$SUPABASE_SERVICE_ROLE_KEY"
else
  : "${SUPABASE_ANON_KEY:?Missing SUPABASE_ANON_KEY}"
  : "${OFFICE_USER_EMAIL:?Missing OFFICE_USER_EMAIL}"
  : "${OFFICE_USER_PASSWORD:?Missing OFFICE_USER_PASSWORD}"

  auth_response="$(mktemp)"
  trap 'rm -f "$auth_response"' EXIT

  auth_payload="$(jq -cn --arg email "$OFFICE_USER_EMAIL" --arg password "$OFFICE_USER_PASSWORD" '{email:$email,password:$password}')"
  auth_status="$(curl -sS -o "$auth_response" -w "%{http_code}" -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" -H "apikey: ${SUPABASE_ANON_KEY}" -H 'Content-Type: application/json' -d "$auth_payload")"
  if [[ "$auth_status" != "200" ]]; then
    echo "Office login failed (${auth_status})" >&2
    cat "$auth_response" >&2
    exit 1
  fi

  token="$(jq -r '.access_token // empty' "$auth_response")"
  if [[ -z "$token" ]]; then
    echo "Office login did not return an access token" >&2
    cat "$auth_response" >&2
    exit 1
  fi

  api_key="$SUPABASE_ANON_KEY"
fi

base="${SUPABASE_URL}/rest/v1"
headers=(
  -H "apikey: ${api_key}"
  -H "Authorization: Bearer ${token}"
  -H 'Accept: application/json'
)

fetch_json() {
  local path="$1"
  local output="$2"
  local status
  status="$(curl -sS -o "$output" -w "%{http_code}" "${base}/${path}" "${headers[@]}")"
  if [[ "$status" != "200" ]]; then
    echo "Request failed for ${path} (${status})" >&2
    cat "$output" >&2
    exit 1
  fi
}

companies_json="$(mktemp)"
memberships_json="$(mktemp)"
clients_json="$(mktemp)"
cleanup() {
  rm -f "$companies_json" "$memberships_json" "$clients_json"
}
trap cleanup EXIT

fetch_json 'companies?select=id,name,slug,subscription_status,billing_status,plan_tier,created_at&order=created_at.asc&limit=5' "$companies_json"
fetch_json 'company_memberships?select=company_id,user_id,role,created_at&order=created_at.asc&limit=50' "$memberships_json"
fetch_json 'clients?select=id,company_id&company_id=not.is.null&limit=1' "$clients_json"

node - "$companies_json" "$memberships_json" "$clients_json" <<'NODE'
const fs = require('fs');
const companies = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const memberships = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const linkedClients = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));

if (!Array.isArray(companies) || companies.length === 0) {
  console.error('FAIL: no companies rows found');
  process.exit(1);
}
if (!Array.isArray(memberships) || memberships.length === 0) {
  console.error('FAIL: no company_memberships rows found');
  process.exit(1);
}
if (!Array.isArray(linkedClients) || linkedClients.length === 0) {
  console.error('FAIL: no clients with non-null company_id found');
  process.exit(1);
}

const companyIds = new Set(companies.map((c) => c.id));
const badMembership = memberships.find((m) => !companyIds.has(m.company_id));
if (badMembership) {
  console.error('FAIL: membership references company not returned by companies query:', badMembership);
  process.exit(1);
}

const adminLikeMembership = memberships.find((m) => m.role === 'company_admin');
if (!adminLikeMembership) {
  console.error('FAIL: no company_admin membership found');
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  companies: companies.length,
  memberships: memberships.length,
  linkedClientsSampleCount: linkedClients.length,
  sampleCompany: companies[0],
  sampleAdminMembership: adminLikeMembership,
}, null, 2));
NODE
