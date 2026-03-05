#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WATCH_MINUTES="${WATCH_MINUTES:-60}"
PROBE_INTERVAL_SECONDS="${PROBE_INTERVAL_SECONDS:-300}"
WATCH_REPORT_DIR="${WATCH_REPORT_DIR:-artifacts/launch-watch}"

require_env() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    echo "Phase 5.4 launch watch requires env: ${key}" >&2
    exit 1
  fi
}

log() {
  printf '[phase5.4][%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

require_env SUPABASE_URL
require_env SUPABASE_ANON_KEY
require_env OFFICE_USER_EMAIL
require_env OFFICE_USER_PASSWORD

mkdir -p "$WATCH_REPORT_DIR"
summary_file="${WATCH_REPORT_DIR}/launch-watch-summary-$(date -u +'%Y%m%dT%H%M%SZ').json"
probe_dir="${WATCH_REPORT_DIR}/probes"
mkdir -p "$probe_dir"

start_epoch="$(date +%s)"
end_epoch="$((start_epoch + WATCH_MINUTES * 60))"
index=0
failed=0

log "Launch watch started for ${WATCH_MINUTES} minutes; probe interval ${PROBE_INTERVAL_SECONDS}s"

records_file="$(mktemp)"
while [[ "$(date +%s)" -lt "$end_epoch" ]]; do
  index="$((index + 1))"
  probe_report="${probe_dir}/probe-${index}.json"
  log "Probe ${index}: START"

  if PROBE_REPORT_DIR="$probe_dir" ./scripts/synthetic-probe.sh > /tmp/phase5_4_probe_out.txt 2>&1; then
    latest_report="${probe_dir}/synthetic-probe-report.json"
    if [[ -f "$latest_report" ]]; then
      cp "$latest_report" "$probe_report"
    fi
    echo "{\"probe\":${index},\"status\":\"pass\",\"timestamp\":\"$(date -u +'%Y-%m-%dT%H:%M:%SZ')\"}" >> "$records_file"
    log "Probe ${index}: PASS"
  else
    failed="$((failed + 1))"
    latest_report="${probe_dir}/synthetic-probe-report.json"
    if [[ -f "$latest_report" ]]; then
      cp "$latest_report" "$probe_report"
    fi
    cp /tmp/phase5_4_probe_out.txt "${probe_dir}/probe-${index}.log" || true
    echo "{\"probe\":${index},\"status\":\"fail\",\"timestamp\":\"$(date -u +'%Y-%m-%dT%H:%M:%SZ')\"}" >> "$records_file"
    log "Probe ${index}: FAIL"
  fi

  if [[ "$(date +%s)" -ge "$end_epoch" ]]; then
    break
  fi
  sleep "$PROBE_INTERVAL_SECONDS"
done

python - "$records_file" "$summary_file" "$WATCH_MINUTES" "$PROBE_INTERVAL_SECONDS" <<'PY'
import json, sys
rows=[json.loads(line) for line in open(sys.argv[1],encoding='utf-8') if line.strip()]
summary={
  "watch_minutes": int(sys.argv[3]),
  "probe_interval_seconds": int(sys.argv[4]),
  "total_probes": len(rows),
  "passed_probes": sum(1 for r in rows if r.get("status") == "pass"),
  "failed_probes": sum(1 for r in rows if r.get("status") == "fail"),
  "records": rows,
}
with open(sys.argv[2],"w",encoding="utf-8") as fh:
  json.dump(summary, fh, indent=2)
print(json.dumps(summary, indent=2))
if summary["failed_probes"] > 0:
  raise SystemExit(1)
PY

rm -f "$records_file" /tmp/phase5_4_probe_out.txt
log "Launch watch finished. Summary: ${summary_file}"

if [[ -x "./scripts/next-stage.sh" ]]; then
  ./scripts/next-stage.sh --after 5.4
fi
