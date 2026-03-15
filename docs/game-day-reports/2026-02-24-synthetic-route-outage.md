# Game Day Report — Synthetic Route Probe Outage

- Date: 2026-02-24
- Scenario: Route-probe outage simulation using invalid APP_BASE_URL host
- Start time (UTC): 2026-02-24T08:42:09Z
- Detection time (UTC): 2026-02-24T08:42:24Z
- Mitigation time (UTC): 2026-02-24T08:42:38Z
- Detection latency: 15s
- Mitigation latency: 14s

## What happened
1. Triggered synthetic probe run with intentionally invalid APP_BASE_URL.
2. Probe run failed as expected with route probe DNS failures.
3. Removed faulty APP_BASE_URL and re-ran probes.
4. Recovery probe passed successfully.

## Evidence artifacts
- Failure log: artifacts/game-day-failure.log
- Recovery log: artifacts/game-day-recovery.log

## Follow-up actions
- Keep APP_BASE_URL optional for synthetic probes and scope it to validated hostnames in CI secrets.
- Alert routing: ensure scheduled synthetic workflow failure notifications are subscribed by on-call owners.
- Add this report to release evidence package for reliability track.
