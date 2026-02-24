#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="${PHASE53_EVIDENCE_DIR:-artifacts/phase5-3}"
STAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
RUN_LOG="${OUT_DIR}/phase5-3-prelive-${STAMP}.log"
SUMMARY_MD="${OUT_DIR}/phase5-3-prelive-${STAMP}.md"

mkdir -p "$OUT_DIR"

echo "[phase5.3-capture] Running pre-live gate..."
if ./scripts/phase5-3-prelive-gate.sh | tee "$RUN_LOG"; then
  STATUS="PASS"
else
  STATUS="FAIL"
fi

cat > "$SUMMARY_MD" <<MARKDOWN
# Phase 5.3 pre-live run summary

- Timestamp (UTC): ${STAMP}
- Status: ${STATUS}
- Log file: ${RUN_LOG}

## Notes

- Fill docs/release-evidence/phase5-3-uat-execution.md with manual page-by-page checks.
- Attach this run log to the release evidence package.
MARKDOWN

if [[ "$STATUS" == "PASS" ]]; then
  echo "[phase5.3-capture] PASS"
else
  echo "[phase5.3-capture] FAIL" >&2
  exit 1
fi

if [[ -x "./scripts/next-stage.sh" ]]; then
  ./scripts/next-stage.sh --after 5.3
fi

echo "[phase5.3-capture] Summary: $SUMMARY_MD"
