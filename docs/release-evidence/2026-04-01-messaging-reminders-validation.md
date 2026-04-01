# Release Evidence — 2026-04-01 Messaging + Reminder Validation

## Scope
This evidence note captures the current validation state after shipping:
- shared message threads / office inbox / portal messages
- deep-link thread navigation from estimate/invoice surfaces
- thread lifecycle controls and filters
- reminder cadence scheduling, delivery, and thread reflection

## Code-level verification completed
- `npm run build` passes after each major slice and on final review pass
- `npm run test -- notification-cadence.test.ts thread-lifecycle.test.ts billing.test.ts` passes in local review flow
- Shared UI mounts confirmed in code:
  - `src/pages/Operations.tsx` mounts `InboxTab`
  - `src/pages/WholesalePortal.tsx` mounts `PortalMessagesTab`
- Sidebar/navigation alignment confirmed:
  - Operations sidebar includes Inbox
  - Portal sidebar includes Messages
  - Mission Control label present for admin/superadmin-style nav
- Reminder processor edge function registered in `supabase/config.toml`

## Repo-level evidence
Relevant commits in this workstream:
- `59cfd92` Add office inbox tab backed by message threads
- `0d5c19a` Add shared portal messaging tab
- `749264b` Polish shared messaging threads and update status
- `ae3f1b1` Add deep links into shared message threads
- `59bc576` Add portal shortcuts into shared message threads
- `e9b7522` Sync sidebar navigation with messaging workflow
- `2dd5d5c` Grant admin users mission control privileges
- `192e657` Add reminder cadence scheduling and processing
- `d408ec7` Finish reminder cadence seeding workflow
- `87922b8` Complete reminder delivery path and thread reflection
- `afb59b7` Register reminder cadence edge function
- `5f79103` Add thread lifecycle controls and inbox filters

## What is validated locally
- Messaging/inbox surfaces are mounted and interactive in code
- Thread creation, reply, deep-link, unread derivation, filtering, and lifecycle controls compile successfully
- Reminder cadence rules and lifecycle helpers have focused automated test coverage
- Reminder cadence processing path now logs communication events and reflects system messages into threads

## What still requires live environment validation
These items require real environment credentials/secrets or deployed scheduler execution:
- production/staging invocation of `process-notification-cadence`
- live provider delivery success path using configured `RESEND_API_KEY`
- actual cron/scheduler execution for reminder cadence
- production smoke pass proving company-scope consistency triggers are active on the live project
- click-through UAT on office + portal messaging surfaces after deployment

## Recommended next live checks
1. Deploy edge functions and frontend using the release runbook order.
2. Run:
   - `./scripts/company-scope-column-smoke.sh`
   - `./scripts/invoice-authenticated-smoke.sh`
   - `./scripts/staging-smoke-test.sh`
   - `./scripts/rls-scope-smoke-test.sh`
3. Invoke `process-notification-cadence` in staging with real env/secrets.
4. Verify reminder rows transition correctly on success/failure.
5. Capture screenshots or logs for:
   - Operations Inbox
   - Portal Messages
   - reminder cadence card
   - reminder processor run result

## Honest gate status
- Code/workflow state: substantially validated
- Production truth state: still needs live smoke evidence
- Release confidence: improved, but not fully proven until live checks are executed
