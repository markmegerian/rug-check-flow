#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

EVIDENCE_FILE="${PHASE53_EVIDENCE_FILE:-docs/release-evidence/phase5-3-uat-execution.md}"
LOG_FILE="${PHASE53_LOG_FILE:-}"

if [[ ! -f "$EVIDENCE_FILE" ]]; then
  echo "[phase5.3-apply] evidence file not found: $EVIDENCE_FILE" >&2
  exit 1
fi

if [[ -z "$LOG_FILE" ]]; then
  LOG_FILE="$(ls -1t artifacts/phase5-3/phase5-3-prelive-*.log 2>/dev/null | head -n 1 || true)"
fi

if [[ -z "$LOG_FILE" || ! -f "$LOG_FILE" ]]; then
  echo "[phase5.3-apply] prelive log file not found. Set PHASE53_LOG_FILE or run ./scripts/phase5-3-run-and-capture.sh first." >&2
  exit 1
fi

python - "$EVIDENCE_FILE" "$LOG_FILE" <<'PY'
from pathlib import Path
import re, sys

evidence_path = Path(sys.argv[1])
log_path = Path(sys.argv[2])
text = evidence_path.read_text()
log = log_path.read_text()

checks = {
    "npm run lint": bool(re.search(r"DONE\s*: lint", log)),
    "npm run test": bool(re.search(r"DONE\s*: test", log)),
    "npm run build": bool(re.search(r"DONE\s*: build", log)),
    "./scripts/staging-smoke-test.sh": "DONE : staging smoke" in log,
    "./scripts/rls-scope-smoke-test.sh": "DONE : rls scope smoke" in log,
    "./scripts/private-beta-readiness.sh": "DONE : private beta readiness" in log,
}

for label, ok in checks.items():
    pattern = re.compile(rf"^- \[( |x)\] `{re.escape(label)}` passed.*$", re.MULTILINE)
    m = pattern.search(text)
    if not m:
        continue
    old = m.group(0)
    if ok:
        replacement = old.replace("- [ ]", "- [x]", 1)
    else:
        replacement = old.replace("- [x]", "- [ ]", 1)
    text = text.replace(old, replacement)

text = re.sub(r"Date:\s*.*", "Date: " + __import__('datetime').datetime.now(__import__('datetime').timezone.utc).strftime('%Y-%m-%d'), text, count=1)
note_line = f"- Automated checks synced from `{log_path.as_posix()}`."
skip_note = "- Optional smoke/readiness checks were skipped due to missing environment credentials in this run."
if "Notes:" not in text:
    text += "\n\nNotes:\n\n- _TBD_\n"
text = re.sub(r"- Automated checks synced from `[^`]+`\.\n?", "", text)
text = re.sub(r"- Optional smoke/readiness checks were skipped due to missing environment credentials in this run\.\n?", "", text)
text = text.replace("Notes:\n\n- _TBD_", f"Notes:\n\n{note_line}")
if note_line not in text:
    text = text.replace("Notes:\n", f"Notes:\n\n{note_line}\n", 1)
if "SKIP : staging smoke" in log or "SKIP : role-scope" in log:
    if skip_note not in text:
        text = text.replace(note_line, note_line + "\n" + skip_note, 1)


evidence_path.write_text(text)
print(f"[phase5.3-apply] updated {evidence_path}")
PY

if [[ -x "./scripts/next-stage.sh" ]]; then
  ./scripts/next-stage.sh --after 5.3
fi
