# Agent Ops Setup Baseline

_Last updated: 2026-04-17_

This document is the operating baseline for making the assistant maximally effective on `rug-check-flow` without accidentally crossing live-production boundaries.

## 1. What is already working

### Real browser-backed live verification
Already available and proven useful.

Current effective pattern:
- use headless Playwright against `https://mr.rugboost.com`
- sign in with real role-specific accounts
- obtain a real authenticated Supabase session
- verify live UI and/or invoke live edge functions with the resulting token

This is now a core part of validation, not a nice-to-have.

### Live project verification
Already available and repeatedly used.

Current effective pattern:
- verify deployed edge functions directly in prod
- verify returned IDs, invoice numbers, rug IDs, and state transitions
- distinguish code-local success from actually-live success

### Safe outbound default for client email
Already enforced.

Current safe default:
- `process-notification-cadence` requires `CLIENT_EMAIL_DELIVERY_ENABLED=true` before attempting real outbound client email
- with the flag absent or false, reminder/estimate-batch email delivery is explicitly disabled
- while disabled, the processor also avoids outbound reminder thread/system-message noise

This matches the current business reality: clients exist in the system but are not yet onboarded for live email.

## 2. Recommended operating model

### A. Use browser-backed live smoke as the truth layer
For critical workflows, do not rely only on code inspection or local tests.

Use live smoke for:
- Check-In
- estimate create/revise
- invoice handoff generation
- reminder processor behavior
- role-specific UI access
- anything customer-facing or deploy-sensitive

### B. Keep explicit go-live gates for all customer-facing channels
Default should be safe-off until the business says otherwise.

Current status:
- client email: gated off by default in reminder processing

Recommended future gates:
- reminder email delivery
- estimate send email delivery
- portal onboarding email delivery
- SMS or other outbound channels if added later

### C. Keep a stable smoke-data lane
Use obvious test naming so live verification does not blur into real operations.

Recommended naming:
- clients: `TEST - <purpose>`
- rugs: `E2E-<flow>-<suffix>`
- invoices: generated from explicitly test-tagged rugs/clients when possible

Guideline:
- prefer reusing a small known set of smoke records
- only create fresh test records when the workflow truly requires a clean object

## 3. Test account matrix

This should be kept current as a working list of accounts safe for repeated smoke usage.

### Confirmed usable now
- office: `codex@gpt.com`
- office: `test@office.com`
- check-in: live check-in staff account exists and has already been used successfully for browser-backed smoke

### Still worth formalizing
The assistant should have one clearly-designated account for each role below, explicitly approved for repeated smoke usage:
- office
- check-in
- driver
- portal client

## 4. Critical-path live checklist

This is the minimum high-signal regression path after meaningful workflow changes.

### Workflow checks
1. Check-In live submit from `/checkin`
2. Estimate create live from `/ops?tab=estimates`
3. Estimate revise live from `/ops?tab=estimates`
4. Invoice handoff generation from `/ops?tab=invoice-generator`
5. Reminder processor invocation in manual mode
6. Role-specific access sanity by route/tab

### Evidence expectations
Capture at least:
- HTTP/function result
- entity ids created or mutated
- user-visible UI confirmation where relevant
- exact live blocker if the path does not complete

## 5. Observability wish list for the next phase

These are not blockers for the current phase, but they will matter a lot for the performance phase.

Most valuable additions:
- easy browser console capture during live smoke
- network timing visibility for heavy screens
- easy Supabase function log access by invocation
- query-level visibility where available
- a stable slow-path reproduction checklist based on real daily usage

## 6. Boundary rules

The assistant should act freely on:
- code changes
- tests/builds
- live verification using approved smoke accounts
- prod-safe smoke records under explicit test naming
- deploy/redeploy of already-approved internal project code

The assistant should not assume without user approval:
- enabling real customer email delivery
- enabling portal invites for real clients
- any setup that can message or notify real customers
- use of ambiguous real customer records as smoke fixtures when a test alternative exists

## 7. Pending user decisions, kept intentionally short

Only these items still need explicit user direction.

1. Which exact account should be treated as the canonical smoke account for each role?
   - office
   - check-in
   - driver
   - portal client

2. Is creating/keeping clearly-labeled prod smoke records approved as a standing practice?
   - recommended answer: yes, with strict `TEST-` / `E2E-` naming

3. Do you want Cursor or another external coding surface connected as an additional execution lane?
   - recommended answer: yes, if setup friction is low

## 8. Current recommendation

The assistant should continue to:
- finish the current correctness/workflow phase
- use browser-backed live verification as the standard for critical paths
- keep customer email delivery gated off until onboarding is complete
- prepare for the next phase by preserving evidence and keeping the smoke/test lane tidy
