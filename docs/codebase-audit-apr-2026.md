# Codebase Audit — April 2026

Tracking ticket for the audit work that landed on `claude/codebase-audit-mHRgM`.

## What shipped (already applied to the repo)

### Observability

- `src/lib/logger.ts` — thin structured logger with event names + context.
- `src/lib/observability.ts` — Sentry bootstrap, no-op unless
  `VITE_SENTRY_DSN` is set. `logger.error` / `logger.warn` forward to
  Sentry; `AuthContext` pushes the current user via `setUserContext`.
- All raw `console.error` / `console.warn` sites in `src/` migrated to
  the logger (13 files, ~21 sites).

### Error classification

- `src/lib/rpc-errors.ts` — typed union
  `{ kind: permission | validation | business | transient | unknown, retryable }`
  used by `src/lib/offline-sync.ts` so retry logic can differentiate
  terminal business failures (`Cannot complete stop`) from transient
  network blips.

### Money helpers

- `src/lib/money.ts` — integer-cents helpers (`toCents`, `fromCents`,
  `sumCents`, `multiplyCents`, `percentOfCents`, `formatUSD`,
  `formatUSDFromDollars`).
- Covered by 13 new tests in `src/test/money.test.ts`, including the
  classic "three identical line items" float-drift case.
- Existing call sites are **not** migrated — keeping integer cents at
  the IO boundary can be introduced file by file.

### Build & tooling

- `rollup-plugin-visualizer` behind `ANALYZE=true` → `npm run build:analyze`
  writes `dist/stats.html`.
- Prettier + `prettier-plugin-tailwindcss` configured via
  `.prettierrc.json` / `.prettierignore` (no mass-reformat yet, to keep
  review diffs tight).
- `@axe-core/playwright` wired as `tests/e2e/a11y.spec.ts`. Gate fails
  only on WCAG 2.1 A/AA violations at `critical` or `serious` impact —
  deliberately tight so the gate can widen as backlog is triaged.
- `knip` configured (`knip.json`); report committed at
  `docs/knip-report.txt`.

### Auth UX

- `ProtectedRoute` and `PortalRoute` now render the shared
  `LoadingState` skeleton while `AuthContext` bootstraps.
- `mustChangePassword` gate confirmed universal (was already enforced
  for both portal and internal roles via `AuthContext`).

### Dead code removed

- 7 unreferenced modules deleted:
  `StopListView.tsx`, `CheckInLogPanel.tsx`, `PendingPickupsPanel.tsx`,
  `PickupRequestsTab.tsx`, `useDeliveryLists.ts`, `useDrivers.ts`,
  `usePickupRequests.ts`.
- `src/lib/checkin-operations.ts` shrunk from 178 LOC to 16 — every
  export except `uploadCheckinPhotoFile` was orphaned by the backend
  check-in workflow cut-over.
- Additional orphans pruned: `SEED_CHECK_IN_LOG`, `useUpdateRugNotes`,
  `seedEstimateReminderCadence`, `safeMutation`,
  `isObservabilityEnabled`. `computeNextDailyAnchorInEastern` and
  `CLEANING_SERVICE_MINIMUM` demoted to module-private.

## Database migrations authored (not yet applied)

Both files live in `supabase/migrations/`. They're commit-safe and will
run in sequence whenever you next run `supabase db push` on staging;
the notes below flag the specific behavior changes to verify before
promoting to prod.

### `20260420120000_enforce_workflow_status_transitions.sql`

Mirrors `src/lib/workflow-guards.ts` as BEFORE UPDATE triggers on
`pickup_requests`, `estimates`, and `route_stops`. Illegal transitions
(e.g. `pending` → `completed` on a pickup request) raise
`check_violation`. NEW.status identical to OLD.status is a no-op, so
unrelated column updates are unaffected.

**Verify before merging:**

- Run the existing critical-journey + workflow test suites against
  staging with the trigger installed. Expect zero failures — the app
  already obeys the client-side guards.
- Gate any ops scripts that correct bad data; they'll need to clear
  the trigger (`ALTER TABLE ... DISABLE TRIGGER`) or route through an
  RPC with `SECURITY DEFINER`.

### `20260420120500_add_workflow_audit_log.sql`

Adds `workflow_audit_log` (append-only) and AFTER triggers on `rugs`,
`invoices`, `estimates`, `route_stops`, and `pickup_requests`. Every
row-level change is captured as `(actor_id, table, entity_id, action,
row_before, row_after)`. Read access is restricted to `admin` / `office`
via RLS; UPDATE and DELETE are forbidden.

**Verify before merging:**

- Confirm disk/IO budget: 5 tables × average edit volume. The current
  data volume is small enough that this should be fine, but keep an
  eye on `pg_total_relation_size('public.workflow_audit_log')` during
  the first week.
- Archival policy: there is none yet. Add a monthly partition or a
  retention cron if volume grows.

## Environment variables

Two new optional vars are read at startup; both silently no-op when
unset, so nothing breaks in local / CI without them.

| Variable              | Purpose                                   |
|-----------------------|-------------------------------------------|
| `VITE_SENTRY_DSN`     | Enables Sentry error reporting.           |
| `VITE_APP_RELEASE`    | Tags Sentry events with a release string. |

## Not done (explicit scope choices)

- **Integer-cents data migration.** Helpers exist and are tested, but
  the DB still stores dollar-denominated floats. A data migration +
  backfill needs to run on staging under your supervision; the helper
  module lets us migrate call-site-by-call-site without a big-bang
  change.
- **React Query migration of the ~30 manual-fetch hooks.** Too invasive
  for a single PR; needs per-hook review.
- **Mass Tailwind class reorder.** `prettier-plugin-tailwindcss` is
  installed and will kick in on any touched file; a repo-wide
  reformat would bury the real review signal in this PR.
- **`event_dedup` table.** The existing `ingest-stop-events` edge
  function already dedupes on `offline_event_id` against the
  `route_stop_events` table (see
  `supabase/functions/ingest-stop-events/index.ts:146-178`). No new
  idempotency infrastructure was needed — the earlier audit was
  partially wrong on this point.
