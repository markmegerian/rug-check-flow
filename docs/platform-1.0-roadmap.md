> Status note: see `docs/platform-1.0-status.md` for the living implementation-status tracker. This roadmap doc remains planning context and may lag behind shipped code.

You are working in the repo markmegerian/rug-check-flow (Vite + React + TS + Supabase).
Goal: make the platform production-ready by implementing:
1) explicit state machines enforced in DB,
2) unified driver “Stop” model (delivery + pickup under one stop with one signature),
3) offline-first driver operation via event ingestion,
4) day-before delivery confirmation by check-in staff,
5) accounting primitives (payments + allocations + credits) and invoice immutability,
6) dispute flow: refused delivery vs post-delivery claim,
7) messaging threads + notification throttling.

IMPORTANT CONTEXT FROM CURRENT CODEBASE:
- Driver pickup workflow uses pickup_requests / pickup_request_items with signature_data_url, verified, driver_notes, driver_photo_urls; completion requires all verified + signature (see src/pages/DriverPortal.tsx).
- Delivery workflow uses delivery_lists / delivery_list_items confirmed_for_delivery + loaded_on_truck; checkout is via supabase/functions/checkout-delivery which generates invoices and marks rugs.status="picked_up".
- Rug statuses are enum: checked_in, in_production, ready, picked_up (picked_up is used as delivered).
- Invoice PDF is produced via supabase/functions/invoice-pdf and shared rendering helpers.
- Estimates exist via estimates + estimate_items; portal line approvals are being added.

IMPLEMENTATION PLAN (DO IN ORDER):

PHASE 1 — Database migrations (Supabase)
A) Add new enums:
- route_stop_status, route_stop_phase, route_stop_item_status, dispute_type

B) Add tables:
- route_stops (route_date, client_id, route_day, assigned_driver_id, delivery_list_id nullable, pickup_request_id nullable, status, signature_data_url, started_at, completed_at, exception_code, notes)
- route_stop_items (route_stop_id, phase, status, rug_id nullable, pickup_request_item_id nullable, delivery_list_item_id nullable, notes, photo_urls[])
- route_stop_events (offline_event_id unique, route_stop_id, event_type, payload jsonb, created_by, created_at)
- disputes (rug_id, client_id, type dispute_type, status, notes, created_by, created_at)
- payments, payment_allocations, credit_memos, credit_memo_lines

C) RLS policies:
- Internal roles (admin/office/checkin_staff) manage all.
- Driver can SELECT assigned stops for today +/- 1 day.
- Driver can INSERT events into route_stop_events only (not directly mutate core stop tables).
- Portal users: no stop access.
- For payments/credits: office/admin manage; portal only views invoices and their own payment history.

D) State machine enforcement (DB triggers / constraint functions):
- route_stops transition rules (queued->in_progress->completed/completed_with_exceptions/unable_to_complete)
- completion requires signature and item status constraints
- invoice immutability: if invoices.status in (sent, paid, overdue, disputed) then block edits to invoice_number/total/lines; allow status changes and appending payments/credits.

E) Backfill + stop generation functions:
- Create SQL function build_route_stops_for_date(target_date):
  - For each delivery_list_items loaded_on_truck=TRUE for that date’s delivery list(s), create/ensure a route_stop row per client_id.
  - Attach delivery items as route_stop_items (phase=delivery, status=pending, rug_id set, delivery_list_item_id set).
  - For each pickup_request assigned to driver on that date, ensure same client’s stop exists and attach pickup items (phase=pickup, status=pending, pickup_request_item_id set, rug_number stored via join).
  - If a pickup_request exists without any delivery items, stop still exists.
  - If delivery exists without pickup_request, stop still exists (delivery-only).
- Add indexes so this runs fast.

PHASE 2 — Edge functions (offline-first ingestion + manifest)
A) Add supabase/functions/ingest-stop-events:
- Accept { events: [{ offline_event_id, route_stop_id, event_type, payload }] }
- Validate auth user is driver/admin; if driver, must be assigned_driver_id for stop.
- Insert events with ON CONFLICT DO NOTHING on offline_event_id.
- Apply event effects transactionally:
  - STOP_STARTED -> route_stops.status=in_progress, started_at=now()
  - SIGNATURE_SET -> route_stops.signature_data_url updated
  - ITEM_VERIFIED -> route_stop_items.status=verified
  - ITEM_EXCEPTION -> route_stop_items.status=exception + exception metadata
  - ITEM_DISPUTED -> route_stop_items.status=disputed + create dispute row (type depends on payload)
  - STOP_COMPLETED -> attempt to transition route_stop based on invariants; return error if invariants fail (signature missing, pending items remain, etc.)
