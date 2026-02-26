# Phase 4.4 — Regression Stabilization Window

## Goal
Run a short hardening window with no net-new feature scope, focusing only on regression detection and closure.

## Stabilization rules
1. Feature freeze for launch-critical surfaces during this window.
2. Any newly found regression is triaged within one business day.
3. P0/P1 regressions block progression to Phase 5.
4. Every fix requires evidence from test/readiness commands.

## Regression triage board
| ID | Area | Severity | Status | Evidence |
|---|---|---|---|---|
| RS-001 | Pickup request + merge semantics | P1 | Closed | `src/test/critical-journeys.acceptance.test.ts` + readiness smoke |
| RS-002 | Check-in compatibility path (`intake_jobs`) | P1 | Closed | Facility flow validation + unit/regression checks |
| RS-003 | Invoice PDF generation path | P1 | Closed | `scripts/private-beta-readiness.sh` Step 4 + synthetic probes |
| RS-004 | Role-scoped portal visibility | P1 | Closed | `scripts/rls-scope-smoke-test.sh` + role-scope integration |

## Required gate commands
```sh
npm run lint
npm run test
./scripts/private-beta-readiness.sh
```

## Validation gate
Phase 4.4 is complete when:
1. No open P0/P1 regressions remain.
2. Readiness gate is passing at end of stabilization window.
3. Regression board evidence is attached in release artifacts.

Current status: **Complete** for baseline stabilization pass.
