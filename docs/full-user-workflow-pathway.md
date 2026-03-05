# Full Multi-User Workflow Pathway (End-to-End)

## Purpose
This document maps the **complete operational pathway** across all primary users in RugBoost so the team can:
- analyze current behavior,
- identify where handoffs fail or slow down,
- automate repetitive work,
- and safely alter incorrect process steps.

It is written as a practical, step-by-step flow with role interactions, automation points, and branch outcomes.

---

## 1) Users, systems, and responsibility boundaries

## Primary user roles
- **Admin**: controls pricing, user provisioning, and full-system oversight.
- **Office**: manages clients, pickups, estimates, invoices, and dispatch coordination.
- **Check-in Staff**: records intake and routes rugs into production.
- **Driver**: executes assigned pickups, verifies rugs, captures evidence/signature, completes route stop.
- **Portal User (Client)**: requests pickups, reviews estimates, views invoices/pricing, completes onboarding.

## Shared systems / modules
- **Office Workspace**: invoices, estimates, clients, pickups, deliveries (+ pricing for admins).
- **Facility Operations**: check-in, production, pending pickups.
- **Driver Portal**: assignment execution + verification + signature + completion.
- **Wholesale Portal**: rugs, pickups, estimates, invoices, pricing, onboarding.
- **Supabase backend services**: auth, RLS, edge functions, storage, workflow state persistence.

---

## 2) Global workflow lifecycle (high-level)

1. **Client identity + access** is established.
2. **Pickup request** is created (usually client or office initiated).
3. **Office validates + confirms/assigns** pickup.
4. **Driver executes pickup** with proof and status completion.
5. **Facility check-in** captures intake metadata.
6. **Production flow** progresses rug work.
7. **Office creates/sends estimate** (if needed), client approves/rejects.
8. **Office invoices and sends PDF**, payment attempts are tracked.
9. **Delivery/pickup completion artifacts** close loop.
10. **Operational monitoring/alerts** detect failures and escalation path starts.

---

## 3) Detailed step-by-step pathway by stage

## Stage A — Identity, onboarding, and role activation

### A1. Admin provisions users
- **Actor**: Admin.
- **Action**: creates employee accounts and role assignments.
- **System result**: user appears with role-scoped access boundaries.
- **Potential automation**:
  - auto-send onboarding email on successful provision,
  - auto-log provisioning event in audit table,
  - auto-enforce initial password change for first login.

### A2. Portal user first login + password gate
- **Actor**: Portal User.
- **Action**: logs in, updates required password if flagged, unlocks onboarding flow.
- **System result**:
  - onboarding remains locked until password is changed,
  - onboarding completion marker persists when walkthrough is finished.
- **Failure branches**:
  - password update fails → user blocked from onboarding,
  - metadata update fails → password changed but gate state inconsistent.
- **Recommended automation**:
  - retry/compensating write for onboarding flags,
  - in-app guided recovery action + support escalation link.

---

## Stage B — Pickup request initiation and dispatch preparation

### B1. Pickup request is created
- **Actor**: Portal User or Office.
- **Action**: submit pickup request with date/location/rug details.
- **System state**: `pending`.
- **Guardrails**:
  - portal edits are only valid while request is `pending`.

### B2. Office triage and confirmation
- **Actor**: Office.
- **Action**: review pending requests, validate feasibility, confirm schedule.
- **System state transitions**:
  - `pending -> confirmed`, or
  - `pending -> assigned` (direct assignment), or
  - `pending -> cancelled`.
- **Automation opportunities**:
  - SLA timer on `pending` requests,
  - automatic route grouping suggestions by geography/date,
  - customer notification templates triggered on each transition.

### B3. Driver assignment
- **Actor**: Office.
- **Action**: assign a driver when route is ready.
- **System state**: `confirmed -> assigned`.
- **Interconnected effect**:
  - assignment appears in Driver Portal queue,
  - non-assigned drivers remain blocked by scope policy.

---

## Stage C — Driver execution (proof-based completion)

### C1. Driver starts assigned stop
- **Actor**: Driver.
- **Action**: opens assignment and begins rug-by-rug verification.
- **System effects**:
  - updates to notes/photos/evidence tied to pickup items,
  - progress visible to office/facility users as data updates persist.

