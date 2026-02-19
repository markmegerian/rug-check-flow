

## Check-In Tab: Three-Panel Layout

### Overview
Replace the current single-panel `CheckInForm` with a three-panel simultaneous layout when the Check-In tab is active. All three panels are visible at once on desktop/tablet.

### Layout

```text
+------------------+------------------------+------------------+
|  LEFT PANEL      |  CENTER PANEL          |  RIGHT PANEL     |
|  ~280px          |  flex-1                |  (future)        |
|                  |                        |                  |
|  Pending Rugs    |  Active Check-In Form  |  placeholder     |
|  grouped by      |  (existing form,       |  "Order Summary" |
|  client          |   mostly unchanged)    |  coming soon     |
|                  |                        |                  |
+------------------+------------------------+------------------+
```

---

### Left Panel: `PendingRugsPanel`

**Walk-In Drop-Off section (top, always visible)**
- Inline section titled "+ Walk-In Drop-Off"
- Client search input (text field with filtering against mock client list)
- Once client selected: rug number input appears inline
- Pressing Enter or clicking "Add" loads the rug into the center form (sets rugNumber + clientName)
- No modal, no navigation -- just two input fields that expand inline

**Pending Rugs List (below walk-in section)**
- Grouped by wholesale client name with client headers
- Each rug row shows:
  - Rug number (monospace, large text)
  - Type (if known, smaller muted text)
  - Size (if known, e.g. "8x10")
  - Requested services (inline, truncated with ellipsis)
- Clicking a rug row populates the center form with that rug's data
- After successful check-in, the rug disappears from the list immediately
- Scrollable within the panel

**Data source**: Mock data array for now (no DB yet). Simulates rugs from verified pickups and walk-ins.

---

### Center Panel: Existing `CheckInForm`

Minor modifications:
- Accept a `selectedRug` prop so clicking a rug in the left panel pre-fills the form
- Accept an `onCheckInComplete` callback so the left panel can remove the checked-in rug
- Remove the rugNumber and clientName manual inputs when a rug is loaded from the left panel (they become read-only display)
- Keep all existing functionality (photos, services, pricing, presets)

---

### Right Panel: Placeholder

- Simple placeholder: "Order Summary -- coming soon"
- Reserved for future use (no specs yet)

---

### File Changes

1. **New: `src/data/mock-pending-rugs.ts`**
   - Mock data: array of pending rugs with clientName, rugNumber, rugType, length, width, requestedServices
   - Grouped by client for display

2. **New: `src/components/facility/PendingRugsPanel.tsx`**
   - Walk-in drop-off inline section at top
   - Pending rugs list grouped by client
   - Click handler to select a rug

3. **New: `src/components/facility/CheckInLayout.tsx`**
   - Three-panel CSS grid container (`grid-cols-[280px_1fr_260px]`)
   - Manages shared state: selected rug, pending rugs list
   - Wires left panel selection to center form
   - Wires check-in completion to remove rug from left panel

4. **Edit: `src/components/facility/CheckInForm.tsx`**
   - Add `selectedRug` prop (optional) to pre-fill form fields
   - Add `onCheckInComplete` callback prop
   - When selectedRug is set, populate form via `form.reset()` with rug data
   - On successful submit, call `onCheckInComplete` with the rug number

5. **Edit: `src/pages/FacilityOps.tsx`**
   - Replace `<CheckInForm />` with `<CheckInLayout />` for the checkin tab

---

### Technical Details

- State management: `CheckInLayout` holds `pendingRugs` state (initialized from mock data) and `selectedRugId`
- Selecting a rug sets `selectedRugId`, which passes the rug object to `CheckInForm`
- On check-in complete: filter rug out of `pendingRugs`, clear `selectedRugId`, form resets
- Walk-in drop-off: pushes a new entry into `pendingRugs` then auto-selects it
- Panel heights: all three panels are `h-full overflow-y-auto` within the grid
- Responsive: on smaller screens, the grid collapses (left panel stacks above center, right panel hidden)

