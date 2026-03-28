#!/usr/bin/env bash
set -euo pipefail

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 1
  fi
}

require_env SUPABASE_URL
require_env SUPABASE_SERVICE_ROLE_KEY

BASE="${SUPABASE_URL}/rest/v1"
HEADERS=(
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}"
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
  -H 'Accept: application/json'
)

roles_json="$(mktemp)"
profiles_json="$(mktemp)"
trap 'rm -f "$roles_json" "$profiles_json"' EXIT

curl -sS -o "$roles_json" "${BASE}/user_roles?select=user_id,role&limit=1000" "${HEADERS[@]}"

candidate_json="$(node - "$roles_json" <<'NODE'
const fs = require('fs');
const roles = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const grouped = {};
for (const row of roles.filter((r) => ['admin', 'office', 'checkin_staff'].includes(r.role))) {
  grouped[row.user_id] ||= { user_id: row.user_id, roles: [] };
  grouped[row.user_id].roles.push(row.role);
}
const ids = Object.keys(grouped);
process.stdout.write(JSON.stringify({ ids, grouped }));
NODE
)"

ids_csv="$(node -e 'const data = JSON.parse(process.argv[1]); process.stdout.write(data.ids.join(","));' "$candidate_json")"

if [[ -z "$ids_csv" ]]; then
  echo "No admin/office/checkin_staff candidates found."
  exit 0
fi

curl -sS -o "$profiles_json" "${BASE}/profiles?select=user_id,full_name,email,business_name,business_email&user_id=in.(${ids_csv})" "${HEADERS[@]}"

node - "$candidate_json" "$profiles_json" <<'NODE'
const fs = require('fs');
const candidates = JSON.parse(process.argv[2]);
const profiles = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const profById = Object.fromEntries(profiles.map((p) => [p.user_id, p]));
const rows = candidates.ids.map((id) => ({
  user_id: id,
  roles: candidates.grouped[id].roles.sort(),
  full_name: profById[id]?.full_name ?? null,
  email: profById[id]?.email ?? null,
  business_name: profById[id]?.business_name ?? null,
  business_email: profById[id]?.business_email ?? null,
}));
console.log(JSON.stringify({ candidates: rows }, null, 2));
NODE
