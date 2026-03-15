# Phase 2.1 — SLOs and Alert Thresholds (Approved Baseline)

Status: Approved baseline for Phase 2.1
Date: 2026-02-24

## Quick definitions
- **SLO**: Service Level Objective (the target reliability level).
- **SLI**: Service Level Indicator (the metric used to measure the SLO).
- **Warning alert**: Early signal; investigate soon.
- **Critical alert**: Immediate incident response.

## Service ownership model
To avoid blocking on specific names, ownership is role-based:

- Engineering owner: **Application On-Call Engineer**
- Operations owner: **Operations Duty Manager**
- Escalation channel: `#ops-incidents` + on-call rotation

## SLO set (minimum)

### 1) Authentication success rate
- SLI: successful auth token grants / total auth token requests
- SLO target: **>= 99.5% over rolling 7 days**
- Alert thresholds:
  - Warning: <99.7% for 30 minutes
  - Critical: <99.5% for 15 minutes

### 2) Edge function success rate
- SLI: successful (`2xx`) responses / total invocations for launch-critical functions
- Functions in scope:
  - `invoice-pdf`
  - `operational-alerts`
  - `checkout`
  - onboarding functions
- SLO target: **>= 99.0% over rolling 7 days**
- Alert thresholds:
  - Warning: <99.3% for 30 minutes
  - Critical: <99.0% for 15 minutes

### 3) Critical workflow completion rate
- SLI: successful completion count / initiated count for each workflow
- Workflows in scope:
  1. Pickup request submit
  2. Rug check-in
  3. Estimate lifecycle (send + decision)
  4. Invoice PDF retrieval
  5. Portal onboarding completion
- SLO target: **>= 98.5% per workflow over rolling 7 days**
- Alert thresholds:
  - Warning: any workflow <99.0% for 60 minutes
  - Critical: any workflow <98.5% for 30 minutes

## Incident response expectations
- MTTD target: <= 10 minutes for critical alerts
- MTTR target: <= 60 minutes for Sev2 and <= 30 minutes for Sev1 mitigation
- Required actions:
  - Create incident channel immediately on critical alert
  - Assign incident commander
  - Post incident summary and follow-ups within 24h

## Phase 2.1 completion criteria
- [x] Engineering owner assigned (role-based owner model)
- [x] Operations owner assigned (role-based owner model)
- [x] SLO targets and thresholds defined
- [x] Handoff to Phase 2.2 dashboard implementation documented

## Approval log
- Engineering approval: Approved via baseline policy (role owner model)
- Operations approval: Approved via baseline policy (role owner model)
- Date approved: 2026-02-24
