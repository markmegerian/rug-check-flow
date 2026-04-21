# Platform Workflow Implementation Sequence - 2026-04-21

## Purpose

This document converts the workflow surface review pack into a concrete implementation sequence.

It is not just a design memo.
It is the execution order for rebuilding the platform around clearer worker/client intent while preserving the backend and live data model.

## Ground rules

1. Move in priority order.
2. Do not redesign multiple domains at once.
3. For each domain, separate:
   - attention / queue
   - create / intake
   - management / search / history
   when that split genuinely improves worker clarity.
4. Keep backend truth, company scoping, auth, and live operational semantics intact.
5. Prefer additive route/surface changes over destructive rewrites.
6. Validate each slice for:
   - code correctness
   - UI correctness
   - workflow correctness
   - backend/data alignment
7. Do not continue building a page if its product purpose is still unclear.

## Priority order

1. Check In / Facility workflow
2. Jobs
3. Estimates
4. Invoices
5. Driver portal
6. Wholesale client portal

Office Inbox is deferred and should not consume launch-phase effort.

## Domain-by-domain implementation sequence

## 1. Check In / Facility workflow

### Current judgment
- Check-In is the strongest launch-critical workflow and already directionally correct.
- It should remain a focused intake surface.
- Facility should not become a giant mixed workspace.

### Existing surfaces
- `src/pages/CheckIn.tsx`
- `src/components/facility/CheckInLayout.tsx`
- `src/components/facility/CheckInForm.tsx`
- `src/components/facility/PendingRugsPanel.tsx`
- `src/components/facility/RugSearchDialog.tsx`
- `src/components/facility/RugDetailSheet.tsx`
- `src/components/facility/DeliveryPrepTab.tsx`
- `src/components/facility/ProductionBoard.tsx`
- `src/components/facility/InvoiceGeneratorPanel.tsx`

### Target model
- **Check-In / Intake** remains dedicated
- **Search / inspect support** remains lightweight
- **Delivery Prep** stays narrow
- **Production** is reviewed later for simplification
- **Invoice Generator** is preserved as a workflow idea but later reframed as Create Invoice

### First implementation slice
- protect the current dedicated Check-In route and avoid re-mixing it into broader facility workspace clutter
- review current Facility route/navigation wording so workers clearly understand the difference between:
  - Check-In
  - Production
  - Delivery Prep
- identify any remaining Check-In surface elements that still feel like management/history clutter instead of intake support

### Exit condition for this domain slice
- the Check-In product purpose is explicit and protected
- facility navigation no longer suggests a giant mixed workspace model
- no new clutter is introduced into intake

## 2. Jobs

### Current judgment
- grouped Jobs context is useful
- the page is still doing both queue work and maintenance/editor work
- long-term direction is likely:
  - **Jobs Attention**
  - **Jobs Management**

### Existing surfaces
- `src/components/office/JobsTab.tsx`
- `src/lib/jobs-summary.ts`
- `src/lib/jobs-view.ts`

### Target model
- **Jobs Attention**
  - estimate-open
  - uninvoiced
  - return/follow-up
  - exception/attention work
- **Jobs Management**
  - search by client
  - inspect grouped request/rug context
  - maintenance edits as a secondary action

### First implementation slice
- identify what in `JobsTab` is truly queue-first vs maintenance-only
- define the first split without breaking the backend summary path already in place
- preserve grouped context and search
- demote maintenance editing from the page’s main identity

### Exit condition
- a clear split plan exists between jobs attention and jobs management
- backend summary truth remains intact

## 3. Estimates

### Current judgment
- one giant Estimates page is not workable long-term
- grouped client/company review is right
- review/attention should not be lumped together with general management/history

### Existing surfaces
- `src/components/office/EstimatesTab.tsx`
- `src/lib/estimate-review-groups.ts`
- `src/lib/estimate-group-details.ts`
- `src/lib/estimate-group-actions.ts`
- `src/lib/estimate-send-batches.ts`

### Target model
- **Estimate Attention**
- **Estimate Management**

### First implementation slice
- define which current `EstimatesTab` sections belong to attention vs management
- stop evolving the current page as if it is the final shape
- preserve grouped review logic and backend group primitives as reusable building blocks
- identify what needs a dedicated route/surface split first

### Exit condition
- the current monolithic Estimates page is treated as transitional, not canonical
- grouped review primitives are preserved for the future attention surface

## 4. Invoices

### Current judgment
- invoice creation and invoice management should be separate
- invoice creation should be search-first and client-centered
- invoice management should be client-centered history/lookup

### Existing surfaces
- `src/components/facility/InvoiceGeneratorPanel.tsx`
- `src/components/office/InvoicesTab.tsx`
- `src/components/office/InvoiceCreateSheet.tsx`

### Target model
- **Create Invoice**
- **Invoice Management**

### First implementation slice
- identify the correct long-term home for Create Invoice without changing the valid workflow itself
- identify what in `InvoicesTab` belongs in management vs creation
- protect the client-search -> invoice-eligible-rugs -> create flow

### Exit condition
- create vs management responsibilities are clearly mapped
- no future work continues to reinforce the giant all-in-one invoice page as canonical

## 5. Driver portal

### Current judgment
- this is already one of the clearer workflow surfaces
- keep it narrow and reliable
- protect simplicity rather than over-expanding it

### Existing surfaces
- `src/components/driver/TruckLoadingView.tsx`
- related driver execution surfaces elsewhere in the route tree

### Target model
- tightly focused loading / route execution workflows

### First implementation slice
- verify whether loading and in-route execution need clearer separation
- preserve idempotent add-to-truck behavior
- avoid management/dashboard creep

### Exit condition
- no unnecessary expansion of driver workflow complexity

## 6. Wholesale client portal

### Current judgment
- keep it client-simple
- do not mirror internal complexity
- messaging can remain secondary if not launch-critical

### Existing surfaces
- `src/pages/WholesalePortal.tsx`
- `src/components/portal/PortalEstimatesTab.tsx`
- `src/components/portal/PortalInvoicesTab.tsx`
- related portal tabs

### Target model
- simple client-facing account/product experience
- clear review/pay/self-service functions

### First implementation slice
- ensure portal estimates stay client-decision-oriented
- ensure portal invoices stay client-readable and payment-oriented
- keep portal tabs from inheriting internal system clutter

### Exit condition
- portal stays client-centered rather than internal-system-shaped

## Immediate next execution sequence

The next actual work order should be:

1. tighten the Facility / Check-In product boundary and route model
2. define the Jobs attention vs management split using existing grouped backend summary foundations
3. define the Estimates attention vs management split using existing grouped backend primitives
4. define Create Invoice vs Invoice Management split using current invoice generator and invoice page behavior

## What not to do next

- do not keep patching the current Estimates page as though it will remain the final product
- do not keep growing the current Invoices page as one giant management surface
- do not reintroduce office inbox priority before launch-critical workflows are stable
- do not mix multiple domain rebuilds into one implementation slice

## Current recommendation

Start implementation work by tightening the Check-In / Facility boundary first, because it is the highest-priority live workflow and the clearest place to preserve the right product shape before more complexity accumulates.
