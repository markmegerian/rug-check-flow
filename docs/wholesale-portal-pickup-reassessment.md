# Wholesale Portal & Pickup Handling — Reassessment and Plan

## 1. Current state (what exists today)

### Data model
- **pickup_requests**: `client_id`, `route_day`, `scheduled_date`, `status` (pending → confirmed → assigned → completed | cancelled), `notes`, `assigned_driver_id`, `completed_at`, `signature_data_url`, etc.
- **pickup_request_items**: `pickup_request_id`, `rug_number`, `rug_type`, `length`, `width`, `is_new`, `estimate_requested`, `estimate_request_details`, `verified`, `driver_notes`, `driver_photo_urls`, `rug_id`, `checked_in_rug_id`.
- **Rugs**: `status` = `checked_in` | `in_production` | `ready` | `picked_up`. Portal “ready” list = rugs with `status = 'picked_up'` (already at client, eligible for next pickup).

### Actors and flows
| Actor | Where | What they do |
|-------|--------|----------------|
| **Wholesale client** | Portal → Pickups tab | Request pickup (creates empty request), then add “rugs on file” + “new rugs”, optional estimate flags, notes. Can edit/cancel only while status = pending. |
| **Office** | Facility Office → Pickup Requests tab | See all requests (by route day), change status (pending → confirmed → assigned → completed/cancelled), assign driver. |
| **Driver** | Driver portal | See assigned pickups, verify each rug, add signature, complete. |
| **Facility** | Facility Ops | PendingPickupsPanel: rugs `status = ready` → mark “picked up” (→ `picked_up`). |

### Where it lives in code
- **Portal**: `WholesalePortal.tsx` (tabs) → `PortalPickupsTab.tsx` (~650 lines, one big component).
- **Office**: `PickupRequestsTab.tsx` (list by route, status + driver assignment).
- **Driver**: `DriverPortal.tsx` (assigned pickups, verify + signature + complete).
- **Guards**: `workflow-guards.ts` (status transitions, portal can only cancel pending).

---

## 2. Problems (why it feels “not structured well”)

### 2.1 Portal UX and flow
- **Two-step flow**: User must “Request pickup” (empty request), then “add rugs below and save.” Intent is “I want these rugs picked up” but the UI splits “create request” and “say which rugs.”
- **Jargon**: “Rugs on file” vs “rugs not in our system” + route day / region / scheduled date — a lot for a non-technical client.
- **One pending only**: Only one pending pickup per client; extra state (draft vs saved) and “allow empty” save add complexity.
- **Estimate handling**: Estimate request is global (one checkbox + one note for whole request); DB is per-item. Logic is split between UI and save.

### 2.2 Code structure
- **PortalPickupsTab does everything**: Init (client + rugs + pickups), schedule, save (delete all items + re-insert), cancel, and all local state (draft rugs, draft notes, hydrate from pending). Hard to test or reuse.
- **No shared pickup model**: Portal uses `PortalPickup` (from mock-portal types), office uses `PickupRequestRow` + items, driver uses `DriverPickup`. Same tables, different shapes and no single “pickup + items” abstraction.
- **Duplicate fetch logic**: Portal fetches client (route_day, address), then rugs (status = picked_up), then pickups + items, with fallbacks for estimate columns. Office and driver each have their own fetch.

### 2.3 Office side
- **Flat list**: Pickup requests grouped by route day; status and driver assignment are there but the “lifecycle” (pending → confirm → assign → complete) isn’t visually clear.
- **No direct link** from “client requested pickup” to “this is what they asked for” (items/notes) without opening something.

### 2.4 Data / product clarity
- **Rug semantics**: “Ready” in portal = `picked_up` (at client). “Ready” in facility = `ready` (at facility). Same word, different meaning.
- **pickup_request_items**: Holds both “what client asked for” (rug_number, is_new, estimate_*) and “what driver did” (verified, driver_notes, driver_photo_urls). One table, two phases of lifecycle.

---

## 3. Target: clearer mental model

### 3.1 One-sentence lifecycle
**Client** requests a pickup (date + list of rugs + notes) → **Office** confirms and assigns a driver → **Driver** goes out, verifies rugs, gets signature, completes.

### 3.2 What we want
- **Portal**: One clear action — “Request a pickup” — with a single screen: when (next route date or simple date), which rugs (checkboxes for known rugs + “add another” for new), and optional notes. No “schedule then add rugs” split.
- **Office**: Clear stages (e.g. Pending → Confirmed → Assigned → Completed) with one place to see client, date, rug list, notes, and to confirm / assign driver.
- **Driver**: Unchanged in spirit (assigned list, verify, sign, complete); optional later: align item shape with shared types.
- **Code**: One place that defines “pickup + items” and how to load/save it; portal and office (and optionally driver) use that instead of ad‑hoc types and fetches.

---

## 4. Proposed implementation plan

### Phase A — Portal: single “request a pickup” flow (no DB change)
**Goal**: One screen that captures “I want a pickup on this date with these rugs.”

