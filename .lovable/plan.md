

## Production Tab: Kanban Board

### Overview
Replace the Production placeholder with a horizontal kanban board showing rugs moving through five stages. Each rug is a card with service status indicators. Staff interactions are streamlined with bulk actions and role-gated controls.

### Stages (columns, left to right)

```text
| Checked In | In Progress | QC | Ready | Out for Delivery |
|------------|-------------|-----|-------|------------------|
| [rug card] | [rug card]  |     |       |                  |
| [rug card] |             |     |       |                  |
```

### Data Model

**New file: `src/data/production.ts`**

- `ProductionStage` type: `"checked_in" | "in_progress" | "qc" | "ready" | "out_for_delivery"`
- `PRODUCTION_STAGES` array with id, label, color for each stage
- `ServiceTask` interface: extends service info with `status` (`"pending" | "in_progress" | "complete"`), `assignedTo` (staff name or null)
- `ProductionRug` interface: id, rugNumber, clientName, rugType, length, width, stage, services (array of `ServiceTask`), checkedInAt
- `SEED_PRODUCTION_RUGS`: 6-8 mock rugs spread across stages for visual testing
- Mock `currentStaffName` constant (e.g. `"Alex"`) to simulate staff identity

### Rug Card (`ProductionRugCard.tsx`)

Each card displays:
- **Rug number** (monospace, bold) and **client name**
- **Dimensions** (e.g. "8x10 ft")
- **Service list** with status indicators:
  - Pending: gray circle
  - In Progress: blue spinning/pulse dot
  - Complete: green checkmark
  - Each service shows name and its status icon inline
- **Assigned-to badge** only visible in Edit Mode

**Expand on click** (inline, not modal):
- Shows full service detail
- "Start All Assigned" button: sets all services assigned to current staff from pending to in_progress
- "Complete All Assigned" button: sets all in_progress services assigned to current staff to complete
- "Advance Stage" button: enabled only when ALL services on the rug are complete; moves rug to next stage

**Staff filtering (default view)**:
- By default, services not assigned to the current staff are dimmed (shown but de-emphasized)
- A "Show All" toggle in the card reveals all services equally

**Edit Mode** (toggled from board header):
- Service assignment dropdowns become visible on each service row
- Allows reassigning services to different staff members

### Board Component (`ProductionBoard.tsx`)

- Horizontal scrollable layout with five columns
- Each column: stage header with count badge, scrollable list of rug cards
- **Board header bar** with:
  - "Edit Mode" toggle (switch component)
  - Staff filter display showing current mock staff name
- Columns use `ScrollArea` for vertical overflow
- Cards are not drag-and-drop (stage advancement is action-based only)

### File Changes

1. **New: `src/data/production.ts`** -- Types, stage definitions, seed data
2. **New: `src/components/facility/ProductionBoard.tsx`** -- Board layout with columns, header, edit mode toggle
3. **New: `src/components/facility/ProductionRugCard.tsx`** -- Individual rug card with expand, service status, bulk actions
4. **Edit: `src/pages/FacilityOps.tsx`** -- Replace production placeholder with `<ProductionBoard />`

### Technical Details

- All state is in-memory (no DB), seeded from `SEED_PRODUCTION_RUGS`
- Stage advancement: when "Advance Stage" is clicked, rug moves to next stage in the array; button disabled if not all services complete
- "Start All Assigned" filters `services` where `assignedTo === currentStaff && status === "pending"`, sets to `"in_progress"`
- "Complete All Assigned" filters `services` where `assignedTo === currentStaff && status === "in_progress"`, sets to `"complete"`
- Edit Mode is a boolean toggle at board level, passed down to cards
- No drag-and-drop to keep it simple and avoid accidental stage changes on tablets
- Responsive: columns scroll horizontally on narrower screens

