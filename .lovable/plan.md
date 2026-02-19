

## Right Panel: Today's Check-In Log

### Overview
Replace the "Order Summary -- coming soon" placeholder in the right panel with a live, chronological log of all rugs checked in today. Each entry is expandable to show service details and totals. Entries are editable within a 2-hour window for check-in staff (no auth yet, so simulated with a mock role toggle).

### Layout

```text
RIGHT PANEL (~260px)
+----------------------------+
|  Today's Check-Ins (count) |
+----------------------------+
|  10:32 AM                  |
|  R-4521  Acme Corp         |
|  $280.00         [v expand]|
|  -------------------------  |
|  10:15 AM                  |
|  R-4530  Desert Rug Gallery|
|  $195.00         [v expand]|
|  ...                       |
+----------------------------+
```

### Behavior

**Chronological list (newest first)**
- Each row shows: timestamp, rug number (monospace), client name, total price
- Clicking a row expands it inline to reveal:
  - Rug type, dimensions
  - List of selected services with individual prices
  - Total
  - Edit button (if editable)

**Editability rules (simulated for now)**
- Since there is no auth/roles system yet, use a mock `userRole` variable in `CheckInLayout` (default: `"checkin_staff"`)
- Check-in staff: entry is editable for 2 hours after `checkedInAt` timestamp
- Office/admin role: always editable
- "Edit" button appears on eligible rows; clicking it re-loads the entry into the center form for modification
- After re-submission, the log entry updates in place (not duplicated)

**Integration with Check-In flow**
- When `CheckInForm` completes a check-in, the submitted data (rug info + services + total + timestamp) is pushed into the log
- The log lives as state in `CheckInLayout` alongside `pendingRugs`

---

### File Changes

1. **New: `src/components/facility/CheckInLogPanel.tsx`**
   - Accepts `entries` array and `userRole` prop
   - Renders a scrollable list of check-in entries, newest first
   - Each row is a collapsible/expandable section (using Radix Collapsible)
   - Shows edit button based on role + 2-hour window logic
   - Fires `onEdit(entryId)` callback when edit is clicked

2. **New: `src/data/check-in-log.ts`**
   - `CheckInEntry` interface: id, rugNumber, clientName, rugType, length, width, services (id + name + price), totalPrice, checkedInAt (Date), checkedInBy (string)
   - Optional: a few seed entries for visual testing

3. **Edit: `src/components/facility/CheckInLayout.tsx`**
   - Add `checkInLog` state (array of `CheckInEntry`)
   - Add mock `userRole` state (`"checkin_staff" | "office" | "admin"`)
   - On check-in complete: build a `CheckInEntry` from form data and prepend to log
   - Pass log + role to `CheckInLogPanel`
   - Handle `onEdit` callback: load entry back into center form for editing (set `editingEntryId` state)
   - On re-submit of an edited entry: update the existing log entry instead of creating a new one
   - Replace the placeholder right panel div with `<CheckInLogPanel />`

4. **Edit: `src/components/facility/CheckInForm.tsx`**
   - Extend `onCheckInComplete` callback to pass the full form data (not just rugId) so the layout can build a log entry
   - Accept optional `editingEntry` prop for when re-editing a previously checked-in rug

---

### Technical Details

- `CheckInEntry` stores the resolved service names and prices at check-in time (snapshot, not computed from current pricing)
- Editability: `isEditable = userRole === "admin" || userRole === "office" || (userRole === "checkin_staff" && Date.now() - entry.checkedInAt < 2 * 60 * 60 * 1000)`
- Editing loads the entry into the center form and sets a flag so re-submission updates the log entry rather than creating a new one
- The panel uses `ScrollArea` for overflow, consistent with the left panel
- Collapsible rows use `@radix-ui/react-collapsible` (already installed)
- No DB persistence yet -- all in-memory state, seeded with a couple of mock entries for visual testing

