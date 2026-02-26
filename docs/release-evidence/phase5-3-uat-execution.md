# Phase 5.3 — UAT execution tracker

Date: 2026-02-24
Release candidate: _TBD_
Operator: Codex

## 1) Automated checks (run first)

Run:

```sh
./scripts/phase5-3-prelive-gate.sh
```

Record outputs:

- [x] `npm run lint` passed
- [x] `npm run test` passed
- [x] `npm run build` passed
- [x] `./scripts/staging-smoke-test.sh` passed (if env configured)
- [x] `./scripts/rls-scope-smoke-test.sh` passed (if role creds configured)
- [x] `./scripts/private-beta-readiness.sh` passed (if role creds configured)

## 2) Manual page-by-page click/intent validation

Follow ordered checklist from:

- `docs/phase5-3-controlled-rollout-and-page-by-page-uat.md`

### Auth/session
- [ ] Office login/logout + re-auth behavior
- [ ] Check-in staff login/logout + re-auth behavior
- [ ] Driver login/logout + re-auth behavior
- [ ] Portal login/logout + re-auth behavior

### Facility / check-in
- [ ] New check-in creation and rug association
- [ ] Intake job linking path works (no missing relation failure)
- [ ] Save/refresh persistence
- [ ] Invalid-input error states

### Office
- [ ] Pickup request lifecycle
- [ ] Estimate lifecycle
- [ ] Invoice create/send/PDF
- [ ] Operational reminder/alerts view (if enabled)

### Wholesale portal
- [ ] Onboarding completion
- [ ] Pending pickup merge behavior
- [ ] Estimate decision note persistence
- [ ] Invoice/payment attempt visibility

### Driver
- [ ] Assigned pickup scope
- [ ] Pickup status transitions
- [ ] Signature/photo evidence flow (if enabled)

## 3) Severity outcomes

- Sev1 defects: _count_
- Sev2 defects: _count_
- Sev3 defects: _count_
- Sev4 defects: _count_

Rollout rule:

- Any open Sev1/Sev2 = **NO GO**
- Sev3/Sev4 must have owner + target fix date

## 4) Decision

- Engineering: GO / NO GO
- Operations: GO / NO GO
- Final decision: GO / NO GO

Notes:

- Automated checks synced from `artifacts/phase5-3/phase5-3-prelive-20260224T192949Z.log`.



## 5) Manual findings log (current run)

Current status: **NO GO** due to multiple open Sev1/Sev2 issues captured during manual checklist execution.

### Reported blockers mapped to checklist

- Driver login/logout + re-auth behavior → **NO GO** (no driver logout path).
- Portal login/logout + re-auth behavior → **NO GO** (forced first-login password change did not trigger).
- Intake job linking path works → **NO GO** (relation/linking failures observed).
- Save/refresh persistence → **NO GO** (saved state not reliably persistent).
- Invalid-input error states → **NO GO** (HEIC/video accepted in UI but unsupported in persistence flow).
- Operational reminder/alerts view → **NO GO** (needs broader functional coverage).
- Wholesale onboarding completion → **NO GO** (must enforce password change gate).
- Pending pickup merge behavior → **NO GO** (pickup request UX/function unclear).
- Estimate decision note persistence → **NO GO** (workflow/communication lifecycle gaps).
- Driver assigned pickup scope / status transitions / signature-evidence flow → **NO GO** (end-to-end mixed pickup+delivery workflow gaps).

See remediation tracker: `docs/release-evidence/phase5-3-remediation-backlog.md`.

### Fillable mini table (paste into Notes while clicking)

| Check | Result (PASS/FAIL) | Severity | Evidence (URL/screenshot/log) | Notes / repro steps | Owner |
| --- | --- | --- | --- | --- | --- |
| Driver logout + re-auth | FAIL | Sev1 |  |  |  |
| Portal forced password change | FAIL | Sev1 |  |  |  |
| Intake job linking | FAIL | Sev1 |  |  |  |
| Save/refresh persistence | FAIL | Sev1 |  |  |  |
| Invalid file input handling | FAIL | Sev1 |  |  |  |
| Pickup request lifecycle | FAIL | Sev1/2 |  |  |  |
| Estimate lifecycle UX + decisions | FAIL | Sev2 |  |  |  |
| Invoice automation expectations | FAIL | Sev2 |  |  |  |
| Alerts/reminders view | FAIL | Sev2 |  |  |  |
| Driver pickup/delivery proof flow | FAIL | Sev2 |  |  |  |
