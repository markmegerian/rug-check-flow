# Backend Truth Audit Pass 01 - 2026-04-20

## Scope of this pass

This is the first actual backend truth pass using the current typed schema and live workflow code, not planning templates.

Files inspected directly for this pass:

- `src/integrations/supabase/types.ts`
- `src/integrations/supabase/extended.ts`
- `supabase/functions/check-in-workflow/index.ts`
- `supabase/functions/estimate-workflow/index.ts`
- `supabase/functions/generate-invoice-workflow/index.ts`
- `src/components/office/InboxTab.tsx`
- `src/components/office/InvoicesTab.tsx`
- `src/components/office/JobsTab.tsx`
- `src/components/facility/CheckInLayout.tsx`
- `src/components/facility/CheckInForm.tsx`

## Headline conclusion

The database is not a clean canonical model today.
It is a mixed system with at least two overlapping eras of business modeling:

1. a newer estimate/invoice model centered on `rug_id`, `client_id`, `estimate_items`, `invoice_items`, `communication_events`, and explicit workflow edge functions
2. an older or parallel estimate model still present in the generated schema where `estimates` are tied to `inspection_id`, `job_id`, and a JSON `services` blob

That alone is enough to justify the current reevaluation.

This is not just a frontend cleanliness problem.
The backend truth boundary is genuinely muddy.

## Critical finding 1. Dual estimate models exist

### Evidence
In `src/integrations/supabase/types.ts`, `estimates` appears as:

- `inspection_id`
- `job_id`
- `services: Json`
- `total_amount`
- `approved_by_staff_*`

But in `src/integrations/supabase/extended.ts` and `supabase/functions/estimate-workflow/index.ts`, the active workflow assumes a different model:

- `rug_id`
- `client_id`
- `estimate_number`
- `status`
- `version`
- `total`
- separate `estimate_items`

### Judgment
**Classification:** Dangerous

### Why it matters
This means at least one of the following is true:

- the generated base types are stale relative to the live/app model
- there are overlapping estimate concepts in the database history
- the app is extending around a schema mismatch instead of standing on one clean truth

Any one of those is a serious backend clarity problem.

### Immediate implication
Estimate work must remain classified as **rebuild**, and the backend estimate model must be audited before any serious UI implementation continues.

## Critical finding 2. Services truth is fragmented

### Evidence
In `src/integrations/supabase/types.ts`, `services` is not the rich canonical catalog we would want. The visible base shape inspected here only includes:

- `company_id`
- `service_name`
- `is_enabled`

Meanwhile active workflows rely on more than that:

- `supabase/functions/estimate-workflow/index.ts` reads `services.id, category`
- `supabase/functions/generate-invoice-workflow/index.ts` reads `services.id, category`
- Check In and approval logic rely on category/name semantics
- pricing also appears to involve `company_service_prices`

### Judgment
**Classification:** Dangerous

### Why it matters
The platform currently appears to have service enablement, service pricing, and service categorization spread across more than one place or more than one conceptual layer.

That is exactly the kind of backend muddiness that causes:

- pricing drift
- approval drift
- UI assumptions that stop matching reality
- business logic duplicated in heuristics

### Immediate implication
Services / pricing / approvals remain **audit first, then repair**.
A canonical service model must be defined before broad workflow cleanup can be trusted.

## Critical finding 3. Invoice creation depends on rug readiness plus rug_services snapshots, not a richer invoice domain

### Evidence
`supabase/functions/generate-invoice-workflow/index.ts`:

- requires rugs to already be `status === "ready"`
- rejects rugs that already have `invoice_items`
- builds invoice line items directly from `rug_services`
- applies cleaning minimums via category logic at invoice-generation time
- writes `invoices.status = "draft"`
- records a `communication_events` row as an operational side effect

### Judgment
**Classification:** Salvageable but muddy

### Why it matters
This invoice path is not irredeemable, but it shows a backend model where invoicing is still tightly coupled to operational rug-service snapshots and category heuristics.

That can work, but it is not a fully clean financial model yet.

Specific concerns:

- invoice totals are derived at creation time from operational service rows
- cleaning minimums are enforced in the workflow function rather than clearly in one pricing truth layer
- the invoice record carries multiple money fields in schema (`subtotal`, `tax`, `total`, `total_amount`, `balance`, `balance_due`) and this pass has not yet proven which are canonical

### Immediate implication
Invoices remain **audit first**. The current invoice workflow may be repairable, but it is not yet trustworthy enough to declare clean.

