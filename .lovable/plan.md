

## Wire Services via Junction Table

### Why
Replace the current `rugs.services` text array with a proper `rug_services` junction table. This gives referential integrity, price snapshots at check-in time, and correct data for production board and invoices.

### Database Changes

**Create `rug_services` table:**
- `id` (uuid, PK)
- `rug_id` (uuid, FK to rugs.id, NOT NULL)
- `service_id` (uuid, FK to services.id, NOT NULL)
- `unit_price` (numeric, NOT NULL) -- price snapshot at check-in
- `line_total` (numeric, NOT NULL) -- calculated total at check-in
- `created_at` (timestamptz, default now())

RLS policies: same pattern as rugs (authenticated can view, staff/office/admin can insert/update).

The existing `rugs.services` text[] column will be kept temporarily for backward compatibility but no longer written to by new code.

### Code Changes

**1. CheckInForm.tsx**
- On submit, after inserting the rug row, insert one `rug_services` row per selected service with the snapshotted `unit_price` and `line_total`.
- Stop writing to `rugs.services` array (or write service names there as a denormalized cache for simple display -- optional).

**2. CheckInLayout.tsx**
- When fetching today's log, join `rug_services` with `services` to get service names for display in the log panel.

**3. ProductionBoard.tsx**
- Change the query to join `rug_services` + `services` instead of reading `rugs.services` array.
- Display service names from the joined data.

**4. ProductionRugCard.tsx**
- Update the `DbRug` type to accept services as `{ name: string; line_total: number }[]` instead of `string[]`.

**5. InvoicesTab.tsx (New Invoice flow)**
- When building line items for a new invoice, read from `rug_services` to get the already-calculated prices rather than re-computing from the services table. This ensures invoice prices match what was quoted at check-in.

### Technical Details

```text
Junction Table Schema:
+------------------+
|   rug_services   |
+------------------+
| id (PK)          |
| rug_id (FK)      |-----> rugs.id
| service_id (FK)  |-----> services.id
| unit_price       |  (snapshot)
| line_total       |  (snapshot)
| created_at       |
+------------------+
```

Migration SQL will:
1. Create the `rug_services` table with foreign keys and RLS
2. Migrate existing data from `rugs.services` text[] into the new table where possible
3. Keep `rugs.services` column intact (no destructive change)

### Sequence
1. Run migration to create table + RLS
2. Update CheckInForm to write to junction table on submit
3. Update CheckInLayout log fetch to join junction table
4. Update ProductionBoard + ProductionRugCard to use joined service data
5. Update InvoicesTab new-invoice flow to read from junction table

