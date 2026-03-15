# Platform 1.0 Implementation Plan

**Date:** 2026-03-05  
**Goal:** Make platform production-ready with unified Stop model, offline-first driver, explicit state machines, disputes, invoice immutability, accounting primitives, and messaging threads.

---

## 1. Current Workflow Primitives (Baseline)

### 1.1 Driver Pickup Workflow
**Location:** `src/pages/DriverPortal.tsx`

**Current Flow:**
- Driver fetches `pickup_requests` where `assigned_driver_id = user.id` and `status IN ('assigned', 'completed')`
- For each pickup request, fetches `pickup_request_items` with:
  - `verified` (boolean)
  - `driver_notes` (text)
  - `driver_photo_urls` (text[])
- Driver verifies each item (toggle `verified`)
- Driver adds notes and photos per item
- Driver sets signature on `pickup_requests.signature_data_url`
- Completion requires: all items `verified = true` AND signature present
- On completion: updates `pickup_requests.status = 'completed'`, `completed_at = now()`

**Database Tables:**
- `pickup_requests` (id, client_id, scheduled_date, status, assigned_driver_id, signature_data_url, completed_at)
- `pickup_request_items` (id, pickup_request_id, rug_id, rug_number, verified, driver_notes, driver_photo_urls)

**Guard Logic:** `src/lib/workflow-guards.ts` - `canDriverCompletePickup()`

**Storage:** Photos uploaded to `pickup-photos` bucket

---

### 1.2 Office Delivery Workflow
**Location:** `src/components/office/DeliveriesTab.tsx`

**Current Flow:**
1. **Compile:** Office compiles delivery list by route_day
   - Queries `rugs` where `status IN ('ready', 'in_production')` for clients on that route_day
   - Creates `delivery_lists` row (status='compiling')
   - Creates `delivery_list_items` rows (one per rug)

2. **Confirm:** Office toggles `delivery_list_items.confirmed_for_delivery = true`
   - Cannot confirm rugs with `status = 'in_production'` (enforced in UI)
   - When ready, sets `delivery_lists.status = 'confirmed'`

3. **Load:** Office toggles `delivery_list_items.loaded_on_truck = true`
   - Only for items where `confirmed_for_delivery = true`

4. **Checkout:** Calls `supabase/functions/checkout-delivery`
   - Requires: `delivery_lists.status = 'confirmed'`
   - Processes items where `confirmed_for_delivery = true AND loaded_on_truck = true`
   - Groups by `client_id`, creates one invoice per client
   - Creates `invoices` + `invoice_items` from `rug_services`
   - Generates invoice PDF via shared helpers
   - Updates `rugs.status = 'picked_up'`, `picked_up_at = now()`
   - Sets `delivery_lists.status = 'checked_out'`

**Database Tables:**
- `delivery_lists` (id, route_day, target_date, status, confirmed_at, checked_out_at, checked_out_by)
- `delivery_list_items` (id, delivery_list_id, rug_id, client_id, confirmed_for_delivery, loaded_on_truck)

**Edge Function:** `supabase/functions/checkout-delivery/index.ts`

---

### 1.3 Invoice Generation & PDF Pipeline
**Location:** `supabase/functions/invoice-pdf/index.ts`

**Current Flow:**
- Accepts `invoice_id`
- Validates auth (office/admin or portal user with matching client_id)
- Fetches invoice + invoice_items
- Checks if PDF exists in storage (bucket: `invoice-pdfs`)
- If missing or `force_regenerate=true`, generates PDF via `renderInvoicePdfBytes()`
- Uploads to storage, updates `invoices.pdf_storage_path`
- Returns signed URL (300s expiry)
- Logs `communication_events` for generation/download

**Shared Helpers:** `supabase/functions/_shared/invoice-pdf.ts`
- `renderInvoicePdfBytes()` - PDF generation
- `resolveInvoicePdfStoragePath()` - path resolution
- `uploadInvoicePdf()` - storage upload
- `createInvoicePdfSignedUrl()` - signed URL generation

