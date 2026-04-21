# Invoices Workflow Surface Review - 2026-04-21

## Scope

This review covers the current invoice-related surfaces:
- `src/components/office/InvoicesTab.tsx`
- `src/components/facility/InvoiceGeneratorPanel.tsx`
- related invoice details / creation context

## First judgment

The user direction is correct:
invoice creation and invoice management should not be forced into the same giant page or giant always-visible table.

Displaying large invoice lists for everyone by default is not the right worker model.

Invoice work should be centered around:
- creating a new invoice for a client when needed
- looking up invoice history for a client when needed

## Worker-intent model for Invoices

## 1. Create Invoice
Purpose:
- office worker types client name
- sees rugs available to invoice under that account
- already invoiced rugs do not appear
- worker selects one or more rugs
- generates a new invoice
- can optionally record payment received immediately and mark it paid

This should be simple, fast, and search-first.
It should not require browsing unrelated invoice history first.

## 2. Invoice Management
Purpose:
- search by client
- see invoice history for that client
- inspect invoice details
- see whether invoices are paid or unpaid
- review older invoices and payment context clearly

This should be a clean lookup/history surface, not an operational creation flow.

## Current judgment by surface

## 1. Facility Invoice Generator / create-invoice flow
### Judgment
**Keep the workflow concept.**

### Why
The actual operational flow is directionally correct:
- search client
- load invoice-eligible rugs
- exclude already invoiced rugs
- select rugs
- generate invoice

That is exactly the worker flow the user described.

### Change needed
The important change is conceptual framing.
This should be treated as a dedicated **Create Invoice** surface, not as part of a mixed invoice universe.

## 2. Office Invoices page
### Current shape
The current page tries to do many things at once:
- large multi-status invoice list
- status tabs
- date filtering
- client search filtering
- invoice detail sheet
- invoice creation sheet
- status mutation
- PDF download
- payment recording
- credit memo issuing
- thread opening

### Judgment
**Too heavy as a single all-purpose page.**

### Why
This is another example of queue/history/create/maintenance all being pushed into one surface.
It may be powerful, but it is not the clearest worker experience.

### What should change conceptually
Invoice creation should be split away from invoice management.
Management itself should become more client-centered and search-first.

## Better target model

### A. Create Invoice
A dedicated workflow that starts with client search and only shows invoice-eligible rugs for that client.

Expected behavior:
- search client by name
- show available rugs under account
- do not show already invoiced rugs
- multi-select rugs
- create invoice
- optionally record payment received now

### B. Invoice Management
A dedicated lookup/history surface.

Expected behavior:
- search client by name
- load invoices for that client
- view invoice details
- see paid/unpaid state
- review invoice history and payment context

This page should not start by dumping all invoices on workers by default unless there is a very strong operational reason.

## What should remain visible as primary identity

Invoices should be understood primarily through:
- client name
- rug numbers / included rugs
- amount
- paid/unpaid state
- issue/due timing

Invoice number should remain available, but should not be the only understandable handle.

## Launch-priority judgment

### Keep and improve now
- invoice-eligible rug selection flow
- exclusion of already invoiced rugs
- invoice detail inspection
- payment status visibility

### Reorganize conceptually as soon as practical
- separate create from management
- make management search-first by client
- stop relying on all-invoice default browsing as the main experience

## Preliminary keep / simplify / split / merge / remove summary

- **Invoice creation workflow** → Keep
- **Search client → show invoice-eligible rugs** → Keep
- **Hide already invoiced rugs** → Keep
- **Optional immediate payment capture/recording** → Keep concept
- **Single all-purpose Invoices page** → Split into Create Invoice + Invoice Management
- **Large default all-invoice browsing surface** → Demote

## Current conclusion

Invoices should follow the same product rule as Estimates:
- do not make one giant page do everything
- split by worker intent

The correct direction is:
- **Create Invoice**
- **Invoice Management**

That is cleaner, faster, and more usable operationally.
