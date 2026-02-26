# Phase 2.2 — Dashboard Baseline Plan

Status: Implemented specification, pending 3-day data soak validation
Date: 2026-02-24

## Dashboard panels (minimum)

1. **Auth reliability**
   - Login success rate
   - Login failure count and top error reasons

2. **Edge function reliability**
   - Success/error rate by function
   - p50/p95 latency by function
   - Error volume trend (last 24h, 7d)

3. **Invoice PDF health**
   - `invoice-pdf` success rate
   - Signed URL generation failures
   - Bucket/object write failures

4. **Operational alert pipeline**
   - `operational-alerts` invocation success
   - Alert dispatch attempts (Slack/email)
   - Dispatch failures by channel

5. **Critical workflow health**
   - Pickup request completion ratio
   - Check-in completion ratio
   - Estimate decision completion ratio
   - Portal onboarding completion ratio

## Alert bindings
Each panel must map to warning/critical alert thresholds from `docs/slo-alert-thresholds.md`.

## Required data sources
- Supabase Auth logs
- Edge function invocation logs/metrics
- Workflow state tables (`pickup_requests`, `rugs`/check-in flow, `estimates`, `portal_users` onboarding markers)
- Communication/event tables where applicable

## Evidence required for Phase 2.2 gate
- Dashboard link(s) captured in release evidence document.
- Screenshot or export of each required panel.
- At least 3 consecutive days with live datapoints.

## Current blocker to mark complete
- **Time-based validation requirement**: 3-day live-data window cannot be completed instantly in-repo.
- Once 3-day evidence exists, mark Phase 2.2 complete in roadmap tracker.