**Database Tables:**
- `invoices` (id, invoice_number, client_id, delivery_list_id, status, total, issued_at, due_at, pdf_storage_path)
- `invoice_items` (id, invoice_id, rug_id, description, quantity, unit_price, total)

---

### 1.4 Payment Tracking
**Current State:**
- `payment_attempts` table exists (id, invoice_id, client_id, provider, amount, status, attempted_at, error_message)
- Used for logging payment attempts (Stripe integration)
- No allocation model (payments not linked to specific invoices in accounting sense)
- No credit memo system

**Database Tables:**
- `payment_attempts` (id, invoice_id, client_id, provider, amount, status, attempted_at, error_message, metadata)

---

### 1.5 Messaging/Communication
**Current State:**
- `communication_events` table (id, client_id, invoice_id, estimate_id, channel, direction, subject, body, sent_to, event_type)
- `interactions` table (id, client_id, job_id, rug_id, pickup_request_id, interaction_type, channel, subject, body, created_by)
- No thread model (no grouping by conversation)
- No throttling rules for automated reminders

**Database Tables:**
- `communication_events` (id, client_id, invoice_id, estimate_id, channel, direction, subject, body, sent_to, event_type, created_by, created_at)
- `interactions` (id, client_id, job_id, rug_id, pickup_request_id, interaction_type, channel, subject, body, created_by, created_at)

---

## 2. Missing Production Primitives

### 2.1 Unified Stop Model
**Gap:** Driver manages pickups and deliveries separately. Production requires one "Stop" per client/location per route date that combines:
- Delivery items (from delivery_list_items)
- Pickup items (from pickup_request_items)
- One signature for the entire stop
- Item-level verification with exceptions/disputes

**Required:**
- `route_stops` table (one per client per route_date)
- `route_stop_items` table (one per rug per phase: delivery|pickup)
- Stop generation function that builds stops from delivery_lists + pickup_requests
- Driver UI refactor to work from stops instead of pickup_requests

---

### 2.2 Offline-First Driver Operation
**Gap:** DriverPortal writes directly to Supabase tables. Network failures cause partial states and data loss.

**Required:**
- IndexedDB event queue in frontend
- `route_stop_events` table (idempotent event ingestion)
- `ingest-stop-events` edge function (batch event processing)
- Background sync loop in DriverPortal
- Photo upload queue (store metadata, upload later)

---

### 2.3 Explicit State Machines (DB-Enforced)
**Gap:** Status transitions are enforced in application code only. No DB-level guards.

**Required:**
- DB triggers/functions enforcing:
  - `route_stops.status` transitions (queued → in_progress → completed|completed_with_exceptions|unable_to_complete)
  - Stop completion invariants (signature required, all items verified|skipped|exception)
  - Invoice immutability (block edits to invoice_number/total/items when status >= 'sent')
  - Delivery list status transitions

---

### 2.4 Dispute Flow (2 Types)
**Gap:** No dispute tracking. No handling for refused deliveries vs post-delivery claims.

**Required:**
- `disputes` table (id, rug_id, client_id, type, status, notes, created_by, created_at)
- `dispute_type` enum: `refused_delivery` | `post_delivery_claim`
- Refused delivery: rug stays `ready` (not `picked_up`), dispute created
- Post-delivery claim: rug remains `picked_up`, dispute created
- Driver UI: dispute buttons per item

---

### 2.5 Invoice Immutability
**Gap:** Invoices can be edited after being sent. No accounting integrity.

**Required:**
- DB trigger blocking UPDATEs to `invoices.invoice_number`, `invoices.total`, `invoice_items.*` when `invoices.status IN ('sent', 'paid', 'overdue', 'disputed')`
- Allow status changes and append-only financial records (payments/credits)

---

### 2.6 Accounting Primitives
**Gap:** Only `payment_attempts` exists. No proper payment allocation or credit memo system.

