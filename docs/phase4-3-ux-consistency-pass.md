# Phase 4.3 — UX Consistency Pass

## Goal
Standardize empty states, loading states, and actionable error copy across role-specific workflows.

## Consistency standards

### 1) Loading states
- Use clear role-context language in loading text (`Loading pickup requests…`, `Loading estimates…`).
- Keep loading copy short and non-technical.
- Prefer per-tab loading feedback over blank screens.

### 2) Empty states
- Explain why the view is empty.
- Distinguish "no records yet" vs "filtered to zero results".
- Include what the user can do next (create request, clear filter, refresh).

### 3) Error copy
- Keep failures actionable: say what failed + suggested next step.
- Avoid raw internal errors unless useful for debugging in admin/ops contexts.
- Use role-appropriate wording (portal customer vs office staff vs driver).

## Pass checklist by role

| Role surface | Loading states | Empty states | Actionable errors | Status |
|---|---|---|---|---|
| Portal (`PortalEstimatesTab`, `PortalPickupsTab`, `PortalInvoicesTab`, `PortalRugsTab`) | Reviewed | Reviewed | Reviewed | ✅ |
| Office (`EstimatesTab`, `PickupRequestsTab`, `InvoicesTab`, `ClientsTab`) | Reviewed | Reviewed | Reviewed | ✅ |
| Facility check-in (`CheckInLayout`) | Reviewed | Reviewed | Reviewed | ✅ |
| Driver workflow (`DriverPortal`) | Reviewed | Reviewed | Reviewed | ✅ |

## Exit criteria
Phase 4.3 is complete when:
1. Each primary role surface has explicit loading/empty/error behavior.
2. Messaging tone is consistent and non-ambiguous.
3. No critical path has silent failure or blank-state dead ends.

## Current status
**Complete** for baseline UX consistency pass.
Remaining polish items are tracked under Phase 4.4 regression stabilization.