1. **Single step**
   - If no pending pickup: one card “Request a pickup” with:
     - Date (read-only “We pick up on {route_day}s; next date: {date}” or simple date picker if you want).
     - “Which rugs?”: checkboxes for rugs we’ve cleaned before (`picked_up`) + “Add a rug” for new (name + optional size).
     - Optional: “I need estimates” + one note.
     - Optional notes.
     - One button: **“Request pickup”**.
   - On submit: create `pickup_requests` row **and** in the same flow insert `pickup_request_items` (no “empty request then add rugs” step).
   - If pending pickup exists: show “Your upcoming pickup” with same fields editable and **“Save changes”** / **“Cancel request”**.

2. **Extract data layer**
   - Add **`usePortalPickup`** (or `usePickupRequest`) hook that:
     - Takes `clientId`.
     - Loads client (route_day, address), rugs (`picked_up`), and pickups + items for that client.
     - Exposes: `pendingPickup`, `pastPickups`, `readyRugs`, `requestPickup({ scheduledDate, rugIds, newRugs, notes, estimateNote })`, `updatePickup(...)`, `cancelPickup(...)`.
   - **PortalPickupsTab** becomes a thin UI that uses this hook and renders the single screen (no 600-line monolith).

3. **Copy and labels**
   - Use plain language everywhere: “Rugs we’ve cleaned before,” “Add a rug we don’t have yet,” “Request a pickup,” “Your upcoming pickup,” “Past pickups.”

### Phase B — Office: clearer pickup lifecycle (optional UI only)
**Goal**: Office sees the same lifecycle and can act on it without changing DB.

1. **Same data, clearer UX**
   - Keep `PickupRequestsTab` but optionally:
     - Group or filter by status (e.g. “Pending confirmation” vs “Assigned” vs “Completed”).
     - Show client name, date, rug count, and a way to expand and see rug list + notes (from `pickup_request_items` + `notes`).
   - Buttons: “Confirm,” “Assign driver,” “Mark completed” / “Cancel” as today, but with clearer labels and order.

2. **Reuse**
   - If you introduce a shared **pickup + items** type and a small **`getPickupWithItems(requestId)`** (or hook), office can use it so “what client asked for” is the same structure as portal.

### Phase C — Shared types and fetch (optional but recommended)
**Goal**: One shape for “pickup request + items” so portal, office, and driver don’t diverge.

1. **Shared type**
   - e.g. `PickupWithItems`: `id`, `client_id`, `scheduled_date`, `route_day`, `status`, `notes`, `assigned_driver_id`, `items: { id?, rug_number, rug_type, length, width, is_new, estimate_requested?, estimate_details?, verified?, driver_notes? }[]`.
   - Define in `src/types/pickup.ts` or under `integrations/supabase`.

2. **Centralized fetch**
   - One function or hook that loads `pickup_requests` + `pickup_request_items` and maps to `PickupWithItems`. Portal and office (and driver if you want) call it instead of reimplementing.

3. **No schema change**
   - Keep `pickup_requests` and `pickup_request_items` as they are; only normalize in app code.

### Phase D — Future (only if needed)
- **Rug wording**: In UI, avoid “ready” for both facility and portal; e.g. “At your location” (portal) vs “Ready for delivery” (facility).
- **Estimate flow**: If estimate requests become more important, consider a small separate flow or table; for now, per-item estimate fields are fine if UI keeps “one note for all.”
- **Driver**: Align driver types with `PickupWithItems` when touching that code.

---

## 5. Suggested order of work

1. **Phase A.2** — Add **`usePortalPickup`** (or equivalent) and move all fetch/save/cancel logic out of `PortalPickupsTab` into this hook. Keep current UI behavior so you don’t change UX yet.
2. **Phase A.1** — Change portal UI to **single-step “Request pickup”**: one form (date + rugs + notes), submit = create request + insert items in one go. When a pending request exists, same form with “Save” / “Cancel.”
3. **Phase A.3** — Copy and labels pass (“Rugs we’ve cleaned before,” etc.).
4. **Phase C** (optional) — Introduce shared `PickupWithItems` type and one load function; refactor portal (then office/driver) to use it.
5. **Phase B** (optional) — Office tab: group/filter by status, expand to show rug list + notes, clearer Confirm / Assign / Complete.

---

## 6. Out of scope for this plan

- Changing `pickup_request_status` or table schema.
- Changing driver app flow (verify + signature + complete).
- Facility “mark picked up” (rug status → `picked_up`) or check-in flow.
- Estimates beyond “one checkbox + one note” for the whole request.

---

## 7. Summary

- **Main issue**: Portal flow is two-step and the whole pickup story is spread across one big component and several ad‑hoc types.
- **Fix**: One-step portal “Request a pickup” (create request + items together), a dedicated hook for portal pickup data and actions, and optional shared types + office UX tweaks so the whole flow is easier to follow and maintain.

If you tell me which phase you want to do first (A.1 single-step UI vs A.2 hook extraction), I can outline concrete steps and file-level changes next.