**Required:**
- `payments` table (id, client_id, amount, payment_method, received_at, created_by)
- `payment_allocations` table (id, payment_id, invoice_id, amount_allocated)
- `credit_memos` table (id, client_id, invoice_id, total, issued_at, created_by)
- `credit_memo_lines` table (id, credit_memo_id, description, amount)
- Office UI for payment entry and credit memo issuance
- Auto-update `invoices.balance_cents` (or compute from allocations)

---

### 2.7 Day-Before Delivery Confirmation
**Gap:** Office sets `confirmed_for_delivery`. Spec requires check-in staff to do day-before physical verification.

**Required:**
- New Facility Ops view "Delivery Prep"
- Query `delivery_list_items` for tomorrow where `rug.status = 'ready'` and list is `compiling` or `confirmed`
- Check-in staff toggles `confirmed_for_delivery = true` after physical verification
- Role-gated to `checkin_staff`/`admin`/`office`
- Driver cannot set `confirmed_for_delivery`; driver only sets `loaded_on_truck`

---

### 2.8 Messaging Threads + Throttled Notifications
**Gap:** No thread model. No throttling for automated reminders.

**Required:**
- Thread model via `interactions.interaction_type` values:
  - `thread_general`
  - `thread_estimate:<estimate_id>`
  - `thread_invoice:<invoice_id>`
- Portal user INSERT allowed only for their `client_id` and above types
- Office "Inbox" view grouped by client/thread
- Throttle rules:
  - Estimates: +24h, +72h, +7d, then stop
  - Invoices: -3d, due date, +7d, +14d, then weekly statements
  - Cap: 1 automated collections email per client per 72h
- Scheduled job (cron or edge function) for reminder dispatch

---

## 3. PR-Sized Implementation Plan

### Dependency Graph

```
PR-1 (DB Schema: Enums + Tables)
  └─> PR-2 (DB: State Machine Triggers)
      └─> PR-3 (DB: Stop Generation Function)
          └─> PR-4 (Edge Function: Ingest Stop Events)
              └─> PR-5 (Frontend: Offline Queue + Sync)
                  └─> PR-6 (Frontend: DriverPortal → StopPortal)
                      └─> PR-7 (Frontend: Delivery Prep View)
                          └─> PR-8 (DB: Accounting Primitives)
                              └─> PR-9 (Frontend: Office Accounting UI)
                                  └─> PR-10 (DB: Invoice Immutability)
                                      └─> PR-11 (DB: Disputes)
                                          └─> PR-12 (Frontend: Dispute UI)
                                              └─> PR-13 (DB: Messaging Threads)
                                                  └─> PR-14 (Edge Function: Notification Throttle)
                                                      └─> PR-15 (Frontend: Office Inbox)
                                                          └─> PR-16 (Tests + Acceptance)
```

---

### PR-1: Database Schema - Enums and Core Tables
**Scope:** Add new enums and tables for route stops, events, disputes

**Files:**
- `supabase/migrations/YYYYMMDDHHMMSS_add_route_stops_schema.sql`

**Changes:**
1. Create enums:
   - `route_stop_status`: `queued`, `in_progress`, `completed`, `completed_with_exceptions`, `unable_to_complete`
   - `route_stop_phase`: `delivery`, `pickup`
   - `route_stop_item_status`: `pending`, `verified`, `disputed`, `exception`, `skipped`
   - `dispute_type`: `refused_delivery`, `post_delivery_claim`
   - Add `disputed` to `invoice_status` enum

2. Create tables:
   - `route_stops` (id, route_date, client_id, route_day, assigned_driver_id, delivery_list_id, pickup_request_id, status, signature_data_url, started_at, completed_at, exception_code, notes, created_at, updated_at)
   - `route_stop_items` (id, route_stop_id, phase, status, rug_id, pickup_request_item_id, delivery_list_item_id, notes, photo_urls[], created_at, updated_at)
   - `route_stop_events` (id, offline_event_id UNIQUE, route_stop_id, event_type, payload jsonb, created_by, created_at)
   - `disputes` (id, rug_id, client_id, type, status, notes, created_by, created_at, updated_at)