## Critical finding 4. Communication events are trying to do too much

### Evidence
`communication_events` includes optional foreign keys to:

- `client_id`
- `rug_id`
- `estimate_id`
- `invoice_id`

and also stores:

- `channel`
- `direction`
- `event_type`
- `subject`
- `body`
- `sent_to`
- `created_by`

It is written by both estimate and invoice workflows.
At the same time, the app also has `message_threads` and `messages` as a separate communication model.

### Judgment
**Classification:** Audit first

### Why it matters
There are clearly two communication concepts:

1. conversational messaging (`message_threads`, `messages`)
2. business event logging (`communication_events`)

That split is reasonable in theory, but the ownership boundary is not yet clean enough from current evidence.
We need to determine whether `communication_events` is:

- authoritative audit history
- a notification ledger
- a client communication history surface
- or a half-structured catch-all

### Immediate implication
Messaging itself still looks repairable, but communication ownership boundaries need audit before further lifecycle work.

## Critical finding 5. Inbox still contains evidence of quality/control slippage

### Evidence
`src/components/office/InboxTab.tsx` still contains `nextThreads` logic and remains a 600+ line component with:

- direct thread loading
- direct message loading
- local lifecycle derivation
- polling
- composer behavior
- create-thread behavior
- thread status mutation

### Judgment
**Classification:** Repair

### Why it matters
This is not proof of backend corruption by itself, but it is evidence that operational surfaces are still carrying too much responsibility at the component layer.
That increases the chance that backend ambiguity gets papered over in UI code.

### Immediate implication
Messaging remains repairable, but only after clearer backend ownership boundaries are documented.

## Critical finding 6. Check In backend is still business-logic-heavy but comparatively coherent

### Evidence
Active work has already shown `supabase/functions/check-in-workflow/index.ts` as the place where approval behavior and service handling are coordinated.
The function is large, but unlike estimates, it appears to align to one dominant workflow rather than multiple conflicting schema eras.

### Judgment
**Classification:** Salvageable / repair

### Why it matters
Check In still needs live verification and backend cleanup, but it does not currently show the same level of structural ambiguity as the estimate model.
That supports the earlier decision to repair rather than rebuild the backend side of Check In.

## Critical finding 7. Delivery and pickup structures look more coherent than finance/estimates

### Evidence
The inspected typed schema for:

- `delivery_lists`
- `delivery_list_items`
- `pickup_requests`

looks comparatively straightforward:

- explicit parent-child structures
- explicit statuses
- explicit route-day/target-date fields
- direct rug/client relationships

### Judgment
**Classification:** Salvageable / repair

### Why it matters
This is one of the few areas that currently looks like a cleaner operational domain model rather than a layered historical compromise.
That does not prove it is perfect, but it is a better sign than what we are seeing around estimates and invoices.

## Current classification updates after this pass

### Keep, provisional
- route/domain split direction
- additive RPC/read-model strategy
- company scoping as a requirement, not yet as a proven implementation

### Repair
- Check In
- Jobs
- Messaging surface layer
- Delivery Prep
- Driver portal / truck loading
- pickup/delivery operational model

### Rebuild
- Estimates workflow and surrounding office lifecycle

### Audit first
- services / pricing / approvals
- invoices workflow and financial field ownership
- payments / credits
- communication event ownership boundaries
- company / auth / RLS model

### Dangerous findings requiring explicit follow-up
- dual estimate models
- fragmented service truth
- invoice money-field ownership not yet canonical

## What this changes operationally

This pass strengthens three decisions:

1. **Estimates absolutely should not be patched forward casually.** They need canonical model definition and likely full workflow rebuild.
2. **Services/pricing/approval truth is a backend problem first.** UI cleanup alone will never stabilize that area.
3. **Invoices must be treated as a backend integrity audit track, not just a frontend bug.**

## Next required audit targets

The next proper backend truth passes should focus on:

1. exact estimate schema reality, migrations, and live table shape
2. exact service catalog / company pricing / category ownership model
3. invoice fields, payment relationships, and PDF/auth execution path
4. company/auth/RLS ownership across office, portal, and edge functions

## Working conclusion

The platform is not beyond salvage, but the user's instinct was correct:

**the database and backend model are a bigger structural concern than the frontend alone.**

The most concrete evidence so far is the estimate model mismatch between generated schema and active workflow assumptions.
That is not cosmetic. That is foundational.
