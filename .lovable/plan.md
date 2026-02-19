

## Pickup Requests: Editable Inline with Lock State

### What Changes

Rewrite `PortalPickupsTab.tsx` so each pickup request is editable inline (date, rug selection, notes) until it gets locked (confirmed). When locked, the same fields render as read-only text with a persistent banner. No separate view, no modal, no navigation.

### Layout

```text
Unlocked pickup (status: pending):
+----------------------------------------------------------+
| Pickup Request — Feb 20                                  |
+----------------------------------------------------------+
| Date         [2026-02-20    ]                            |
| Rugs         [x] RB-1004  [x] RB-1005  [ ] RB-1010     |
| Notes        [Please call before arriving__________]     |
|                                                          |
|                              [Cancel Request] [Save]     |
+----------------------------------------------------------+

Locked pickup (status: confirmed):
+----------------------------------------------------------+
| ! This pickup has been confirmed and can no longer be    |
|   edited.                                                |
+----------------------------------------------------------+
| Pickup Request — Feb 25                                  |
+----------------------------------------------------------+
| Date         Feb 25, 2026                                |
| Rugs         RB-1010                                     |
| Notes        —                                           |
+----------------------------------------------------------+
```

### Behavior

**Editable state** (status = `"pending"`):
- Date input (type="date") pre-filled with the pickup date
- Checkboxes for each "ready" rug -- checked if included in this pickup's `rugNumbers`
- Notes text input (optional, free text)
- "Save" button updates local state with new date/rugs/notes, shows toast
- "Cancel Request" button removes the pickup from state, shows toast
- All fields are standard form inputs, inline in the card

**Locked state** (status = `"confirmed"`):
- Persistent alert banner at top of the card: "This pickup has been confirmed and can no longer be edited."
- Same fields render as plain text (not inputs)
- Date shows formatted date, rugs show comma-separated rug numbers, notes show text or "—"
- No action buttons

**"Request Pickup" flow** (existing button in Ready section):
- Creates a new pickup with status `"pending"`, today's date, all ready rugs selected by default
- New pickup appears in the list below in editable state

### Data Changes

**Update `PortalPickup` interface** in `mock-portal.ts`:
- Add `notes?: string` field
- Seed data: add `notes: "Please call before arriving"` to pk-1

### File Changes

1. **Edit: `src/data/mock-portal.ts`**
   - Add `notes?: string` to `PortalPickup` interface
   - Add notes to pk-1 seed data

2. **Rewrite: `src/components/portal/PortalPickupsTab.tsx`**
   - Local state: `pickups` (initialized from `PORTAL_PICKUPS`), each pickup tracks date, rugNumbers, notes, status
   - "Ready for Pickup" section stays the same (list of ready rugs + Request Pickup button)
   - "Request Pickup" creates a new pending pickup and appends to state
   - Each pickup card renders conditionally:
     - `pending`: date input, rug checkboxes (from ready rugs list), notes input, Save/Cancel buttons
     - `confirmed`: Alert banner + read-only text for all fields
   - Save updates the pickup in local state, shows toast
   - Cancel removes from local state, shows toast

### Technical Details

- `pickups` state: `useState<PortalPickup[]>` seeded from `PORTAL_PICKUPS`
- Each pickup card is a single `div` with conditional rendering based on `pickup.status`
- Lock banner uses the existing `Alert` / `AlertDescription` component with a `Lock` icon
- Rug checkboxes use the existing `Checkbox` component from `@/components/ui/checkbox`
- Date input uses the existing `Input` component with `type="date"`
- Notes uses `Input` with `type="text"`
- No new dependencies, no new files beyond the two edits

