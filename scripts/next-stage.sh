#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROADMAP_FILE="${ROADMAP_FILE:-$ROOT_DIR/docs/platform-1.0-roadmap.md}"
AFTER_PHASE=""
JSON_MODE="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --after)
      AFTER_PHASE="${2:-}"
      shift 2
      ;;
    --json)
      JSON_MODE="true"
      shift
      ;;
    *)
      echo "Usage: $0 [--after <phase>] [--json]" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$ROADMAP_FILE" ]]; then
  echo "[next-stage] roadmap file not found: $ROADMAP_FILE" >&2
  exit 1
fi

payload="$(python - "$ROADMAP_FILE" "$AFTER_PHASE" <<'PY'
import json,re,sys
path,after=sys.argv[1],sys.argv[2]
rows=[]
with open(path, encoding='utf-8') as f:
    for line in f:
        m=re.match(r"- \[( |x)\] Phase ([0-9]+\.[0-9]+) complete", line.strip())
        if m:
            rows.append({"phase":m.group(2),"done":m.group(1)=="x"})

if not rows:
    print(json.dumps({"next":"","note":"","reason":"empty"}))
    raise SystemExit

next_phase=""
if after:
    idx=next((i for i,r in enumerate(rows) if r["phase"]==after), -1)
    if idx >= 0:
        for r in rows[idx+1:]:
            if not r["done"]:
                next_phase=r["phase"]
                break
    if not next_phase:
        for r in rows:
            if not r["done"]:
                next_phase=r["phase"]
                break
else:
    last_done_idx=-1
    for i,r in enumerate(rows):
        if r["done"]:
            last_done_idx=i
    if last_done_idx >= 0:
        for r in rows[last_done_idx+1:]:
            if not r["done"]:
                next_phase=r["phase"]
                break
    if not next_phase:
        for r in rows:
            if not r["done"]:
                next_phase=r["phase"]
                break

notes={
  "2.2":"Collect 3-day live dashboard soak evidence and attach artifacts.",
  "3.1":"Wait for 7 consecutive daily RLS runs and attach workflow evidence.",
  "5.3":"Run full page-by-page UAT and production smoke checks before go-live.",
  "5.4":"Run launch-watch monitoring window and attach summary evidence.",
}
note=notes.get(next_phase,"Execute the subphase and record release evidence artifacts.") if next_phase else ""
print(json.dumps({"next":next_phase,"note":note,"reason":"ok"}))
PY
)"

if [[ "$JSON_MODE" == "true" ]]; then
  echo "$payload"
  exit 0
fi

next_stage="$(python - <<'PY' "$payload"
import json,sys
print(json.loads(sys.argv[1]).get('next',''))
PY
)"

note="$(python - <<'PY' "$payload"
import json,sys
print(json.loads(sys.argv[1]).get('note',''))
PY
)"

if [[ -z "$next_stage" ]]; then
  echo "[next-stage] All tracked phases are complete."
  exit 0
fi

echo "[next-stage] Next stage: Phase ${next_stage}"
echo "[next-stage] Action: ${note}"