3. Add indexes:
   - `route_stops(route_date)`
   - `route_stops(assigned_driver_id, route_date)`
   - `route_stops(client_id, route_date)`
   - `route_stop_items(route_stop_id)`
   - `route_stop_items(phase, status)`
   - `route_stop_events(offline_event_id)` UNIQUE
   - `route_stop_events(route_stop_id)`

**Acceptance Tests:**
- [ ] All enums created
- [ ] All tables created with correct columns
- [ ] Indexes created
- [ ] Migration runs without errors
- [ ] Can INSERT test rows into each table

---

### PR-2: Database - State Machine Triggers
**Scope:** Add DB triggers enforcing state transitions and invariants

**Files:**
- `supabase/migrations/YYYYMMDDHHMMSS_add_state_machine_triggers.sql`

**Changes:**
1. Function: `validate_route_stop_status_transition(old_status, new_status)` → boolean
2. Function: `validate_route_stop_completion(route_stop_id)` → boolean
   - Checks: signature present, all items in verified|skipped|exception|disputed
3. Trigger: `route_stops_status_transition_guard` BEFORE UPDATE
   - Calls validation functions
   - Raises exception if invalid transition
4. Trigger: `route_stops_completion_guard` BEFORE UPDATE
   - If status → completed|completed_with_exceptions, calls completion validator
5. Function: `validate_invoice_immutability(invoice_id, old_status, new_status)` → boolean
6. Trigger: `invoices_immutability_guard` BEFORE UPDATE
   - If old_status IN ('sent', 'paid', 'overdue', 'disputed'):
     - Blocks UPDATE to invoice_number, total
     - Blocks UPDATE to invoice_items (via separate trigger on invoice_items)
     - Allows status changes

**Acceptance Tests:**
- [ ] Invalid route_stop status transition raises error
- [ ] Route stop completion without signature raises error
- [ ] Route stop completion with pending items raises error
- [ ] Invoice edit after 'sent' status raises error (except status change)
- [ ] Valid transitions succeed

---

### PR-3: Database - Stop Generation Function
**Scope:** SQL function to build route_stops from delivery_lists + pickup_requests

**Files:**
- `supabase/migrations/YYYYMMDDHHMMSS_add_build_route_stops_function.sql`

**Changes:**
1. Function: `build_route_stops_for_date(target_date date)`
   - For each `delivery_list_items` where:
     - `delivery_list.target_date = target_date`
     - `delivery_list.status IN ('confirmed', 'checked_out')`
     - `delivery_list_items.loaded_on_truck = true` (or `confirmed_for_delivery = true` for day-before)
   - Group by `client_id`
   - For each client:
     - INSERT or UPDATE `route_stops` (route_date, client_id, route_day, delivery_list_id, status='queued')
     - INSERT `route_stop_items` (phase='delivery', status='pending', rug_id, delivery_list_item_id)
   - For each `pickup_requests` where:
     - `scheduled_date = target_date`
     - `status IN ('assigned', 'completed')`
   - For each pickup_request:
     - Ensure `route_stops` row exists for that client_id + route_date
     - UPDATE `route_stops.pickup_request_id`
     - INSERT `route_stop_items` (phase='pickup', status='pending', pickup_request_item_id, rug_id if available)

2. Add indexes if needed for performance

**Acceptance Tests:**
- [ ] Function creates stops for delivery-only clients
- [ ] Function creates stops for pickup-only clients
- [ ] Function creates stops for clients with both delivery and pickup
- [ ] Function idempotent (can run multiple times safely)
- [ ] Function handles missing delivery_list or pickup_request gracefully

---

### PR-4: Edge Function - Ingest Stop Events
**Scope:** Batch event ingestion for offline-first driver

**Files:**
- `supabase/functions/ingest-stop-events/index.ts`

