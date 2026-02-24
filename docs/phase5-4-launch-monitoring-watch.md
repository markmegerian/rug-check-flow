# Phase 5.4 — 1.0 cutover monitoring watch

## Goal

Run a structured post-cutover monitoring watch that can quickly detect and escalate launch regressions.

## Ordered execution flow

1. Confirm Phase 5.3 rollout completed and production smoke checks are green.
2. Start launch watch automation:

   ```sh
   WATCH_MINUTES=60 PROBE_INTERVAL_SECONDS=300 ./scripts/phase5-4-launch-watch.sh
   ```

3. Monitor probe outcomes in `artifacts/launch-watch/probes/`.
4. If any probe fails, open an incident and apply rollback/forward-fix decision path.
5. At the end of the watch window, archive summary JSON to release evidence.

## Required environment variables

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `OFFICE_USER_EMAIL`
- `OFFICE_USER_PASSWORD`

Optional:

- `WATCH_MINUTES` (default: `60`)
- `PROBE_INTERVAL_SECONDS` (default: `300`)
- `WATCH_REPORT_DIR` (default: `artifacts/launch-watch`)
- `APP_BASE_URL` (adds app route checks via synthetic probe)

## Exit criteria

- Zero failed probes during watch window.
- No unresolved Sev1/Sev2 incidents.
- Watch summary attached to release evidence.
