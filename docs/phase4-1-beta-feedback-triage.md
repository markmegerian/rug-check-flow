# Phase 4.1 — Beta Feedback Triage

## Goal
Rank beta feedback by severity and workflow impact, then sequence fixes so all P0/P1 items are addressed first.

## Triage scale
- **P0 (Release blocker):** Critical workflow unusable or data integrity risk.
- **P1 (High):** Workflow is usable but materially degraded, confusing, or error-prone.
- **P2 (Medium):** UX friction with workaround, no immediate data/operational risk.
- **P3 (Low):** Nice-to-have polish.

## Workflow impact scale
- **Critical journey:** pickup request, facility check-in/production handoff, estimate lifecycle, invoice/PDF, onboarding/payment tracking.
- **Operational journey:** reporting, reminders, alerts, non-critical admin operations.

## Current triage register

| ID | Area | Issue | Priority | Impact | Status | Planned action |
|---|---|---|---|---|---|---|
| BF-001 | Facility check-in | Check-in path fails when `intake_jobs` is unavailable in environment | P0 | Critical journey | Mitigated (compat path added) | Keep regression smoke coverage and monitor compatibility warnings in readiness logs |
| BF-002 | Wholesale estimates | Decision notes entered by wholesale user were not persisted | P1 | Critical journey | Fixed | Keep persistence regression coverage in portal estimate flow tests |
| BF-003 | Wholesale pickups | Submitting while pending request existed created/shifted extra upcoming request | P1 | Critical journey | Fixed | Keep merge semantics verification in portal pickup smoke run |
| BF-004 | Invoice PDF | Function instability under missing bucket/auxiliary event-write errors | P1 | Critical journey | Mitigated | Continue synthetic probe + release readiness gate for invoice-pdf |
| BF-005 | Long-running validation visibility | Operators lacked progress visibility during readiness gate runs | P2 | Operational journey | Fixed | Maintain checkpoint heartbeat logging in readiness script |

## Execution order
1. Close all **P0** items first.
2. Close all **P1** items next.
3. Batch **P2/P3** polish into short hardening windows.
4. Re-run readiness gate after each P0/P1 closure.

## Validation gate
**Phase 4.1 complete** when:
1. All identified P0/P1 items are marked fixed or actively mitigated.
2. Each P0/P1 item has associated validation evidence (tests/smoke/readiness outputs).
3. Remaining backlog is P2/P3 only.

## Current gate status
Baseline triage is complete, and current register contains no unresolved P0/P1 items.