**Changes:**
1. Accept POST body: `{ events: [{ offline_event_id, route_stop_id, event_type, payload }] }`
2. Validate auth: driver/admin
3. If driver, verify `route_stops.assigned_driver_id = user.id` for all stops
4. Insert events into `route_stop_events` with `ON CONFLICT (offline_event_id) DO NOTHING`
5. Apply event effects transactionally:
   - `STOP_STARTED` → `route_stops.status = 'in_progress'`, `started_at = now()`
   - `SIGNATURE_SET` → `route_stops.signature_data_url = payload.signature_data_url`
   - `ITEM_VERIFIED` → `route_stop_items.status = 'verified'`
   - `ITEM_EXCEPTION` → `route_stop_items.status = 'exception'`, store payload.exception_code
   - `ITEM_DISPUTED` → `route_stop_items.status = 'disputed'`, create `disputes` row
   - `PHOTO_ATTACHED` → append to `route_stop_items.photo_urls`
   - `STOP_COMPLETED` → validate completion invariants, set `route_stops.status = 'completed'`, `completed_at = now()`
6. Return updated stop snapshot (stop + items)

**Acceptance Tests:**
- [ ] Unauthorized user rejected
- [ ] Driver cannot mutate stops not assigned to them
- [ ] Duplicate offline_event_id ignored (idempotent)
- [ ] Events applied in transaction (all or nothing)
- [ ] STOP_COMPLETED fails if invariants not met
- [ ] Returns correct stop snapshot

---

### PR-5: Frontend - Offline Queue Infrastructure
**Scope:** IndexedDB event queue + background sync

**Files:**
- `src/lib/offline-queue.ts` (new)
- `src/hooks/useOfflineQueue.ts` (new)
- `src/contexts/OfflineQueueContext.tsx` (new)

**Changes:**
1. Install `idb-keyval` or `dexie` for IndexedDB
2. Create `offline-queue.ts`:
   - `addEvent(route_stop_id, event_type, payload)` → stores in IndexedDB with `offline_event_id = uuid()`
   - `getPendingEvents()` → returns all unsynced events
   - `markEventSynced(offline_event_id)` → updates synced_at
   - `clearSyncedEvents()` → cleanup old synced events
3. Create `useOfflineQueue` hook:
   - `syncQueue()` → fetches pending events, calls `ingest-stop-events`, marks synced
   - `isOnline` state (navigator.onLine + online/offline listeners)
   - Auto-sync on online event
   - Manual sync button
4. Create `OfflineQueueContext`:
   - Provides sync status, queue length, sync function
   - Wraps app

**Acceptance Tests:**
- [ ] Events stored in IndexedDB when offline
- [ ] Events synced when online
- [ ] Duplicate events not sent (idempotent)
- [ ] Sync status visible in UI
- [ ] Manual sync works

---

### PR-6: Frontend - DriverPortal → StopPortal Refactor
**Scope:** Replace pickup_requests with route_stops

**Files:**
- `src/pages/DriverPortal.tsx` → `src/pages/StopPortal.tsx` (rename)
- `src/lib/workflow-guards.ts` (update)

**Changes:**
1. Replace `pickup_requests` fetch with `route_stops` fetch:
   - Query `route_stops` where `assigned_driver_id = user.id` and `route_date IN (today, tomorrow, yesterday)`
   - Join `route_stop_items` grouped by phase
2. UI restructure:
   - Show Delivery section first (phase='delivery')
   - Show Pickup section second (phase='pickup')
   - One signature component for entire stop (reuse `SignatureCanvas`)
   - Each item: verify checkbox, notes input, photos (reuse existing photo upload)
   - Dispute buttons: "Refused Delivery" (delivery items) or "Post-Delivery Claim" (pickup items)
3. Replace direct Supabase updates with offline queue:
   - `toggleVerified` → `addEvent('ITEM_VERIFIED')`
   - `setRugNotes` → `addEvent('ITEM_NOTES_SET')` (new event type)
   - `addPickupPhoto` → upload to storage (if online), then `addEvent('PHOTO_ATTACHED')`
   - `setSignature` → `addEvent('SIGNATURE_SET')`
   - `completePickup` → `addEvent('STOP_COMPLETED')`
