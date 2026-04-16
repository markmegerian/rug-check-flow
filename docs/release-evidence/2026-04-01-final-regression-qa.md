# Final Regression / Release QA — 2026-04-01

## 2026-04-16 prod addendum, invoice generator UI
- Live environment: `https://mr.rugboost.com`
- Operator account: `codex@gpt.com`
- UI path: `/ops?tab=invoice-generator`
- Controlled smoke prep:
  - client: `test` (`83c9b68d-d497-4058-b076-b3c461ac054a`)
  - rug: `INVUI-303211` (`200fd393-521b-4658-9f28-4609274079ff`)
  - prep method: created via `check-in-workflow` with one cleaning service (`Standard Wash`, $35), then status updated to `ready`
- UI observed before submit:
  - selected client `test`
  - message `1 uninvoiced ready rug available for handoff`
  - rug row `INVUI-303211`, status `ready`, total `$35.00`
  - CTA label `Generate Handoff Invoice`
- Workflow result:
  - HTTP 200 from `generate-invoice-workflow`
  - invoice id `60c23c3d-b06a-4072-a10a-4617d50f8190`
  - invoice number `INV-MO23T19B`
  - total `$35.00`
  - rug count `1`
- UI observed after submit:
  - success toast `Handoff invoice generated`
  - toast detail `INV-MO23T19B — $35.00 for 1 ready rug(s). Pickup handoff remains a separate action.`
  - empty state `No uninvoiced ready rugs are available for handoff for this client.`

## Scope
This checklist captures the regression and QA expectations after shipping the messaging + reminder workflow workstream.

## Automated checks completed in repo
- `npm run test -- notification-cadence.test.ts thread-lifecycle.test.ts critical-journeys.acceptance.test.ts billing.test.ts`
- `npm run build`

## Regression checklist
### Office workflows
- [x] Operations page mounts Inbox tab
- [x] Estimates surface exposes Open thread action
- [x] Invoices surface exposes Thread action
- [x] Client detail shows reminder cadence card
- [x] Operational reminders panel exposes Process reminder cadence action

### Portal workflows
- [x] Portal page mounts Messages tab
- [x] Portal estimates expose Message office / Message action
- [x] Portal invoices expose Message / Message office action
- [x] Portal thread deep-linking via `threadId` is wired

### Messaging workflow
- [x] Shared thread model used across office and portal
- [x] Deep-link/open-or-create thread helpers present
- [x] Unread derivation logic present
- [x] Close/archive/reopen controls present
- [x] Filtering by status/unread present
- [x] Reminder sends reflect into thread messages as system messages

### Reminder workflow
- [x] Estimate cadence implemented
- [x] Invoice cadence implemented
- [x] 72h collections throttle implemented
- [x] Due processor exists
- [x] Delivery failures remain retryable
- [x] Reminder sends log communication events

## Still requires live execution
These remain manual/live validation items, not code-level uncertainty:
- [ ] Click-through on deployed office Inbox UI
- [ ] Click-through on deployed portal Messages UI
- [x] Live invocation of `process-notification-cadence`
- [ ] Delivery success path with configured provider secrets
- [x] Scheduler/cron execution proof using `PROCESS_NOTIFICATION_CADENCE_SECRET`
- [ ] Production/staging smoke script outputs attached
- [ ] Confirm refresh/polling behavior is acceptable in live messaging sessions

## Release QA conclusion
- Code-level regression coverage: materially improved and explicit
- Build/test gate: green
- Remaining release QA risk: live environment execution evidence, not missing application wiring
