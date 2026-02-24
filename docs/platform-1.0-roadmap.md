# Platform 1.0 Assessment and Roadmap

Date: 2026-02-23

## Executive summary

The platform is in a **strong private-beta state** with core workflow breadth already implemented across facility operations, office operations, driver portal, wholesale portal, billing, onboarding, and role-based controls. The best path to 1.0 is to execute in **small, verifiable increments**: finish one subphase, validate, fix any regressions, then move forward.

**Current maturity estimate:** ~0.8–0.9 (feature-complete beta, not yet fully hardened 1.0).

---

## Current platform state

### What is already in place

1. **Core multi-role workflow coverage**
   - Facility check-in and production operations.
   - Office operations for pickups, estimates, invoicing, and deliveries.
   - Driver workflow and portal experiences.
   - Wholesale portal onboarding + invoice access/payments trail.

2. **Backend and policy foundations**
   - Significant migration history covering MVP foundations through late-phase hardening.
   - Explicit RLS hardening and role-scope protections.
   - Edge functions for lifecycle-critical actions (checkout, onboarding, invoice PDFs, operational alerts, admin controls).

3. **Quality and release scaffolding**
   - Unit and workflow tests, plus role-scope integration tests.
   - Release runbook and private-beta readiness scripts.
   - Full-system check documenting healthy local quality gates.

### What remains before 1.0

1. **Staging/production evidence closure**
   - Local checks are green, but several release checks are env/credential-gated and need repeatable execution evidence.

2. **Observability and SLO formalization**
   - Alerts exist, but SLO/error-budget ownership and dashboards are not yet formal release gates.

3. **Reliability and recovery rigor**
   - Rollback guidance exists, but incident drills and restoration proof need to be practiced.

4. **Security and governance completion**
   - RLS posture is strong, but 1.0 needs recurring audits, secret rotation cadence, and retention policy sign-off.

---

## 1.0 definition (recommended)

Declare 1.0 only when all are true:

1. Launch-critical workflows pass deterministic staging and production smoke checks.
2. SLOs, alert thresholds, and ownership are documented and running.
3. Security controls are validated continuously (RLS regression + least privilege + secret hygiene).
4. Incident and rollback procedures are tested, not just documented.
5. Release evidence is attached to every release candidate with explicit go/no-go sign-off.

---

## Execution model: one step at a time

For **every subphase** below, use this same loop:

1. Implement only that subphase scope.
2. Run local checks (`npm run lint`, `npm run test`, `npm run build`).
3. Run targeted smoke checks for impacted workflows.
4. Fix all regressions found in that subphase.
5. Capture evidence and sign off the subphase before continuing.

No parallel jumps; move sequentially.

---

## Phase 0 — Prephase: known blockers and stabilization

This phase is the immediate pre-1.0 blocker pass. Do not proceed to Phase 1 until these are fixed and verified in staging.

### 0.1 Rug check-in failure (`public.intake_jobs` not found)
- Reproduce the check-in failure end-to-end in Facility flow.
- Trace the exact failing query/function and confirm whether table/function reference is outdated (`public.intake_jobs`) or environment schema drift exists.
- Patch the failing path and add regression coverage for successful check-in completion.

**Validation gate:** facility check-in completes successfully for a representative rug in staging with no missing-relation errors.

### 0.2 Wholesale estimate note text not persisting
- Reproduce as wholesale client user and capture request/response payload path.
- Confirm whether failure is UI state handling, API mutation path, RLS denial, or missing DB column mapping.
- Implement fix and add deterministic test coverage for save + reload persistence of estimate note text.

**Validation gate:** estimate text entered by wholesale user persists after refresh/re-login and is visible in expected role scopes.

### 0.3 Pickup request behavior with existing pending request
- Change pickup submission logic: if client already has an active `pending` pickup request, do not create/shift to a future request date.
- Instead, merge/attribute new submission changes onto the existing pending request record.
- Define and enforce merge semantics (fields updated, audit trail/event log entry, timestamp behavior).

**Validation gate:** submitting while pending updates current pending request rather than creating/extending to a new upcoming date.

### 0.4 Phase 0 sign-off checklist
- Confirm fixes for 0.1–0.3 in staging with role-appropriate test users.
- Run local checks (`npm run lint`, `npm run test`, `npm run build`) and targeted staging smoke for affected workflows.
- Record evidence (before/after screenshots/logs, query traces, commit SHAs) in release artifacts.

**Validation gate:** all three blocker workflows are green with evidence attached.

## Phase 1 — Release gate hardening

### 1.1 Define release evidence contract
- Add a release evidence template (commit SHA, migrations, function versions, smoke logs, owner sign-off).
- Require artifact links in every release candidate.

**Validation gate:** template completed for one dry-run release.

### 1.2 CI enforce readiness scripts
- Run `scripts/private-beta-readiness.sh` on release branches.
- Add fail-fast behavior when required env vars are missing in release contexts.

**Validation gate:** CI blocks merge on failed readiness gate.

### 1.3 Gate role-scope protections
- Run `scripts/rls-scope-smoke-test.sh` for release candidates.
- Require role-scope pass output as release evidence.

**Validation gate:** portal/office/driver scope checks green in staging.