4. Show sync queue status in header
5. Update `workflow-guards.ts`:
   - Add `canDriverCompleteStop()` function
   - Check: signature present, all items verified|skipped|exception|disputed

**Acceptance Tests:**
- [ ] Driver sees stops for today +/- 1 day
- [ ] Delivery items shown before pickup items
- [ ] One signature per stop (not per item)
- [ ] Item verification works offline
- [ ] Stop completion works offline
- [ ] Events sync when online
- [ ] Dispute buttons create dispute records

---

### PR-7: Frontend - Delivery Prep View (Check-in Staff)
**Scope:** Day-before delivery confirmation by check-in staff

**Files:**
- `src/components/facility/DeliveryPrepTab.tsx` (new)
- Update facility routing to include new tab

**Changes:**
1. Query `delivery_list_items` where:
   - `delivery_list.target_date = tomorrow`
   - `delivery_list.status IN ('compiling', 'confirmed')`
   - `rugs.status = 'ready'`
2. Group by client, show list of rugs
3. Check-in staff toggles `confirmed_for_delivery = true` after physical verification
4. Role-gated: only `checkin_staff`, `admin`, `office` can access
5. Driver cannot access this view

**Acceptance Tests:**
- [ ] Only check-in staff/admin/office can access
- [ ] Shows tomorrow's delivery items
- [ ] Toggle persists `confirmed_for_delivery`
- [ ] Driver cannot set `confirmed_for_delivery`

---

### PR-8: Database - Accounting Primitives
**Scope:** Payments, allocations, credit memos tables

**Files:**
- `supabase/migrations/YYYYMMDDHHMMSS_add_accounting_primitives.sql`

**Changes:**
1. Create tables:
   - `payments` (id, client_id, amount, payment_method, received_at, created_by, created_at, updated_at)
   - `payment_allocations` (id, payment_id, invoice_id, amount_allocated, created_at)
   - `credit_memos` (id, client_id, invoice_id, total, issued_at, created_by, notes, created_at, updated_at)
   - `credit_memo_lines` (id, credit_memo_id, description, amount, created_at)
2. Add `balance_cents` to `invoices` (or compute from allocations)
3. Add indexes:
   - `payment_allocations(payment_id)`
   - `payment_allocations(invoice_id)`
   - `credit_memos(invoice_id)`

**Acceptance Tests:**
- [ ] All tables created
- [ ] Can create payment + allocations
- [ ] Can create credit memo + lines
- [ ] Invoice balance updates correctly

---

### PR-9: Frontend - Office Accounting UI
**Scope:** Payment entry and credit memo issuance

**Files:**
- `src/components/office/AccountingTab.tsx` (new)
- Update office routing

**Changes:**
1. Payment entry form:
   - Select client, enter amount, payment method, date
   - Create `payments` row
   - Allocate to invoices (multi-select, enter amounts)
   - Create `payment_allocations` rows
   - Update invoice balances
2. Credit memo form:
   - Select client/invoice, enter total, description
   - Create `credit_memos` + `credit_memo_lines`
   - Apply to invoice balance
3. Show payment history and credit memo history

**Acceptance Tests:**
- [ ] Payment entry creates payment + allocations
- [ ] Credit memo creates memo + lines
- [ ] Invoice balance updates correctly
- [ ] History displays correctly

---

### PR-10: Database - Invoice Immutability Enforcement
**Scope:** DB triggers blocking invoice edits after 'sent'

**Files:**
- `supabase/migrations/YYYYMMDDHHMMSS_enforce_invoice_immutability.sql`

**Changes:**
1. Trigger: `invoice_items_immutability_guard` BEFORE UPDATE/DELETE
   - If parent `invoices.status IN ('sent', 'paid', 'overdue', 'disputed')`:
     - Block UPDATE/DELETE
     - Allow INSERT (for corrections via credit memos)
2. Update existing `invoices_immutability_guard` from PR-2 if needed
3. Add function to compute invoice balance from allocations

