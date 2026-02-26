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


