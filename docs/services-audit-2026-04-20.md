# Services Audit, 2026-04-20

## Why this audit exists

Recent behavior showed that intended service rules are not reliably enforced end to end, especially for the expected "standard cleaning should auto-approve" path. The current implementation relies heavily on service category metadata, which is safe only if the live `services` catalog stays perfectly aligned with frontend and workflow assumptions.

## Current source-of-truth touchpoints found in code

### Service catalog / pricing data reads
- `src/components/facility/CheckInForm.tsx`
  - reads `services(id, name, unit, base_price, preferred_price, vip_price, category)`
  - chooses price column by client tier
  - computes totals by unit (`per sqft`, `per linear ft`, `flat`)
  - applies cleaning minimum through `applyCleaningServiceMinimum(...)`
- `src/components/office/PricingTab.tsx`
  - reads and edits full `services` rows
  - manages `base_price`, `preferred_price`, `vip_price`, `category`, `unit`, `sort_order`, `active`
- `src/components/pricing/ClientPricingDialog.tsx`
  - reads service prices by tier for client-facing pricing views
- `src/components/portal/PortalPricingTab.tsx`
  - reads `id, name, unit, base_price, preferred_price, vip_price`

### Approval / workflow behavior
- `src/lib/rug-service-approval.ts`
  - default approval for inserted rug service rows is:
    - `approved` if `isCleaningCategory(category)`
    - otherwise `pending`
- `supabase/functions/check-in-workflow/index.ts`
  - fetches `services(id, category, requires_estimate)`
  - writes `rug_services.approval_status` as:
    - `approved` if category is cleaning
    - otherwise `pending`
  - estimate creation is gated by:
    - `requires_estimate && !isCleaningCategory(category)`
- `supabase/functions/estimate-workflow/index.ts`
  - persists `service_category` onto estimate items from current service category lookup

### Invoice generation / pricing enforcement
- `src/components/office/InvoiceCreateSheet.tsx`
  - uses stored `rug_services.line_total`
  - reapplies cleaning minimum using joined service category
- `src/components/facility/InvoiceGeneratorPanel.tsx`
  - reapplies cleaning minimum using category lookup
- `supabase/functions/generate-invoice-workflow/index.ts`
  - also reapplies cleaning minimum based on service category
- `supabase/functions/invoice-pdf/index.ts`
  - uses service category to classify cleaning lines for presentation

### Portal behavior
- `src/components/portal/PortalEstimatesTab.tsx`
- `src/components/portal/PortalRugDetailPanel.tsx`
  - both use `service_category` to distinguish cleaning from non-cleaning items

## Current calculation rules found in code

### Pricing units
- `per sqft`
  - `unit_price * (length * width)`
- `per linear ft`
  - `unit_price * selected edge linear footage`
- `flat`
  - currently uses manually entered amount in Check In

### Price tier selection
- standard clients -> `base_price`
- preferred clients -> `preferred_price`
- vip clients -> `vip_price`

### Cleaning minimum
- `src/lib/service-pricing.ts`
- duplicated in `supabase/functions/generate-invoice-workflow/index.ts`
- current minimum is `35`
- applied when category resolves to `Cleaning`

## Risks / mismatches identified

1. **Cleaning behavior is metadata-driven in too many places**
   - Approval, estimate gating, pricing minimums, invoice rendering, and portal behavior all depend on category lookup succeeding and matching exactly `Cleaning`.

2. **Standard Wash behavior is not explicitly canonicalized in workflows**
   - The frontend fast path is built around `STANDARD_WASH_SERVICE_NAME = "Standard Wash"`.
   - Backend approval currently does not explicitly special-case the standard-clean-only path. It infers approval from category metadata.

3. **Frontend assumptions may drift from the live service catalog**
   - The codebase includes local/static service examples in `src/data/services.ts`, but live operational behavior uses DB `services` rows.
   - If names, categories, units, or active rows differ live, behavior can silently drift.

4. **Pricing logic is duplicated across frontend and backend**
   - Cleaning minimum behavior appears in both frontend and backend flows.
   - This is acceptable only if both stay intentionally synchronized and audited.

5. **Flat-price handling deserves explicit review**
   - In Check In, `flat` services currently rely on manual entered amounts instead of defaulting to DB price.
   - This may be intended for some services, but it should be catalog-driven and documented instead of implicit.

## Recommended next actions

1. Pull and review the live `services` table under authenticated/admin context:
   - `id, name, category, unit, base_price, preferred_price, vip_price, requires_estimate, active, sort_order`
2. Compare live rows against operational expectations, especially:
   - `Standard Wash`
   - all cleaning-category services
   - any flat-price services
   - any services that require estimate approval
3. Define and implement a canonical rule for standard-clean-only auto-approval that does not depend solely on category lookup.
4. Decide whether service behavior should be driven by:
   - category only, or
   - explicit service flags/behavior fields for approval/minimum/estimate rules.
5. Consolidate and document the canonical pricing/approval model so future changes do not drift.