### C2. Driver captures completion requirements
- **Actor**: Driver + Client contact at pickup location.
- **Required artifacts before completion**:
  - all rugs marked verified,
  - signature captured.
- **Transition rule**:
  - driver can only complete `assigned -> completed` when both requirements are true.

### C3. Driver completes pickup
- **Actor**: Driver.
- **Action**: completes assignment.
- **System state**: `assigned -> completed` with completion timestamp.
- **Downstream propagation**:
  - pickup record becomes read-only for route execution,
  - facility/office can proceed with intake operations.

### C4. Exception branches
- missing signature or unverified item → completion blocked.
- upload failure (photo/storage/network) → evidence incomplete.
- recommended automation:
  - pre-submit validation checklist,
  - background upload retry with visible queue,
  - “incomplete stop” supervisor alert if unresolved after threshold.

---

## Stage D — Facility intake and production handoff

### D1. Check-in intake
- **Actor**: Check-in Staff.
- **Action**: create/update intake entries (rug condition, services, measurements, tags).
- **Interconnected effect**:
  - production board receives structured work input,
  - office estimate/invoice quality improves from accurate intake metadata.

### D2. Time-bounded edit window
- **Actor**: Check-in Staff.
- **Constraint**: check-in edits are intentionally limited by workflow logic window.
- **Result**:
  - protects data integrity once production has advanced.

### D3. Production progression
- **Actor**: Facility operations team.
- **Action**: move rugs through production stages until ready for next commercial step.
- **Automation opportunities**:
  - stage aging alerts (stuck rugs),
  - auto-reminder queue for rugs waiting beyond SLA,
  - exception tags for missing estimate/invoice dependency.

---

## Stage E — Estimate lifecycle and customer decision loop

### E1. Office drafts and sends estimate
- **Actor**: Office.
- **State transitions**:
  - `draft -> sent`,
  - optional `draft -> expired` when no longer valid.
- **Propagation**:
  - estimate becomes visible in client portal.

### E2. Client response in portal
- **Actor**: Portal User.
- **Allowed transitions from `sent`**:
  - `sent -> approved`,
  - `sent -> rejected`.
- **Blocked transitions**:
  - client cannot expire estimate,
  - client cannot act on non-`sent` drafts.

### E3. Office follow-up and fallback outcomes
- **Actor**: Office.
- **Outcomes**:
  - approved → proceed to fulfillment/invoicing,
  - rejected → revise service scope or close,
  - expired → reopen/reissue as new estimate cycle.
- **Automation opportunities**:
  - auto-reminders for unanswered sent estimates,
  - one-click “reissue estimate” path with copied line items,
  - trigger-based status digest to account manager.

---

## Stage F — Invoice generation, PDF retrieval, and payment tracking

### F1. Office prepares invoice
- **Actor**: Office.
- **Action**: create/finalize invoice records and send to client.
- **Interconnected effect**:
  - invoice and line items become portal-visible within client scope.

### F2. PDF artifact generation/retrieval
- **Actor**: Office/Portal User (consumer), edge function (producer).
- **System**: invoice PDF function returns signed URL for invoice artifact.
- **Failure branch**:
  - signed URL missing/error → invoice delivery degraded.
- **Automation opportunities**:
  - auto-regenerate missing artifact on first failure,
  - emit operational alert on repeated invoice-pdf failures,
  - health probe job for PDF endpoint availability.

### F3. Payment attempt trail
- **Actor**: Client (payment action) + Office (monitoring).
- **Result**:
  - payment attempts tracked for reconciliation and follow-up,
  - office sees actionable payment state for collection workflow.

---

## Stage G — Closure, monitoring, and intervention

### G1. Operational reminder/alert loop
- **Actor**: System automation + Office/Admin responders.
- **Inputs**:
  - workflow aging thresholds,
  - failed edge functions,
  - stuck state transitions.
- **Outputs**:
  - reminders for actionable queues,
  - high-severity alert dispatch (Slack/email when configured).

### G2. Role-scope safety checks
- **Actor**: QA/Release owner.
- **Action**: run role-scope smoke/integration checks pre-release.
- **Result**:
  - validates client/driver data isolation,
  - prevents cross-tenant or out-of-scope data visibility regressions.

