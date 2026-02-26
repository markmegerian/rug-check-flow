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

ts() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

require_envs "Game day drill" SUPABASE_URL SUPABASE_ANON_KEY OFFICE_USER_EMAIL OFFICE_USER_PASSWORD

mkdir -p artifacts docs/game-day-reports

start_epoch=$(date +%s)
start_ts=$(ts)

# Scenario: synthetic route probe outage via intentionally invalid APP_BASE_URL.
export APP_BASE_URL="https://invalid-game-day-host.example.invalid"
set +e
./scripts/synthetic-probe.sh > artifacts/game-day-failure.log 2>&1
failure_status=$?
set -e

detect_epoch=$(date +%s)
detect_ts=$(ts)

if [[ "$failure_status" -eq 0 ]]; then
  echo "Expected failure drill did not fail; cannot produce valid game-day report." >&2
  exit 1
fi

# Mitigation: remove failing route probe target and re-run probes.
unset APP_BASE_URL
./scripts/synthetic-probe.sh > artifacts/game-day-recovery.log 2>&1

mitigate_epoch=$(date +%s)
mitigate_ts=$(ts)

detection_seconds=$((detect_epoch - start_epoch))
mitigation_seconds=$((mitigate_epoch - detect_epoch))

report_date=$(date -u +"%Y-%m-%d")
report_path="docs/game-day-reports/${report_date}-synthetic-route-outage.md"

cat > "$report_path" <<REPORT
# Game Day Report — Synthetic Route Probe Outage

- Date: ${report_date}
- Scenario: Route-probe outage simulation using invalid APP_BASE_URL host
- Start time (UTC): ${start_ts}
- Detection time (UTC): ${detect_ts}
- Mitigation time (UTC): ${mitigate_ts}
- Detection latency: ${detection_seconds}s
- Mitigation latency: ${mitigation_seconds}s

## What happened
1. Triggered synthetic probe run with intentionally invalid APP_BASE_URL.
2. Probe run failed as expected with route probe DNS failures.
3. Removed faulty APP_BASE_URL and re-ran probes.
4. Recovery probe passed successfully.

## Evidence artifacts
- Failure log: artifacts/game-day-failure.log
- Recovery log: artifacts/game-day-recovery.log

## Follow-up actions
- Keep APP_BASE_URL optional for synthetic probes and scope it to validated hostnames in CI secrets.
- Alert routing: ensure scheduled synthetic workflow failure notifications are subscribed by on-call owners.
- Add this report to release evidence package for reliability track.
REPORT

echo "Game day drill completed. Report: ${report_path}"
