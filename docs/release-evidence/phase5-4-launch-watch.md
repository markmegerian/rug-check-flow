# Phase 5.4 — Launch watch evidence

Date: _TBD_
Release candidate: _TBD_
Operator: _TBD_

## 1) Watch configuration

- Watch duration (minutes): _TBD_
- Probe interval (seconds): _TBD_
- App route checks enabled (`APP_BASE_URL`): Yes / No

## 2) Command run

```sh
WATCH_MINUTES=<minutes> PROBE_INTERVAL_SECONDS=<seconds> ./scripts/phase5-4-launch-watch.sh
```

## 3) Output artifacts

- Summary JSON: `artifacts/launch-watch/<summary-file>.json`
- Probe reports: `artifacts/launch-watch/probes/probe-*.json`
- Failure logs (if any): `artifacts/launch-watch/probes/probe-*.log`

## 4) Outcome

- Total probes: _TBD_
- Passed probes: _TBD_
- Failed probes: _TBD_
- Sev1 incidents during window: _TBD_
- Sev2 incidents during window: _TBD_

## 5) Decision

- Monitoring watch status: PASS / FAIL
- Follow-up actions:
  - _TBD_
