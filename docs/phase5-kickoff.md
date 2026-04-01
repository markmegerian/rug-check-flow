# Phase 5 Kickoff (Post-Phase 4 Launch Track)

Phase 5 starts immediately after Phase 4 completion and focuses on **operational clarity + proactive workflow management**.

## Objective

Give office/admin teams a live operational pulse without reintroducing noisy shortcut UI.

## Shipped in Phase 5 kickoff

- Added a new Mission Control panel: **Operational reminders & updates**.
- Panel is role-scoped by existing RLS and displays:
  - estimates waiting more than 3 days,
  - pickup requests stale for more than 3 days,
  - overdue invoice count,
  - recent client activity events (estimate approvals/rejections and invoice PDF views).
- Added a manual refresh action for operators during active dispatch windows.

## Next recommended Phase 5 items

1. Keep live scheduler/cron wiring for reminder cadence active in each environment.
2. Capture production release evidence for messaging + reminder execution after each meaningful promote.
3. Add thread ownership/search/templates if office throughput requires it.
4. Continue leadership reporting / trend snapshots alongside the newer thread-based reminder flow.

## Progress update

- ✅ Wholesale portal now includes first-login onboarding with guided steps across Rugs, Pickups, Estimates, and Invoices.
- ✅ Onboarding completion is persisted server-side via `portal_users.onboarding_completed_at` and `mark_portal_onboarding_complete()`.
- ✅ Reminder cards now deep-link into Office tabs with pre-applied reminder filters (`tab`, `status`, `minAgeDays`).
- ✅ SLA aging bands are shown on each reminder card (3-4d, 5-6d, 7+d) with severity styling.
- ✅ Notification delivery layer added via `operational-alerts` edge function (Slack + email providers when configured).
- ✅ Day-over-day trend snapshots are displayed in Mission Control for leadership visibility.
- ✅ Shared message-thread workflow is now mounted across office + portal with Inbox / Messages surfaces, entity-aware deep links, thread lifecycle controls, and reminder reflection into threads.
- ✅ Reminder cadence scheduling/delivery now exists in app code and edge-function processing (`process-notification-cadence`), with collections throttling and retry-safe failure handling.
