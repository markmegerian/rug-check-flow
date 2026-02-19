

## Wholesale Portal: Rug List with Status Filters + Tabs

### What This Is

A client-facing portal at `/portal` where wholesale clients see their rugs, pickups, and invoices. No dashboard -- the default landing is a rug list with status filters and summary pills.

### Layout

```text
+----------------------------------------------------------+
| Pacific Rug Gallery                                      |
| [Rugs]  [Pickups]  [Invoices]                            |
+----------------------------------------------------------+

Rugs tab (default):

+----------------------------------------------------------+
| [12 Total] [3 In Progress] [2 Ready] [1 Delivered]       |
+----------------------------------------------------------+
| [All] [In Progress] [Ready] [Delivered]                  |
+----------------------------------------------------------+
| Rug #    | Type    | Services         | Status    | Date |
|----------|---------|------------------|-----------|------|
| R-4501   | Persian | Deep Wash, Fri.. | In Progr. | 2/17 |
| R-4442   | Kilim   | Standard Wash    | Ready     | 2/15 |
| R-4430   | Afghan  | Antique Restor.. | Delivered | 2/14 |
+----------------------------------------------------------+

Pickups tab:

+----------------------------------------------------------+
| Ready for Pickup (2 rugs)                                |
+----------------------------------------------------------+
| R-4442  Kilim   Standard Wash         Ready since 2/15   |
| R-4460  Persian Silk Treatment, Mo..  Ready since 2/16   |
|                                                          |
| [Request Pickup]                                         |
+----------------------------------------------------------+
| Scheduled Pickups                                        |
+----------------------------------------------------------+
| Feb 20 — 2 rugs (R-4442, R-4460)         Status: Pending|
+----------------------------------------------------------+

Invoices tab:

+----------------------------------------------------------+
| Invoice #  | Date  | Rugs | Total   | Status   |        |
|------------|-------|------|---------|----------|--------|
| INV-2026-001| 2/15 |  5   | $2,340  | Sent     | [View] |
| INV-2026-002| 2/12 |  3   | $890    | Paid     |        |
+----------------------------------------------------------+
```

### Behavior

**Header**: Shows the client name (hardcoded to "Pacific Rug Gallery" for now). Tabs below for Rugs / Pickups / Invoices. Uses local tab state, not routes.

**Rugs tab** (default):
- Summary pills at the top showing counts by status (Total, In Progress, Ready, Delivered)
- Status filter tabs below the pills: All, In Progress, Ready, Delivered
- Table of rugs belonging to this client, filtered by selected status
- Clicking a row expands inline to show service details and dates (no drawer, no navigation)
- Statuses mapped from internal production stages: checked_in/in_progress -> "In Progress", qc/ready -> "Ready", out_for_delivery -> "Delivered"

**Pickups tab**:
- "Ready for Pickup" section listing rugs with stage `ready`
- "Request Pickup" button -- shows a toast "Pickup requested" (placeholder)
- "Scheduled Pickups" section below showing mock scheduled pickups
- Simple list layout, no table overhead

**Invoices tab**:
- Table of invoices for this client (filtered from `MOCK_INVOICES` by `clientId`)
- Clicking a row expands inline to show line items (no drawer)
- Shows status badge, total, date
- "Download PDF" link per invoice (toast placeholder)

### Data

**New mock data file**: `src/data/mock-portal.ts`
- `PortalRug` interface: maps production data to client-facing view (rug number, type, size, services list, portal status, checked-in date)
- `PORTAL_RUGS`: seed data for Pacific Rug Gallery -- reuses some rug numbers from production data, adds a few more for variety (~8-10 rugs across statuses)
- `PortalPickup` interface: `{ id, date, rugNumbers, status }`
- `PORTAL_PICKUPS`: 1-2 mock scheduled pickups
- Portal status type: `"in_progress" | "ready" | "delivered"`

**Reuses existing data**:
- `MOCK_INVOICES` filtered by `clientId: "client-3"` (Pacific Rug Gallery)

### File Changes

1. **New: `src/data/mock-portal.ts`**
   - `PortalStatus` type, `PortalRug` interface, `PORTAL_RUGS` seed data
   - `PortalPickup` interface, `PORTAL_PICKUPS` seed data
   - All scoped to Pacific Rug Gallery for now

2. **New: `src/pages/WholesalePortal.tsx`**
   - Main page component with client header and tab navigation (Rugs / Pickups / Invoices)
   - Uses local state for active tab, no routes
   - Renders the three tab components

3. **New: `src/components/portal/PortalRugsTab.tsx`**
   - Summary pills (count badges by status)
   - Status filter tabs
   - Rug table with inline row expansion for details
   - No drawer, no navigation

4. **New: `src/components/portal/PortalPickupsTab.tsx`**
   - Ready for pickup list
   - Request pickup button (toast)
   - Scheduled pickups list

5. **New: `src/components/portal/PortalInvoicesTab.tsx`**
   - Invoice table filtered to this client
   - Inline row expansion for line items
   - Download PDF button (toast)

6. **Edit: `src/App.tsx`**
   - Add route: `/portal` -> `WholesalePortal`

### Technical Details

- Client is hardcoded to Pacific Rug Gallery (`client-3`) -- no auth yet, this is UI scaffolding
- Tab state is local `useState`, not URL-based -- keeps it simple
- Portal statuses are a simplified mapping: facility uses 5 stages, portal shows 3
- Inline expansion uses a `expandedRow` state (rug ID or null), toggled on row click
- Summary pills use `Badge` or small div with counts, not a dashboard widget
- No new dependencies needed -- uses existing UI components (Table, Badge, Tabs, Button)
- The portal layout is intentionally simpler than the facility views -- no sidebar nav, just a header with tabs

