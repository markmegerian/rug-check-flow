# Services / Pricing Consolidation Slice 01 - 2026-04-21

## Scope

This is the first concrete implementation slice for backend consolidation.

Goal of slice 01:
- identify the exact currently active service/pricing truth
- identify every live codepath depending on it
- define the first additive DB change required before rewriting behavior
- verify that current code, schema, and workflow assumptions line up with that change

This slice is intentionally diagnosis-first.
No schema rewrite is being forced until the first additive change is precise.

## What is actually active right now

### Active canonical-ish table in current app code
The app and active workflows currently use `public.services`, not `company_enabled_services`, for live catalog behavior.

Evidence:
- `src/components/facility/CheckInForm.tsx`
- `src/components/office/PricingTab.tsx`
- `src/components/portal/PortalPricingTab.tsx`
- `src/components/pricing/ClientPricingDialog.tsx`
- `supabase/functions/check-in-workflow/index.ts`
- `supabase/functions/estimate-workflow/index.ts`
- `supabase/functions/generate-invoice-workflow/index.ts`
- `supabase/functions/invoice-pdf/index.ts`
- `supabase/functions/checkout-delivery/index.ts`

### Current active `services` shape
From generated types, `services` currently includes:
- `id`
- `name`
- `unit`
- `base_price`
- `preferred_price`
- `vip_price`
- `category`
- `requires_estimate`
- `active`
- `sort_order`
- timestamps

### Operational implication
That means the real live app is already centered on the newer `services` table, not the older `company_enabled_services` / `company_service_prices` pair.

That is important because it sharpens the first consolidation target:

**the first consolidation move should strengthen `public.services` as the canonical catalog, not introduce a parallel replacement immediately.**

## What is still muddy

Even with `services` as the active catalog, the system still has structural problems:

### 1. `rug_services` is only a partial snapshot
It currently stores:
- `service_id`
- `service_name`
- `unit_price`
- `line_total`
- `approval_status`
- `edges`

But it does **not** store the service category, pricing model/unit, or whether the estimate/approval semantics came from the catalog at the time of capture.

That means downstream invoice/estimate logic still re-queries `services` by `service_id` to recover category meaning.

### 2. Category truth is still queried repeatedly downstream
Current downstream code repeatedly fetches `services.id, category` to decide:
- cleaning minimum application
- approval defaults
- estimate-required behavior
- invoice rendering/labels

### 3. Check In still uses alias heuristics for standard clean resolution
This was the right defensive move short-term, but it is still a sign that the catalog model is not yet explicit enough operationally.

### 4. Legacy tables still exist nearby
`company_enabled_services`, `company_service_prices`, `declined_services`, and `price_overrides` still exist in schema history and muddy understanding, even if they are not the primary live app path.

## First additive DB change required

The first proper additive schema change should be:

### Add service snapshot fields to `rug_services`
Add columns:
- `service_category text`
- `service_unit text`
- `requires_estimate boolean`

Optional but useful:
- `catalog_base_price numeric`
- `catalog_preferred_price numeric`
- `catalog_vip_price numeric`

## Why this is the right first change

Because it improves the current live architecture without risky replacement:

- Check In already writes `rug_services`
- estimates already derive from `rug_services`
- invoices already derive from `rug_services`
- PDF rendering already derives from `rug_services`
- delivery checkout already derives from `rug_services`

So strengthening `rug_services` as a better snapshot is the smallest reversible professional move.

## What this first change would unlock

Once `rug_services` carries category/unit/estimate-required snapshot fields:

- estimate generation can stop re-querying `services` just to recover category
- invoice generation can stop re-querying `services` just to recover cleaning status
- PDF generation can stop re-querying `services` for label semantics
- delivery checkout can stop re-querying `services` for cleaning logic
- approval logic becomes less vulnerable to later catalog drift

## Current codepaths that will need follow-up after the migration

### Direct reads of `services` category/estimate semantics to replace or reduce
- `src/lib/rug-service-approval.ts`
- `supabase/functions/check-in-workflow/index.ts`
- `supabase/functions/estimate-workflow/index.ts`
- `supabase/functions/generate-invoice-workflow/index.ts`
- `supabase/functions/invoice-pdf/index.ts`
- `supabase/functions/checkout-delivery/index.ts`
- `src/components/office/InvoiceCreateSheet.tsx`
- `src/components/facility/InvoiceGeneratorPanel.tsx`

### UI catalog reads that should remain
These should still read `services` directly because they are working against the live catalog, not historical snapshots:
- `src/components/office/PricingTab.tsx`
- `src/components/facility/CheckInForm.tsx`
- `src/components/portal/PortalPricingTab.tsx`
- `src/components/pricing/ClientPricingDialog.tsx`

## Verification of slice 01 conclusion

### Schema truth check
Verified from `src/integrations/supabase/types.ts` that `services` already contains the active catalog fields the app is using.

### Code wiring check
Verified by grep/read that major active workflows and UI surfaces reference `public.services` directly.

### Architectural check
This means the next implementation should **not** start by swapping the catalog table.
It should start by making `rug_services` a stronger historical snapshot layer around the existing active `services` table.

## Final conclusion of slice 01

The first implementation slice is now precise:

### Do next
Add service snapshot semantics to `rug_services` and cut downstream workflow logic over to those snapshot fields.

### Do not do next
- do not replace `services` immediately
- do not invent a second parallel catalog table now
- do not start with estimate/invoice rewrites before snapshot semantics are improved

This is the smallest reversible backend consolidation slice that improves correctness across Check In, estimates, invoices, PDFs, and delivery flows at once.
