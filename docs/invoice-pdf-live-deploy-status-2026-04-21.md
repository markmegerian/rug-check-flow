# Invoice PDF Live Deploy Status - 2026-04-21

## Scope

Record the live deployment state for the latest `invoice-pdf` fix.

## Fix deployed

Latest pushed fix:
- `093e3ad fix: load invoice company context for pdf generation`

Deployed to project:
- `toitgmaeuscrdwbpntda`

## Live function version

Verified with `supabase functions list`:
- function: `invoice-pdf`
- version: `23`
- updated at: `2026-04-21 20:10:30 UTC`

## What changed in this deploy

The deployed fix corrects a real invoice-PDF context bug:
- invoice lookup now selects `company_id`
- invoice flow now reads `invoice.company_id` directly
- company branding/context resolution no longer depends on a missing field in the invoice branch

## Current verification ceiling

From this session, we can truthfully confirm:
- the fix is deployed live
- the live `invoice-pdf` function version advanced after deploy

From this session, we cannot yet truthfully claim a fully successful user-facing invoice download click path because that would require:
- a valid internal or portal bearer token, or
- a working browser session with the relevant login state

Neither is currently available in this session.

## Current truth

- The latest known real defect in the `invoice-pdf` invoice branch has been fixed and deployed.
- Full end-to-end live download verification remains auth-session-blocked from this environment.
- If invoice download still fails after this deploy, the next investigation must use a real authenticated app/session context rather than more unauthenticated probing.
