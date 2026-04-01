# Operator Notes — Messaging + Reminder Workflow

## What now exists
The platform now has a shared conversation model for office and portal users:
- Office: `Operations -> Inbox`
- Portal: `Portal -> Messages`

Threads are shared across both surfaces and may be:
- `general`
- `estimate`
- `invoice`

Reminder cadence is also attached to this workflow. Automated reminder sends:
- are scheduled in `notification_cadence`
- are processed by `process-notification-cadence`
- log to `communication_events`
- reflect into shared threads as system messages

## Operator controls
### Office
- Open `Operations -> Inbox` to review client threads
- Filter by status (`active`, `closed`, `archived`) and unread state
- Use Close / Archive / Reopen on a selected thread

### Portal
- Clients can open `Portal -> Messages`
- Clients can message directly from estimate/invoice context

### Reminder processing
- Mission Control / office can trigger reminder processing manually from:
  - `Operational reminders & updates`
  - button: `Process reminder cadence`

## Important behavior
- Collections reminders are throttled to max one automated send per client per 72 hours
- Failed reminder deliveries are not marked sent and remain retryable
- Automated reminder messages appear in the relevant shared thread as system messages

## Live-environment requirement
The repo now contains the reminder processor and supports two invocation modes:
- manual office/admin invocation via authenticated UI
- scheduler/service invocation via `x-cron-secret` matching `PROCESS_NOTIFICATION_CADENCE_SECRET`

Automatic execution still depends on deployed scheduler/cron wiring.

You must verify in each environment:
- edge function deployment
- provider secret configuration (for example `RESEND_API_KEY`)
- scheduler/cron execution path
- `PROCESS_NOTIFICATION_CADENCE_SECRET` configuration for machine-triggered runs

## Recommended smoke checks after deploy
1. Open Office Inbox and confirm threads load.
2. Open Portal Messages and confirm messages load.
3. Send a manual office reply and confirm it persists.
4. Trigger `Process reminder cadence`.
5. Confirm:
   - communication event logged
   - thread system message added
   - failed deliveries remain retryable

## Current source-of-truth docs
- `docs/platform-1.0-status.md`
- `docs/release-evidence/2026-04-01-messaging-reminders-validation.md`
- `docs/release-evidence/2026-04-01-final-regression-qa.md`