### G3. Release gates and rollback readiness
- **Actor**: Release owner.
- **Action**: run lint/test/build + smoke/readiness scripts.
- **Result**:
  - deterministic GO/NO-GO decision,
  - evidence artifacts for auditability.

---

## 4) Interconnection map (who triggers work for whom)

| Triggering Role | Action | Receiving Role/System | Propagated Result |
|---|---|---|---|
| Admin | Provision user/role | Auth + Office/Facility/Driver/Portal apps | Access path enabled with role guardrails |
| Portal User | Create pickup request | Office dispatch queue | New pending request requiring triage |
| Office | Confirm/assign pickup | Driver Portal | Assignment appears for route execution |
| Driver | Verify + complete pickup | Facility + Office | Intake-ready completed pickup with evidence |
| Check-in Staff | Record intake | Production + Office | Structured service data available downstream |
| Office | Send estimate | Portal User | Client decision required (approve/reject) |
| Portal User | Approve/reject estimate | Office | Pricing decision drives next billing/ops step |
| Office | Send invoice/PDF | Portal User | Invoice consumption + payment action |
| System monitor | Detect failure/aging | Office/Admin | Escalation + remediation workflow starts |

---

## 5) Outcome matrix (what can result at each major gate)

| Workflow Gate | Success Outcome | Recoverable Failure | Escalated Failure |
|---|---|---|---|
| Portal password gate | Onboarding unlocked | Password mismatch/validation error | Persistent metadata sync issue |
| Pickup assignment | Driver receives stop | Scheduling conflict/reassignment | Assignment absent despite demand backlog |
| Driver completion | Completed + timestamp + evidence | Missing signature/verification | Repeated storage/network failure blocks closure |
| Check-in handoff | Production-ready data | Partial metadata correction needed | Intake stale/locked before correction |
| Estimate decision | Approved/rejected clearly | No response before reminder SLA | Repeated expiry without account follow-up |
| Invoice PDF retrieval | Signed URL returned | Retry/regenerate path succeeds | Edge function outage or missing artifact chain |
| Payment tracking | Attempt log supports reconciliation | Delayed status sync | Ambiguous payment state blocks collections |

---

## 6) Recommended automation blueprint (to reduce manual effort)

1. **Event-driven notifications**
   - Emit standardized events for status transitions (pickup, estimate, invoice).
   - Route to in-app reminders + optional Slack/email fan-out.

2. **SLA watchdog jobs**
   - Track aging in `pending`, `assigned`, `sent`, and production stages.
   - Create task queues automatically for owners when thresholds breach.

3. **Idempotent workflow actions**
   - Ensure retries for email sends, artifact generation, and status updates do not duplicate outcomes.

4. **Exception-first dashboards**
   - Prioritize “blocked” work (missing signature, failed PDF, expired estimates, unassigned pickups).

5. **Pre-release guard automation**
   - Keep lint/test/build + smoke/role-scope checks in one gate command.
   - Require evidence artifact updates for each rollout decision.

---

## 7) Change-analysis checklist (for fixing incorrect process steps)

When you identify a workflow issue, evaluate in this order:
1. **State model correctness**: is the transition itself valid/invalid by rule?
2. **Role authorization**: should this role be allowed to do this transition?
3. **Data propagation**: did downstream queues/tabs refresh correctly?
4. **Evidence requirements**: are required artifacts enforced before closure?
5. **Notification behavior**: were the right users informed at the right time?
6. **Recovery path**: is there an obvious user-facing retry/fallback?
7. **Monitoring visibility**: would ops detect this failure before clients do?

If all seven pass, the workflow change is generally safe for staging validation.

---

## 8) Practical review cadence

- **Weekly workflow review**: office + facility + driver lead + admin.
- **Bi-weekly automation tuning**: alert thresholds and SLA windows.
- **Per-release gate**: run acceptance, role-scope smoke (when credentials available), and readiness scripts.
- **Post-incident update**: add the failure mode and remediation to this pathway doc.

This keeps the workflow living, measurable, and easy to alter when business reality changes.
