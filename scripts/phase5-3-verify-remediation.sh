#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

check_pattern() {
  local label="$1"
  local file="$2"
  local pattern="$3"
  if rg -n --fixed-strings "$pattern" "$file" >/dev/null; then
    echo "[PASS] $label"
  else
    echo "[FAIL] $label (missing pattern: $pattern in $file)" >&2
    return 1
  fi
}

failures=0

check_pattern "P53-001 driver sign out action" "src/pages/DriverPortal.tsx" "Sign Out" || failures=$((failures+1))
check_pattern "P53-001 driver signOut wiring" "src/pages/DriverPortal.tsx" "const { user, signOut } = useAuth();" || failures=$((failures+1))

check_pattern "P53-002 portal password gate UI" "src/pages/WholesalePortal.tsx" "Change your password to continue" || failures=$((failures+1))
check_pattern "P53-002 portal password update call" "src/pages/WholesalePortal.tsx" "supabase.auth.updateUser({ password: newPassword })" || failures=$((failures+1))

check_pattern "P53-003 checked_in_at persisted" "src/components/facility/CheckInLayout.tsx" "checked_in_at: intakeDate" || failures=$((failures+1))
check_pattern "P53-003 pickup item linking error surfaced" "src/components/facility/CheckInLayout.tsx" "Pickup item linking failed" || failures=$((failures+1))

check_pattern "P53-004 upload type guard" "src/components/facility/CheckInForm.tsx" "Unsupported file type" || failures=$((failures+1))
check_pattern "P53-004 upload allowlist" "src/components/facility/CheckInForm.tsx" "accept=\".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp\"" || failures=$((failures+1))

check_pattern "P53-005 clearer schedule CTA" "src/components/portal/PortalPickupsTab.tsx" "Schedule Next Route Pickup" || failures=$((failures+1))
check_pattern "P53-005 update pending CTA" "src/components/portal/PortalPickupsTab.tsx" "Update Scheduled Pickup" || failures=$((failures+1))

if (( failures > 0 )); then
  echo "[phase5.3-verify] $failures remediation checks failed." >&2
  exit 1
fi

echo "[phase5.3-verify] All implemented remediation checks passed."
