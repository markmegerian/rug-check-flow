#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

EVIDENCE_FILE="${PHASE53_EVIDENCE_FILE:-docs/release-evidence/phase5-3-uat-execution.md}"
ROADMAP_FILE="${PHASE53_ROADMAP_FILE:-docs/platform-1.0-roadmap.md}"

if [[ ! -f "$EVIDENCE_FILE" ]]; then
  echo "[phase5.3-close] evidence file not found: $EVIDENCE_FILE" >&2
  exit 1
fi

if [[ ! -f "$ROADMAP_FILE" ]]; then
  echo "[phase5.3-close] roadmap file not found: $ROADMAP_FILE" >&2
  exit 1
fi

if rg -n "^- \[ \]" "$EVIDENCE_FILE" >/dev/null; then
  echo "[phase5.3-close] evidence still has unchecked boxes in $EVIDENCE_FILE" >&2
  rg -n "^- \[ \]" "$EVIDENCE_FILE" >&2
  exit 1
fi

if ! rg -n "Final decision:\s*GO" "$EVIDENCE_FILE" >/dev/null; then
  echo "[phase5.3-close] missing 'Final decision: GO' in $EVIDENCE_FILE" >&2
  exit 1
fi

python - "$ROADMAP_FILE" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
s=p.read_text()
old='- [ ] Phase 5.3 complete'
new='- [x] Phase 5.3 complete'
if old not in s and new not in s:
    raise SystemExit('phase 5.3 tracker entry not found')
if old in s:
    s=s.replace(old,new,1)
    p.write_text(s)
    print('[phase5.3-close] marked Phase 5.3 complete in roadmap')
else:
    print('[phase5.3-close] roadmap already marked complete')
PY

if [[ -x "./scripts/next-stage.sh" ]]; then
  ./scripts/next-stage.sh --after 5.3
fi

echo "[phase5.3-close] Phase 5.3 closeout validated."
