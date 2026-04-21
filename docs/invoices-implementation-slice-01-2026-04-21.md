# Invoices Implementation Slice 01 - 2026-04-21

## Purpose

This document defines the first concrete implementation slice for invoice workflow cleanup.

The goal is to make invoice work read more clearly by worker intent **without** destabilizing:
- the current invoice creation workflow
- invoice detail inspection
- payment recording
- credit memo handling
- invoice status changes
- current invoice query/load behavior

## Current code reality checked

Reviewed against:
- `src/components/office/InvoicesTab.tsx`
- `src/components/facility/InvoiceGeneratorPanel.tsx`
- `docs/invoices-workflow-surface-review-2026-04-21.md`

## Current surface responsibilities in code

### 1. Create invoice behavior
Present through:
- `InvoiceGeneratorPanel`
- client search
- invoice-eligible rug loading
- exclusion of already invoiced rugs
- rug selection
- invoice generation workflow

### 2. Invoice management / history behavior
Present through:
- `InvoicesTab`
- multi-status list/tabs
- date filtering
- client search filtering
- invoice detail sheet
- paid/unpaid and due-state visibility

### 3. Invoice maintenance / finance operations
Present through:
- status changes
- PDF download
- payment allocation recording
- credit memo issuing
- message thread open action

### 4. Mixed creation inside management surface
Present through:
- `InvoiceCreateSheet` inside `InvoicesTab`

## Judgment after code review

The current invoice creation flow is directionally correct and should be preserved.
The main problem is the Office invoice surface, which is still too all-purpose.

The clean product model remains:
- **Create Invoice**
- **Invoice Management**

## What should not change yet

To avoid destabilizing already-working operational behavior, this slice should **not** yet:
- split invoice routes immediately
- remove the current invoice generator workflow
- rewrite invoice data loading
- remove invoice detail sheet capability
- change payment/credit/status logic
- attempt to solve the still-separate baseline invoice PDF/auth bug by UI restructuring alone

## Smallest safe product move

The smallest professional move is a **hierarchy correction**.

The current Office Invoices page should begin reading as **Invoice Management** first.
Creation should remain available, but should stop competing equally with the management/history surface.

## Slice 01 recommendation

### Step A. Reframe Office Invoices as Invoice Management
The page title/copy should make it clear that this surface is primarily for:
- client-centered invoice lookup
- paid/unpaid review
- detail inspection
- payment and credit follow-up

### Step B. Demote creation inside management
The embedded create-invoice affordance in `InvoicesTab` should remain available temporarily, but it should be visibly secondary.

### Step C. Preserve the dedicated creation flow conceptually
`InvoiceGeneratorPanel` should continue to represent the correct long-term product idea: search-first client invoicing from invoice-eligible rugs.

### Step D. Demote large default all-invoice browsing as product identity
The list can remain for now, but it should be framed as management/history visibility, not the ideal long-term first experience.

## Proposed target shape for Slice 01

### Primary identity
- Invoice Management
- client search/filtering
- invoice detail and payment state review

### Secondary support
- create invoice affordance
- operational finance actions

### Transitional allowance
Until a dedicated `Create Invoice` route/surface is split out more formally, the management page may still expose creation, but only as secondary support.

## Explicit boundary for this slice

This slice is **not yet**:
- `Create Invoice` route creation
- `Invoice Management` route creation
- invoice query/backend rewrite
- invoice PDF bug resolution
- payment workflow redesign

It is the first hierarchy correction that prepares that later split safely.

## Validation standard for this slice

If implemented, validate:
1. invoice list still loads correctly
2. status tabs and filters still work
3. invoice detail sheet still works
4. payment recording still works
5. credit memo workflow still works
6. creation affordance still works
7. the page reads more clearly as invoice management rather than an all-purpose invoice universe
8. no layout instability is introduced

## Recommendation

Implement Invoice slice 01 as a careful hierarchy pass only:
- management-first title/copy
- creation clearly secondary
- preserve creation capability
- preserve finance operations capability
- keep current data/query behavior intact

That is the smallest safe and professional next step.