**Acceptance Tests:**
- [ ] Cannot edit invoice_items after invoice 'sent'
- [ ] Cannot delete invoice_items after invoice 'sent'
- [ ] Can add new items (for corrections)
- [ ] Status changes allowed

---

### PR-11: Database - Disputes Integration
**Scope:** Dispute creation from stop events, dispute status tracking

**Files:**
- `supabase/migrations/YYYYMMDDHHMMSS_add_dispute_integration.sql`

**Changes:**
1. Update `ingest-stop-events` function (from PR-4) to create disputes:
   - On `ITEM_DISPUTED` event:
     - If `payload.dispute_type = 'refused_delivery'`:
       - Create `disputes` row (type='refused_delivery', status='open')
       - Do NOT update `rugs.status` to 'picked_up' (stays 'ready')
     - If `payload.dispute_type = 'post_delivery_claim'`:
       - Create `disputes` row (type='post_delivery_claim', status='open')
       - Rug remains 'picked_up'
2. Add `disputes.status` enum: `open`, `investigating`, `resolved`, `credited`, `denied`
3. Add RLS policies for disputes (office/admin manage, portal view own)

**Acceptance Tests:**
- [ ] Refused delivery creates dispute, rug stays 'ready'
- [ ] Post-delivery claim creates dispute, rug stays 'picked_up'
- [ ] RLS policies enforce access

---

### PR-12: Frontend - Dispute UI
**Scope:** Dispute buttons in StopPortal, dispute management in Office

**Files:**
- `src/pages/StopPortal.tsx` (update from PR-6)
- `src/components/office/DisputesTab.tsx` (new)

**Changes:**
1. In StopPortal:
   - Delivery items: "Refused Delivery" button → `addEvent('ITEM_DISPUTED', { dispute_type: 'refused_delivery' })`
   - Pickup items: "Post-Delivery Claim" button → `addEvent('ITEM_DISPUTED', { dispute_type: 'post_delivery_claim' })`
2. Office DisputesTab:
   - List all disputes (filter by status, type, client)
   - Update dispute status
   - Add notes
   - Link to rug/invoice

**Acceptance Tests:**
- [ ] Dispute buttons create disputes
- [ ] Office can view and manage disputes
- [ ] Dispute status updates work

---

### PR-13: Database - Messaging Threads
**Scope:** Thread model via interactions table

**Files:**
- `supabase/migrations/YYYYMMDDHHMMSS_add_messaging_threads.sql`

**Changes:**
1. Update RLS policies on `interactions`:
   - Portal users can INSERT only when:
     - `client_id` matches their portal linkage
     - `interaction_type IN ('thread_general', 'thread_estimate:<id>', 'thread_invoice:<id>')`
   - Office/admin can INSERT/UPDATE/DELETE all
2. Add function to validate thread type format
3. Add indexes:
   - `interactions(client_id, interaction_type)`
   - `interactions(created_at)`

**Acceptance Tests:**
- [ ] Portal user can create thread interactions for their client
- [ ] Portal user cannot create other interaction types
- [ ] Office can manage all interactions

---

### PR-14: Edge Function - Notification Throttle
**Scope:** Scheduled reminders with throttling

**Files:**
- `supabase/functions/send-reminders/index.ts` (new)
- Supabase cron job or external scheduler

**Changes:**
1. Function `send-reminders`:
   - Estimates: query `estimates` where `status = 'sent'` and `sent_at` matches reminder cadence (+24h, +72h, +7d)
   - Invoices: query `invoices` where `status = 'sent'` and `due_at` matches reminder cadence (-3d, due, +7d, +14d, weekly)
   - Check throttle: query `communication_events` for last 72h per client
   - If under throttle limit, send email, log `communication_events`
2. Scheduled job (Supabase cron or external):
   - Run daily at 9 AM
   - Call `send-reminders` function

**Acceptance Tests:**
- [ ] Estimate reminders sent at correct cadence
- [ ] Invoice reminders sent at correct cadence
- [ ] Throttle limit enforced (1 per 72h)
- [ ] Reminders stop after max attempts