### 1.4 Add release sign-off workflow
- Add explicit engineering + operations go/no-go checklist section to runbook.

**Validation gate:** one staged release includes signed go/no-go record.

---

## Phase 2 — Reliability and observability

### 2.1 Define SLOs and alert thresholds
- Define minimum SLO set: auth success, edge-function success, critical workflow completion rate.
- Set thresholds and escalation ownership.

**Validation gate:** SLO doc approved by engineering + operations.

### 2.2 Ship baseline dashboards
- Create dashboards for auth failures, edge function errors, PDF generation issues, operational alerts.

**Validation gate:** dashboards show live data for at least 3 consecutive days.

### 2.3 Add synthetic checks
- Add scheduled probes for critical user routes and core function endpoints.

**Validation gate:** probe pass/fail history visible; alerting wired for failures.

### 2.4 Run incident game day
- Simulate outage/misconfig scenarios (e.g., webhook failure, expired secret, function timeout).

**Validation gate:** postmortem complete with tracked remediation actions.

---

## Phase 3 — Security and data governance

### 3.1 Automate RLS regression cadence
- Run role-scope/RLS checks daily in staging and pre-release in production.

**Validation gate:** one full week of clean scheduled runs.

### 3.2 Secrets inventory and rotation schedule
- Document all runtime secrets and their owners.
- Set and track rotation windows.

**Validation gate:** all secrets mapped to owner + next rotation date.

### 3.3 Least-privilege review
- Review service-role and admin-only paths.
- Remove/lock any excessive permissions.

**Validation gate:** privileged-surface checklist signed.

### 3.4 Retention and compliance policy
- Define retention windows for events, payment attempts, and generated artifacts.

**Validation gate:** policy approved and reflected in ops docs.

---

## Phase 4 — Product quality and UX stabilization

### 4.1 Beta feedback triage
- Rank issues by severity and workflow impact.
- Fix highest-severity friction first.

**Validation gate:** all P0/P1 beta issues closed.

### 4.2 Critical journey acceptance tests
- Add deterministic acceptance coverage for:
  1) pickup request
  2) check-in to production
  3) estimate lifecycle
  4) invoice send + PDF retrieval
  5) portal onboarding + payment tracking

**Validation gate:** 100% pass rate on critical journeys.

### 4.3 UX consistency pass
- Standardize empty states, loading states, and actionable error copy by role.

**Validation gate:** design/ops walkthrough approved.

### 4.4 Regression stabilization window
- Freeze net-new features for a short hardening window.
- Resolve all regressions introduced in Phase 4.

**Validation gate:** no open release-blocking regressions.

---

## Phase 5 — Production readiness and 1.0 launch

### 5.1 Schema and migration freeze
- Freeze schema for launch candidate.
- Dry-run migrations against production-like snapshot.

**Validation gate:** zero migration blockers or rollback ambiguity.

### 5.2 Full staging rehearsal
- Execute full runbook in staging with real-like data and credentials.

**Validation gate:** complete green rehearsal evidence package.

### 5.3 Controlled production rollout
- Execute rollout with on-call and rollback owner active.
- Run full page-by-page click/intent UAT before live cutover.
- Run production smoke checks immediately post-deploy.

**Validation gate:** page-by-page UAT completed, then production smoke and role-scope checks pass.

### 5.4 1.0 cutover and monitoring watch
- Announce 1.0.
- Run structured launch-watch probes for the initial post-cutover window.
- Record watch summary and incident outcomes in release evidence.

**Validation gate:** no unresolved Sev1/Sev2 incidents in initial watch window and launch-watch probe summary is attached.

---

## Suggested pacing (little-by-little)

- Week 1: Phase 0 (subphases 0.1 → 0.4)
- Week 2: Phase 1 (subphases 1.1 → 1.4)
- Week 3: Phase 2 (subphases 2.1 → 2.4)
- Week 4: Phase 3 (subphases 3.1 → 3.4)
- Week 5: Phase 4 (subphases 4.1 → 4.4)
- Week 6: Phase 5 (subphases 5.1 → 5.4)

If any subphase fails validation, stop and fix before advancing.

---

## Progress tracker template

Use this checklist style while executing:

- [ ] Phase 0.1 complete
- [ ] Phase 0.2 complete
- [ ] Phase 0.3 complete
- [ ] Phase 0.4 complete
- [x] Phase 1.1 complete
- [x] Phase 1.2 complete
- [x] Phase 1.3 complete
- [x] Phase 1.4 complete
- [x] Phase 2.1 complete
- [ ] Phase 2.2 complete
- [x] Phase 2.3 complete
- [x] Phase 2.4 complete
- [ ] Phase 3.1 complete *(automation shipped: `.github/workflows/rls-regression-daily.yml`; waiting 7-day clean streak)*
- [x] Phase 3.2 complete
- [x] Phase 3.3 complete
- [x] Phase 3.4 complete
- [x] Phase 4.1 complete
- [x] Phase 4.2 complete
- [x] Phase 4.3 complete
- [x] Phase 4.4 complete
- [x] Phase 5.1 complete
- [x] Phase 5.2 complete
- [ ] Phase 5.3 complete
- [ ] Phase 5.4 complete
