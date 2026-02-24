# Phase 5.3 — Controlled rollout and page-by-page UAT

## Goal

Complete a controlled production rollout only after a full click-path validation pass is executed and recorded.

## Direct answer: should page-by-page testing happen before live?

Yes. Do the full page-by-page click/intent validation **before final live cutover** and then run a short post-deploy smoke pass right after deploy.

- Pre-live: full UAT depth (all pages, major intents, negative-path checks).
- Post-live: focused smoke depth (critical journeys and role-scoped access).

## Required sequence

1. Freeze launch-candidate code and data shape (Phase 5.1 done).
2. Execute full staging rehearsal (Phase 5.2 done).
3. Execute full page-by-page UAT checklist in production-like environment.
4. Fix all Sev1/Sev2 issues before production rollout.
5. Run controlled production rollout with on-call active.
6. Run immediate post-deploy smoke and role-scope checks.
7. Enter monitoring watch (Phase 5.4).

## Page-by-page UAT checklist (ordered)

Run this in order and capture pass/fail evidence for each page.

### A) Auth and session handling
1. Login/logout flows for office, check-in staff, driver, and portal users.
2. Expired session handling and re-auth prompts.
3. Unauthorized route behavior by role.

### B) Facility / check-in
1. New check-in creation and rug association.
2. Intake job linking path (no missing-relation failures).
3. Check-in save/refresh persistence.
4. Error-state messaging for invalid inputs.

### C) Office operations
1. Pickup request lifecycle create/update/close.
2. Estimate create/update/approve/reject.
3. Invoice create/send/view/download PDF.
4. Operational reminders/alerts screens where enabled.

### D) Wholesale portal
1. Portal onboarding completion.
2. Pickup request submission with existing pending request (must merge, not duplicate).
3. Estimate decision with note persistence after refresh/re-login.
4. Invoice list, detail, and payment-attempt visibility.

### E) Driver workflow
1. Assigned pickup visibility and scope correctness.
2. Pickup state transitions and confirmation capture.
3. Signature/photo evidence paths where enabled.

### F) Core reliability and edge functions
1. `invoice-pdf` invocation returns success + signed URL.
2. `operational-alerts` invocation path works under expected auth.
3. Synthetic probe report returns pass for required checks.

## Pass/fail policy

- A sub-check is **pass** only when behavior matches expected intent and evidence is attached.
- Any Sev1/Sev2 failure blocks rollout.
- Sev3/Sev4 can proceed only with documented owner and fix date.

## Evidence required for 5.3 sign-off

Use `docs/release-evidence/phase5-3-uat-execution.md` to capture evidence in one place.

Optional automation: run `./scripts/phase5-3-run-and-capture.sh` to execute the pre-live gate and write timestamped log + summary artifacts under `artifacts/phase5-3/`.

Automation helper: run `./scripts/phase5-3-apply-automated-results.sh` to sync automated check results from the latest pre-live log into `docs/release-evidence/phase5-3-uat-execution.md`.

Closeout automation: once the Phase 5.3 evidence checklist is fully checked and the final decision is `GO`, run `./scripts/phase5-3-validate-and-close.sh` to validate evidence completeness and mark Phase 5.3 complete in the roadmap tracker.

1. Filled checklist with timestamps and tester initials.
2. Command outputs from:
   - `./scripts/staging-smoke-test.sh`
   - `./scripts/rls-scope-smoke-test.sh`
   - `./scripts/private-beta-readiness.sh`
3. Screenshots/video for UI-critical regressions and fixes.
4. Final go/no-go decision in release evidence file.

## Exit criteria

- 100% pass on all critical click-path checks.
- No open Sev1/Sev2 defects.
- Production rollout smoke checks green.