---

### PR-15: Frontend - Office Inbox
**Scope:** Threaded messaging view for office

**Files:**
- `src/components/office/InboxTab.tsx` (new)

**Changes:**
1. Query `interactions` grouped by `client_id` and `interaction_type`
2. Display threads:
   - General thread per client
   - Estimate threads (one per estimate_id)
   - Invoice threads (one per invoice_id)
3. Show unread count, latest message preview
4. Click thread → show conversation history
5. Reply form → create new interaction

**Acceptance Tests:**
- [ ] Threads grouped correctly
- [ ] Conversation history displays
- [ ] Reply creates new interaction
- [ ] Unread counts update

---

### PR-16: Tests and Acceptance Criteria
**Scope:** Comprehensive test coverage for all new features

**Files:**
- `src/test/route-stops.test.ts` (new)
- `src/test/offline-queue.test.ts` (new)
- `src/test/disputes.test.ts` (new)
- `src/test/accounting.test.ts` (new)
- `src/test/acceptance/stop-completion.test.ts` (new)
- Update `scripts/rls-scope-smoke-test.sh` to include new tables

**Acceptance Criteria (from roadmap):**
1. [ ] Driver can complete a stop in airplane mode; when online, events sync and stop becomes completed on server.
2. [ ] Stop completion is blocked if signature missing or any item still pending (unless stop is completed_with_exceptions with evidence).
3. [ ] Delivery-only stops exist and can be completed.
4. [ ] Pickup-only stops exist and can be completed.
5. [ ] Refused delivery creates dispute record and does NOT mark rug picked_up.
6. [ ] Post-delivery claim creates dispute record but rug remains picked_up.
7. [ ] Invoice marked sent cannot have line items edited; credits/payments adjust balance via new primitives only.
8. [ ] Day-before delivery confirmation is done by check-in staff, and driver load list is based on confirmed_for_delivery.

**Acceptance Tests:**
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All acceptance criteria pass
- [ ] RLS smoke test includes new tables
- [ ] Private beta readiness script passes

---

## 4. Migration Strategy

### Backward Compatibility
- Keep `pickup_requests` and `delivery_lists` tables (portal and office continue using them)
- `route_stops` are generated from these sources
- Driver UI switches to `route_stops` but source tables remain operational

### Rollout Order
1. Deploy PR-1 through PR-3 (DB schema + functions) to staging
2. Deploy PR-4 (edge function) to staging
3. Deploy PR-5 (offline queue) to staging
4. Deploy PR-6 (StopPortal) to staging with feature flag
5. Test driver workflow end-to-end in staging
6. Deploy PR-7 through PR-15 incrementally
7. Deploy PR-16 (tests) and validate all acceptance criteria
8. Production rollout with monitoring

### Rollback Plan
- If StopPortal fails: revert to DriverPortal (keep using pickup_requests)
- If DB triggers cause issues: disable triggers, fix, re-enable
- If offline queue fails: driver can use online-only mode temporarily

---

## 5. Estimated Effort

| PR | Estimated Days |
|----|----------------|
| PR-1 | 2 |
| PR-2 | 3 |
| PR-3 | 2 |
| PR-4 | 3 |
| PR-5 | 4 |
| PR-6 | 5 |
| PR-7 | 2 |
| PR-8 | 2 |
| PR-9 | 3 |
| PR-10 | 2 |
| PR-11 | 2 |
| PR-12 | 3 |
| PR-13 | 2 |
| PR-14 | 3 |
| PR-15 | 3 |
| PR-16 | 4 |
| **Total** | **43 days** (~8-9 weeks) |

---

## 6. Risk Mitigation

1. **Offline queue complexity**: Start with simple IndexedDB implementation, iterate
2. **State machine bugs**: Extensive testing in staging before production
3. **Performance**: Monitor stop generation function, add indexes as needed
4. **Data migration**: No migration needed (stops generated from existing data)
5. **Driver adoption**: Provide training, keep old UI available during transition

---

**End of Implementation Plan**