- Return updated stop snapshot (stop + items).

B) Add scheduled job (can be via cron in Supabase or external runner):
- daily: build_route_stops_for_date(tomorrow) after check-in confirmations
- notifications (estimate reminders, invoice reminders) using throttle rules

PHASE 3 — Frontend: DriverPortal becomes StopPortal
A) Refactor src/pages/DriverPortal.tsx:
- Replace pickup_requests fetch with route_stops fetch for date
- Stop detail UI:
  - show Delivery section first, then Pickup section
  - one signature component for the stop (reuse SignatureCanvas)
  - each item has verify + notes + photos
  - disputes: refused_delivery vs post_delivery_claim (post claim should not require return; refused should mark exception and create dispute)
- All mutations go through ingest-stop-events.
- Implement offline queue:
  - store events in IndexedDB first
  - background sync loop flushes events batch to ingest function when online
  - show visible “Sync Queue” and per-stop sync status
  - allow stop completion offline; server-side state updates occur when sync returns

B) Evidence uploads:
- For photos: if offline, store file metadata and upload later; once uploaded, emit PHOTO_ATTACHED event with public URL.
- For delivery photos: store in a new bucket (delivery-photos) or reuse pickup-photos with a clear path prefix.

PHASE 4 — Facility: Day-before delivery confirmation
A) Add a new Facility Ops view “Delivery Prep”:
- Query delivery_list_items for tomorrow where rug.status=ready and list is compiling/confirmed
- Check-in staff toggles confirmed_for_delivery=true after physical verification
- This is role-gated to checkin_staff/admin/office (but intended use is check-in)
- Driver cannot set confirmed_for_delivery; driver only sets loaded_on_truck.

PHASE 5 — Accounting primitives
A) Add Office UI:
- payment entry creates payments row + allocations, updates invoice.balance_cents
- credit memo issuance creates credit memo and applies to invoice, updates balance
- Ensure invoice immutability is respected

PHASE 6 — Messaging + throttled notifications
Status note: this phase has materially moved from planning into shipped code. See `docs/platform-1.0-status.md` and `docs/release-evidence/2026-04-01-messaging-reminders-validation.md` for the current truth.

Delivered implementation now includes:
- Shared structured `message_threads` + `messages` workflow mounted in office and portal
- Office Inbox grouped by client/thread
- Portal Messages view for client-side conversation
- Entity-aware deep links from estimate/invoice context into threads
- Thread lifecycle controls (unread, close, archive, reopen, filters)
- Reminder cadence scheduling for estimates and invoices
- 72h collections throttle
- Reminder delivery processing with communication-event logging and thread reflection

Still operationally required:
- live scheduler/cron wiring for automatic cadence execution in each deployed environment
- live provider/secrets verification and release evidence capture after deploy

TESTS / ACCEPTANCE CRITERIA (must all pass)
1) Driver can complete a stop in airplane mode; when online, events sync and stop becomes completed on server.
2) Stop completion is blocked if signature missing or any item still pending (unless stop is completed_with_exceptions with evidence).
3) Delivery-only stops exist and can be completed.
4) Pickup-only stops exist and can be completed.
5) Refused delivery creates dispute record and does NOT mark rug picked_up.
6) Post-delivery claim creates dispute record but rug remains picked_up.
7) Invoice marked sent cannot have line items edited; credits/payments adjust balance via new primitives only.
8) Day-before delivery confirmation is done by check-in staff, and driver load list is based on confirmed_for_delivery.

Keep existing portal flows operational during the refactor:
- PortalPickupsTab continues creating pickup_requests.
- Office DeliveriesTab continues compiling delivery_lists.
Stops are built from these two sources and become the driver’s sole interface.


1) What your repo already has (baseline)

Stack

Vite + React + TypeScript + Supabase JS + TanStack Query (modern SPA). 

