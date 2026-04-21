# Office Workflow Surface Review - 2026-04-21

## Why this exists

The current platform has repeatedly drifted toward oversized pages that try to act as queue, creation flow, management console, historical reporting surface, and catch-all lookup UI at the same time.

That pattern is creating worker confusion and operational drag.

The immediate lesson from Estimates and Invoices is that the system should stop assuming one page per domain is automatically correct.

We should design around worker intent, not around dumping all records for a domain onto one surface.

## Canonical design rule

When reviewing or rebuilding a page, default to separating these concerns unless there is a strong reason not to:

- **Attention / Queue**
  - things that need action now
  - triage, review, intervention, exceptions, approvals, follow-up

- **Create / Intake**
  - making a new thing
  - fast operational entry, minimal distractions, no historical clutter unless directly needed

- **Management / Search / History**
  - searching by client or other identifier
  - reviewing full context, history, prior actions, details, status, and records

A single page may still own more than one of these only if the workflow is genuinely light and stays understandable in practice.

## What this means for estimates

The current idea of one Estimates page doing everything is not worker-friendly.

### Better target model

#### 1. Estimate Attention
A dedicated action queue for anything estimate-related that needs attention now, including:
- post-check-in review
- post-wash review
- client rejection
- revision requests
- blocked or exception cases
- optionally ready-to-send items if they still require human review

This surface should answer:
- What needs attention now?
- Why does it need attention?
- What is the next action?

#### 2. Estimate Management
A search-and-context surface for looking up estimate history by client.

This surface should support:
- searching by client/company
- viewing all rugs for that client
- seeing related estimates and statuses
- seeing prior sends, revisions, approvals, rejections, expiry, and communication context

This surface should answer:
- What is the full estimate picture for this client?
- What happened before?
- What is the current state of each rug/estimate?

## What this means for invoices

Invoices should follow the same separation.

### Better target model

#### 1. Create Invoice
A focused operational workflow:
- search client by name
- load rugs under the client account
- hide rugs already invoiced
- select one or more eligible rugs
- generate invoice
- optionally record payment received immediately and mark paid

This surface should be simple and fast.
It should not be overloaded with historical invoice browsing.

#### 2. Invoice Management
A separate search/history surface:
- search by client
- view invoice history for that client
- inspect invoice details
- see paid/unpaid state
- review older invoices cleanly

## Operational identity rule

Workers should not have to rely on awkward generated estimate/invoice strings as the primary way to understand what they are looking at.

Primary visible identity should usually be built from:
- client/company name
- rug number(s)
- rug count
- meaningful status/action context

Generated estimate or invoice codes should remain available as secondary reference identifiers, not the main human-facing anchor.

## Broader product direction

The platform should now be reviewed page by page with this question:

> Should this surface actually remain one page, or should it be split by worker intent?

This review should include whether some current surfaces should be kept, split, merged, demoted, or removed entirely.

## Suggested review sequence

Priority order should follow operational launch importance, not legacy tab order.

1. Check In / Facility workflow
2. Jobs
3. Estimates
4. Invoices
5. Driver portal
6. Wholesale client portal
7. Office Inbox (deferred, not required for launch)
8. Admin surfaces

For each page, decide:
- Keep as-is
- Keep but simplify
- Split into separate surfaces
- Merge into another domain surface
- Remove

## Current decision

The current working vision is:
- build with a stronger product/operations vision first
- do not keep forcing giant all-in-one pages
- prioritize clarity of worker intent over dense all-record dashboards
- pause Office Inbox as a non-essential launch feature and review it later once live operations are stable
