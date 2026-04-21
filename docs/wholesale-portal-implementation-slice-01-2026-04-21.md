# Wholesale Portal Implementation Slice 01 - 2026-04-21

## Purpose

This document defines the first concrete implementation slice for the wholesale client portal.

The portal is not primarily a workflow-splitting problem like the internal office surfaces.
It is mainly a **clarity and scope-control** problem.

## Current code reality checked

Reviewed against:
- `src/pages/WholesalePortal.tsx`
- `src/components/portal/PortalEstimatesTab.tsx`
- `src/components/portal/PortalInvoicesTab.tsx`
- `docs/wholesale-client-portal-workflow-surface-review-2026-04-21.md`

## Current portal responsibilities in code

### 1. Account shell / navigation
Present through:
- `WholesalePortal.tsx`
- tabbed portal shell
- `PortalAccountSnapshot`
- onboarding/password reset

### 2. Portal estimates
Present through:
- estimate list
- line-item approve/reject flow
- client decision note
- status updates
- estimate message thread open action

### 3. Portal invoices
Present through:
- billing summary
- invoice list
- line items
- payment attempt history
- PDF download
- message thread open action

## Judgment after code review

The portal shell itself is acceptable.
The main requirement is to prevent internal operational complexity from leaking into the client experience.

The most important rule remains:
- portal estimates should read as **client decision**
- portal invoices should read as **client billing and payment history**
- messaging should stay secondary unless needed

## What should not change yet

This slice should **not**:
- redesign the entire portal shell
- remove tabs entirely
- mirror internal workflow states more deeply
- broaden messages into a major product effort
- add internal operations concepts to client-facing pages

## Smallest safe product move

The smallest professional move is a **client-intent hierarchy pass**.

## Slice 01 recommendation

### Step A. Strengthen client-facing page identity in the shell
The portal should read more like:
- account overview
- rugs and pickups
- estimates to review
- invoices and billing
- messages if needed

and less like an internal tab matrix.

### Step B. Reframe portal estimates around client action
Portal estimates should read explicitly as:
- items waiting for your review
- approve or reject clearly
- contact us if you have questions

not as internal estimate lifecycle management.

### Step C. Reframe portal invoices around billing clarity
Portal invoices should read explicitly as:
- invoices and balances
- due / overdue context
- payment attempt visibility where relevant
- download and contact options

not as an internal finance operations panel.

## Proposed target shape for Slice 01

### Portal shell
- keep tab structure
- keep account snapshot important
- keep wording client-centered

### Portal estimates
- emphasize client decision role
- keep internal workflow details secondary or hidden

### Portal invoices
- emphasize billing clarity and payment context
- keep accounting-system feel minimized

## Explicit boundary for this slice

This slice is **not yet**:
- a portal route rewrite
- a messaging redesign
- a backend portal model rewrite

It is a wording/hierarchy correction only.

## Validation standard for this slice

If implemented, validate:
1. portal routing still works
2. portal estimates still allow client decisions
3. portal invoices still load, expand, and download normally
4. portal billing summary still works
5. the portal reads more clearly as a client-facing product
6. no layout instability is introduced

## Recommendation

Implement Wholesale Portal slice 01 as a careful client-intent wording and hierarchy pass only.
Keep it simple.
Do not let internal complexity leak into the portal.