package

Pickup workflow (driver proof)

pickup_requests + pickup_request_items with driver assignment, signature (signature_data_url), per-item verification, driver notes, and completion timestamp. 

supabase - [Repo name: markmege…

Driver UI already enforces “all verified + signature” before completion. 

src/pages/DriverPortal

Delivery workflow (office-driven today)

delivery_lists (route_day + target_date + status) and delivery_list_items (confirmed_for_delivery + loaded_on_truck). 

supabase/migrations_archive/202…

Checkout is done via edge function checkout-delivery after list is confirmed, and it generates invoices + invoice PDFs and marks rugs picked_up (your “delivered” status). 

supabase/functions/checkout-del…

 

Changes - [Repo name: markmeger…

Invoice PDF pipeline

Dedicated invoice-pdf edge function generates artifact + signed URL and logs events. 

Implement private-beta billing …

Office/portal both download via supabase.functions.invoke("invoice-pdf"). 

Implement private-beta billing …

Estimates

estimates + estimate_items, plus portal line item approvals (client_approved etc.) are already being built. 

supabase - [Repo name: markmege…

 

feat: enhance PortalEstimatesTa…

Rug lifecycle

rug_status enum is checked_in | in_production | ready | picked_up (picked_up = delivered back). 

supabase - [Repo name: markmege…

2) The production gap (what’s missing / what must change)
A) Your driver execution is not a unified “Stop”

Today:

Driver manages pickup stops via pickup_requests.

Deliveries are managed in office via delivery_lists.

Production spec requires:

Driver executes a single Stop per client/location per route date that may include:

delivery items (from delivery list)

pickup items (from pickup request)

one signature for the stop

item-driven completion with exceptions/disputes

B) No offline-first driver

DriverPortal writes directly to Supabase tables; this will fail under bad network and create partial states. 

src/pages/DriverPortal

C) No explicit state machines (DB-enforced)

You have status enums, but not DB-level guardrails preventing illegal transitions, especially for:

delivery list statuses

pickup completion without evidence

invoice immutability once sent

returned-unable-to-deliver

D) Accounting primitives are incomplete

You have payment_attempts ledger and billing profiles, but no proper:

payments + allocation

credit_memos / adjustments

invoice immutability rules

E) Messaging exists as “events,” not threads

You have communication_events and interactions models, but no portal↔office thread model with throttled notifications. 

supabase - [Repo name: markmege…

 

Lock wholesale pickup requests …

3) Target workflow for THIS repo (no hand-wavy redesign)
Core design decision (recommended)

Keep your existing pickup_requests and delivery_lists (so you don’t break portal + office flows), but add a new “Stop” layer that unifies driver execution:

New driver-centric entities

route_stops (one row per client/location per route_date)

route_stop_items (one row per rug per phase: delivery/pickup)

route_stop_events (idempotent event ingestion for offline-first)

delivery_item_evidence (photos/notes for deliveries; you already have pickup photos)

Then:

Driver UI works entirely off route_stops.

Office keeps compiling delivery lists as today (day-before confirmation stays).

System auto-builds tomorrow’s route_stops from:

delivery_list_items (confirmed + loaded)

pickup_requests (assigned)

This is the smallest refactor that satisfies your “Stop” requirement and preserves your existing office/portal flows.

4) DB Build Contract (tables + states + invariants)
4.1 New enums

route_stop_status: queued | in_progress | completed | completed_with_exceptions | unable_to_complete

route_stop_phase: delivery | pickup

route_stop_item_status: pending | verified | disputed | exception | skipped

dispute_type: refused_delivery | post_delivery_claim

invoice_status: keep existing, but enforce immutability post-sent (see triggers)

4.2 New tables (minimum)

route_stops

id uuid pk

route_date date

client_id uuid -> clients.id

route_day text

assigned_driver_id uuid -> auth.users.id

delivery_list_id uuid -> delivery_lists.id (nullable)

pickup_request_id uuid -> pickup_requests.id (nullable)

status route_stop_status

signature_data_url text (one signature per stop)

started_at, completed_at timestamptz

exception_code text nullable

indexes: (route_date), (assigned_driver_id, route_date), (client_id, route_date)

route_stop_items

id uuid pk

