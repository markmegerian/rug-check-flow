# Wholesale Client Portal Workflow Surface Review - 2026-04-21

## Scope

This review covers the current wholesale portal shell and its main client-facing surfaces:
- `src/pages/WholesalePortal.tsx`
- portal rugs
- portal pickups
- portal estimates
- portal invoices
- portal messages
- portal prices

## First judgment

The client portal should not mirror the internal app’s complexity.
It should feel simpler, clearer, and more client-centered than internal operations surfaces.

The portal should answer a small number of client questions well:
- What rugs do I have with you?
- What pickups are happening?
- Do I have an estimate to review?
- Do I have an invoice to pay or review?
- How do I contact you?

## Current shape

The portal currently exposes multiple tabs inside one shell:
- Rugs
n- Pickups
- Estimates
- Invoices
- Messages
- Prices

This is understandable structurally, but it still risks inheriting internal system complexity if each tab becomes too feature-heavy.

## Worker-intent model translated to client intent

Portal design should be organized around client intent rather than internal workflow state.

## 1. Account Snapshot / Home
Purpose:
- give the client a clear overview
- surface what needs attention now
- reduce the need to hunt across tabs

This is already directionally represented by `PortalAccountSnapshot` and should remain important.

## 2. View Rugs / Account Status
Purpose:
- see rugs and their status
- understand what is in progress / ready / completed

## 3. Pickups
Purpose:
- request or review pickup context
- understand upcoming pickup-related activity

## 4. Estimates
Purpose:
- review estimate items needing client decision
- approve or reject clearly
- understand what the estimate is for

### Important note
Portal Estimates should stay focused on client action, not mirror internal estimate management.

## 5. Invoices
Purpose:
- see invoices
- understand balance status
- inspect invoice contents
- download invoice
- review payment attempt history where relevant

### Important note
Portal Invoices should stay focused on client understanding and payment context, not internal finance operations.

## 6. Messages
Purpose:
- contact the business
- follow ongoing communication threads

### Launch note
If messaging is not required for launch, this area can remain secondary rather than consuming major design energy now.

## Current judgment by function

## 1. Portal shell with multiple tabs
### Judgment
**Keep, but keep the tabs client-simple.**

### Why
Clients can handle multiple tabs if each tab is clear and purpose-limited.
The risk is not the existence of tabs itself, but internal complexity leaking into them.

## 2. Portal Estimates
### Judgment
**Keep, but narrow to client decision workflow only.**

### Why
Clients should not see the full complexity of internal estimate lifecycle management.
They only need what is relevant to them.

## 3. Portal Invoices
### Judgment
**Keep, but keep it client-readable and payment-oriented.**

### Why
Clients need clarity, not accounting-system density.

## 4. Portal Messages
### Judgment
**Defer if not required for launch.**

### Why
This aligns with the broader decision to avoid over-prioritizing messaging before core operational workflows are stable.

## Launch-priority judgment

### Keep and refine now
- portal account snapshot
- rugs
- pickups
- estimates
- invoices

### Lower priority / defer if needed
- portal messages
- anything that mirrors internal complexity without clear client value

## Preliminary keep / simplify / split / merge / remove summary

- **Portal shell** → Keep
- **Portal account snapshot** → Keep
- **Portal rugs** → Keep
- **Portal pickups** → Keep
- **Portal estimates** → Keep, narrow to client decision role
- **Portal invoices** → Keep, narrow to client payment/history role
- **Portal messages** → Defer if not required for launch
- **Portal prices** → Keep only if it clearly serves a client need and stays simple

## Current conclusion

Wholesale Client Portal should remain a simple client-facing product, not a mirror of internal operations.
Its job is clarity and self-service, not exposing every backend concept.
