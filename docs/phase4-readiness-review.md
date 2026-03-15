# Current State Review + Phase 4 Plan Refresh

## Executive status

As of the latest Phase 3 commit, the project is in a **mixed-live state**:

- **Portal invoices** are live and client-scoped from Supabase.
- **Portal estimates** and **portal pickups** are live but still rely on several `(supabase as any)` call sites.
- **Portal rugs** remain mock-data driven.
- RLS hardening exists for pickups, estimates, invoices, and portal user visibility, but policy style is not yet consistent across phases.

This means we can proceed to Phase 4, but we should treat the first part of Phase 4 as a **stabilization + consistency pass** before adding new feature surface.

---

## Where we are now (codebase-wide functional review)

### 1) Routing and role-gated entry points

- App routes are wired for auth and role-specific surfaces (`/facility/ops`, `/facility/office`, `/portal`, `/driver`, `/admin`).
- `ProtectedRoute` coverage is present, with `/portal` currently accessible to any authenticated user and portal authorization enforced mostly by per-tab data checks.

### 2) Portal area status

- `PortalInvoicesTab` now fetches live invoices and line items by linked portal user and has loading/empty states.
- `PortalEstimatesTab` is live (load + approve/reject), but still uses loose `any` casts in multiple query paths.
- `PortalPickupsTab` is live (request/edit/cancel) but also uses many `any` casts and duplicated portal-user lookup logic.
- `PortalRugsTab` is still entirely mock (`PORTAL_RUGS`).

### 3) Office/driver/admin area status

- Driver workflow and pickup linkage are in place, including assignment and signature-oriented fields at DB level.
- Office screens are mostly live but still contain several `any` casts and ad hoc row shaping.
- Admin panel is still mock-backed (`mock-admin` data), which is acceptable if Phase 4 does not target admin, but should be explicitly tracked.

### 4) Data + policy state

- Migrations show progressive hardening through phases 1-3:
  - pickup request model and RLS,
  - driver pickup workflow,
  - pickup RLS hardening,
  - estimate portal RLS,
  - invoice portal RLS,
  - portal user visibility constraints.
- Policy predicates are functionally aligned to linked portal user access, but implementation patterns differ (some use `auth.jwt()->>'email'`, some join `auth.users`), increasing maintenance risk.

### 5) Quality and maintainability

- Strong improvement in recent phase work (typed rows in selected areas).
- However, `as any` usage is still broad in active business flows, making Phase 4 feature work riskier unless reduced first.
- No broad integration test coverage yet for multi-role RLS behavior (portal vs office vs driver) in CI.

---

## Key risks to address before / during Phase 4

1. **Authorization drift risk**
   - Multiple portal identity resolution patterns (direct email lookup in app code vs `auth.users` joins in SQL policies).

2. **Type-safety regression risk**
   - New feature work on top of `any`-heavy paths can reintroduce runtime-only failures.

3. **Inconsistent portal experience risk**
   - One portal tab (rugs) remains mock while others are live.

4. **Operational confidence risk**
   - Lack of scenario tests validating role isolation and portal scoping end-to-end.

---

## Updated Phase 4 recommendation

## Phase 4A — Stabilization (recommended to do first)

1. **Create shared portal identity resolver**
   - Extract one helper/hook for: current auth user -> active `portal_users` row -> `client_id`.
   - Reuse it in all portal tabs to remove duplicate logic.

2. **Remove `as any` from active portal flows**
   - Prioritize `PortalPickupsTab` and `PortalEstimatesTab`.
   - Use generated Supabase table types + explicit lightweight view models.

3. **Normalize policy style**
   - Pick one identity strategy (prefer JWT email matching or canonical helper function) and align Phase 2/3 policies for consistency.

4. **Convert PortalRugsTab to live data**
   - Replace `mock-portal` rug list with client-scoped Supabase query.
   - Keep current filters/expand UX intact.

## Phase 4B — Feature completion

5. **Invoice delivery artifacts**
   - Wire invoice PDF/download behavior in portal (currently placeholder toast).
   - Define source of truth (storage object path or edge-function generated PDF).

6. **Payments visibility and events**
   - Surface `payment_attempts` timeline/status in portal invoice detail or side panel.
   - Add resilient empty/error states for payment history.

7. **Communication consistency**
   - Ensure portal estimate and invoice actions consistently write communication/audit events.

## Phase 4C — Validation + release hardening

8. **Add role-scoped integration tests**
   - Portal user can only see own client invoices/estimates/pickups/rugs.
   - Driver cannot access unrelated pickup requests.
   - Office/admin retain broader visibility.

9. **Add RLS migration smoke checks**
   - Minimal scripted verification after migrations for core tables (`portal_users`, `invoices`, `invoice_items`, `payment_attempts`, `pickup_requests`).

10. **Performance + UX checks**
   - Verify tab load time on realistic record counts.
   - Add pagination or limits where needed.

---

## Scope decision before implementation

To reduce rework, Phase 4 should be approved as:

- **Must-have**: 4A items 1-4 + 4B item 5.
- **Should-have**: 4B item 6 + 4C item 8.
- **Can-have**: 4B item 7 + 4C items 9-10.

If schedule is tight, ship 4A + invoice download first, then stage payment timeline and deeper test hardening in a 4.1 follow-up.

---

## Progress update

- ✅ `PortalEstimatesTab`, `PortalPickupsTab`, and `PortalRugsTab` now use a shared portal client resolver and typed Supabase access.
- ✅ Remaining portal mock surface for rugs has been removed.
- ✅ Phase 2/3 portal-linked RLS policies are normalized to a single identity style (`lower(auth.jwt() ->> 'email')`) in a Phase 4A migration.

With these changes, **Phase 4A is complete** and the codebase is ready to begin **Phase 4B feature completion**.
