# Phase 2.4 — Incident Game Day Runbook

Status: Ready to execute
Date: 2026-02-24

## Goal
Validate detection, escalation, and recovery workflows for realistic failures before 1.0 launch.

## Participants (role-based)
- Incident commander (on-call engineer)
- Operations lead (duty manager)
- Scribe/observer

## Scenarios (run at least one per session)
1. **Edge function timeout/degradation**
   - Inject: deploy intentionally delayed response to non-critical test endpoint.
   - Expected: synthetic probes fail, alert triggers, incident channel opens.
2. **Secret misconfiguration**
   - Inject: temporarily remove non-production secret from staging function.
   - Expected: function errors increase, rollback/restore executed.
3. **Webhook/provider outage simulation**
   - Inject: point alert destination to invalid endpoint in staging.
   - Expected: alert dispatch failures observed and escalated.

## Success criteria
- Critical alert detected within 10 minutes.
- Incident owner assigned within 5 minutes.
- Mitigation/rollback completed within 30 minutes for Sev1 simulation.
- Postmortem published within 24 hours.

## Evidence artifacts
- Incident timeline (start, detect, acknowledge, mitigate, close)
- Probe failure screenshots/log snippets
- Alert payload/log excerpts
- Postmortem link and remediation ticket list

## Output template
- Date:
- Scenario:
- Detection time:
- Time to acknowledge:
- Time to mitigate:
- What worked:
- What failed:
- Follow-ups:


## Latest execution evidence
- `docs/game-day-reports/2026-02-24-synthetic-route-outage.md`
