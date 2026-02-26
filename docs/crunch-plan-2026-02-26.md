# Crunch plan — 2026-02-26

## Current state snapshot (where we are now)

The project is in **Phase 5.3 (controlled rollout and page-by-page UAT)**, and launch status remains **NO GO** until the manual UAT Sev1 backlog is closed. The next-stage helper script still points to Phase 5.3 as the current execution target.

### Evidence reviewed

- `docs/platform-1.0-roadmap.md` progress tracker shows completed work through 5.2, with 5.3 and 5.4 still open.
- `docs/release-evidence/phase5-3-uat-execution.md` records a NO GO outcome from manual validation.
- `docs/release-evidence/phase5-3-remediation-backlog.md` lists 5 Sev1 and 5 Sev2 defects that block release quality.
- `./scripts/next-stage.sh` confirms “Next stage: Phase 5.3”.

## What is left (priority-ordered)

### P0 — Must close immediately to leave NO GO status

1. **Session/auth reliability closure in real UAT accounts**
   - Driver logout path + re-auth roundtrip.
   - Portal first-login forced password change enforcement.

2. **Check-in data integrity closure**
   - End-to-end intake job linking and save/refresh persistence in staging.
   - Verify no schema-drift regressions between staging DB and migration chain.

3. **Pickup request lifecycle clarity**
   - Confirm pending-request merge behavior for portal submissions.
   - Ensure state/CTA language matches actual workflow outcomes.

4. **Unsupported file handling in check-in flow**
   - HEIC/video must fail fast with user-facing validation and no partial persistence.

### P1 — Launch-quality but not immediate Sev1 blockers

1. Check-in tab clarity and workflow labeling.
2. Estimate detail + decision UX completeness.
3. Invoice automation on route-confirmed stops + walk-in speed path.
4. Operational alert ownership/severity lifecycle.
5. Rug search/profile management ergonomics.

## Immediate problems that require fixing now

1. **Evidence debt is now larger than pure code debt.** We have implementation signals for several Sev1 areas, but no fresh closure evidence in the UAT tracker proving those fixes under staging credentials.
2. **Release gate blind spot:** `role-scope.integration.test.ts` is skipped without environment credentials, so high-risk scope/policy checks can silently go stale.
3. **Plan drift risk:** roadmap still shows Phase 0 items incomplete while branch work has progressed through Phases 4–5 artifacts. This creates confusion about true critical path ownership and can trigger duplicate or conflicting fixes.
4. **Operational noise in CI/tooling:** npm emits persistent env warnings (`Unknown env config "http-proxy"`) and build emits stale browserslist data warnings; these are not release blockers but dilute signal during gate runs.

## New crunch plan (parallel lanes, one owner per lane)

## Lane A — Sev1 closure strike team (today + next 48h)

- Re-run full manual Sev1 checklist with staging creds and capture evidence links per item.
- For each Sev1 ticket (`P53-001`…`P53-005`), mark one of:
  - Closed with proof,
  - Reproduced with exact repro steps,
  - Deferred (not allowed for Sev1 unless rollbacking release date).
- Update `phase5-3-remediation-backlog.md` and `phase5-3-uat-execution.md` in the same PR.

**Exit gate:** 0 open Sev1.

## Lane B — Gate automation hardening (in parallel)

- Make `phase5-3-prelive-gate.sh` print a hard warning summary when integration tests are skipped due to missing env.
- Add a small machine-readable output block (pass/fail/skip) so release evidence cannot misread skipped checks as pass.

**Exit gate:** pre-live output clearly distinguishes PASS vs SKIP and fails release candidate if required credentials are expected but absent.

## Lane C — Staging schema and data parity verification

- Run a schema parity check against migrations focused on latest workflow tables (`intake_jobs`, pickup/estimate/invoice workflow tables).
- Confirm no stale environments are missing phase migrations used by current UI paths.

**Exit gate:** parity report attached to release evidence; any drift gets a migration/apply owner + ETA.

## Lane D — Sev2 batching for predictable throughput (next 3–5 days)

- Batch by workflow to reduce retest churn:
  1. Check-in UX + file/input clarity.
  2. Portal estimate/pickup UX.
  3. Driver+office invoice/alert/search usability.
- Retest each batch immediately after merge.

**Exit gate:** all Sev2 closed or formally accepted with owner/date/risk note.

## Resume building now (first implementation slice)

Start with **Lane B** immediately because it reduces false confidence while other fixes are being validated:

1. Patch `scripts/phase5-3-prelive-gate.sh` to emit explicit SKIP states for credential-gated checks.
2. Add/adjust tests for script behavior where practical.
3. Run lint/test/build + pre-live gate locally.
4. Commit and attach updated evidence docs.

Then execute **Lane A** as the next merge slice with staging credentials.