route_stop_id uuid -> route_stops.id

phase route_stop_phase

status route_stop_item_status

rug_id uuid -> rugs.id nullable (delivery always has rug_id; pickup item may not yet map)

pickup_request_item_id uuid -> pickup_request_items.id nullable

delivery_list_item_id uuid -> delivery_list_items.id nullable

notes text

photo_urls text[] default '{}' (for delivery evidence; pickup already has driver_photo_urls)

indexes: (route_stop_id), (phase, status)

route_stop_events (for offline-first)

id uuid pk

offline_event_id uuid unique ✅ idempotency

route_stop_id

event_type text

payload jsonb

created_by uuid

created_at timestamptz default now()

disputes

id uuid pk

rug_id uuid

client_id uuid

type dispute_type

status text enum: open|investigating|resolved|credited|denied

created_by uuid

notes text

created_at

4.3 State machine invariants (DB-enforced)

Stop completion

route_stops.status may transition:

queued -> in_progress -> completed|completed_with_exceptions|unable_to_complete

completed requires:

signature present

every stop_item status in verified|skipped

completed_with_exceptions requires:

signature present

every stop_item in verified|disputed|exception|skipped

at least one item is disputed|exception

unable_to_complete requires:

exception_code set + stop-level note/event

Delivery outcomes

If delivery item verified: set rugs.status='picked_up' and picked_up_at=now() (this matches your current meaning). 

supabase - [Repo name: markmege…

If delivery item refused_delivery: set rug status to ready (or create a “returned” flag) + create dispute record (refused_delivery).

If post_delivery_claim: rug stays picked_up, dispute record created.

Invoice immutability

If invoice is sent or later, block UPDATEs to:

invoice number, line items, totals

allow only:

status changes (paid/overdue/disputed)

append-only financial records (payments/credits)

5) Offline-first driver (mandatory design)
5.1 Frontend: local event queue

Use IndexedDB (lightweight library like idb-keyval or dexie) and store:

event id

stop id

event type (STOP_STARTED, ITEM_VERIFIED, ITEM_EXCEPTION, SIGNATURE_SET, STOP_COMPLETED, PHOTO_ATTACHED)

payload

created_at

synced_at

5.2 Backend: single ingestion edge function

Add: supabase/functions/ingest-stop-events/index.ts

It:

validates auth (driver/admin)

inserts events into route_stop_events (unique on offline_event_id)

applies derived state changes transactionally:

updates route_stops

updates route_stop_items

creates disputes when needed

returns updated stop snapshot

Rule: Driver UI never calls .update() on core tables directly while offline-first is enabled; it calls ingest in batches.

6) Day-before delivery confirmation (fits your current delivery_lists model)

Right now the “confirm for delivery” and “loaded” toggles live in Office DeliveriesTab. 

Add Deliveries UI and backend -…


Your spec requires check-in staff to do day-before physical confirmation.

Implementation (minimal refactor)

Keep delivery_list_items.confirmed_for_delivery but change who sets it:

Check-in staff sets confirmed_for_delivery=true in a new “Delivery Prep” queue page.

Driver sets loaded_on_truck=true morning-of.

Office remains responsible for compiling lists and confirming list readiness.

7) Notifications & messaging (best-practice throttle)

You already log communication_events and have interactions. 

supabase - [Repo name: markmege…

 

Lock wholesale pickup requests …


For production, implement threads via a light wrapper using interactions:

Thread model

interaction_type values:

thread_general

thread_estimate:<estimate_id>

thread_invoice:<invoice_id>

Allow portal users to INSERT interactions only when:

client_id matches their portal linkage

interaction_type is one of the above

body length + rate limiting enforced (server-side)

Throttle (recommended)

Estimates

send on sent

reminders at +24h, +72h, +7d

stop reminders after 3

Invoices
Replace “every 2 days” with standard A/R cadence:

+3 days before due date

due date

7 days overdue

14 days overdue

then weekly statement (one email with all open invoices)
Hard cap: max 1 automated collections email per client per 72h.

8) Accounting primitives (minimal production-safe additions)

You have payment_attempts (good for logging), but you need:

payments

payment_allocations

credit_memos (+ lines)

Do not overbuild. Just enough to keep invoices immutable and reconcile correctly.