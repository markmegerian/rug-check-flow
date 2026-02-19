

## Invoices Tab: Status Tabs + Uninvoiced Services + Draft Generation

### What Changes

Rewrite `InvoicesTab.tsx` to add three features: (1) status filter tabs above the invoice table, (2) an "Uninvoiced Services" section below the table grouped by client, and (3) one-click draft invoice generation that opens the invoice drawer for review.

### Layout

```text
+----------------------------------------------------------+
| [All] [Draft] [Sent] [Paid] [Overdue]                    |
+----------------------------------------------------------+
| Invoice #  | Client       | Date  | Rugs | Total | Status|
|------------|-------------|-------|------|-------|--------|
| INV-2026-001| Pacific Rug | 02-15 |  5   | $2340 | Sent  |
| ...        |              |       |      |       |       |
+----------------------------------------------------------+
|                                                          |
| Uninvoiced Services                                      |
+----------------------------------------------------------+
| Acme Corp (3 rugs, $897.50)              [Generate Draft]|
|   R-4510: Standard Wash, Scotchgard — $400               |
|   R-4508: Deep Wash — $270                               |
|   R-4501: Pet Stain Treatment, Odor Removal — $227.50    |
+----------------------------------------------------------+
| Desert Rug Gallery (1 rug, $270)         [Generate Draft] |
|   ...                                                    |
+----------------------------------------------------------+
```

### Behavior

**Status tabs** (using existing Tabs component):
- Tabs: All, Draft, Sent, Paid, Overdue
- Filters the invoice table; "All" shows everything
- Count badge on each tab showing number of invoices in that status

**Uninvoiced Services section**:
- Sources data from `SEED_CHECK_IN_LOG` (check-in entries that haven't been invoiced yet)
- Groups entries by `clientName`
- Each group shows: client name, rug count, total amount, and a list of rugs with their services
- "Generate Draft" button per client group

**Generate Draft flow**:
- Clicking "Generate Draft" creates a new `Invoice` object with status `"draft"`, auto-generated invoice number, today's date, line items from the uninvoiced entries
- The new invoice is added to the invoices state
- The uninvoiced entries for that client are removed from the uninvoiced list
- The invoice detail drawer opens immediately showing the new draft

**Invoice drawer** (enhanced from current Sheet):
- Shows invoice number, client, date, line items, total
- Action buttons based on status:
  - Draft: "Mark as Sent", "Delete Draft"
  - Sent: "Mark as Paid", "Mark as Overdue"
  - Paid: (read-only, download only)
  - Overdue: "Mark as Paid"
- "Download PDF" button (shows a toast "PDF downloaded" -- no actual PDF generation yet)
- Status dropdown replaced by action buttons for clarity
- Notes field (editable)
- Save button

### Data Flow

- Uninvoiced services come from `SEED_CHECK_IN_LOG` entries
- A local state `uninvoicedEntries` is initialized from the seed data
- When a draft is generated, entries move from `uninvoicedEntries` into a new invoice in `invoices` state
- Invoice numbers auto-increment: `INV-2026-006`, `INV-2026-007`, etc.

### File Changes

1. **Rewrite: `src/components/office/InvoicesTab.tsx`**
   - Add `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` for status filtering
   - Add `uninvoicedEntries` state initialized from `SEED_CHECK_IN_LOG`
   - Group uninvoiced entries by client name
   - "Generate Draft" button per group: creates invoice, removes from uninvoiced, opens drawer
   - Rework drawer actions: status-specific buttons instead of dropdown
   - Add "Download PDF" button (toast only)
   - Keep line items display and notes field

2. **No new files needed** -- all changes in `InvoicesTab.tsx`

### Technical Details

- `uninvoicedEntries: CheckInEntry[]` state, seeded from `SEED_CHECK_IN_LOG`
- Grouping: `Object.groupBy` or reduce to `Record<string, CheckInEntry[]>`
- Invoice number generation: find max existing number, increment
- Status-specific action buttons replace the generic status dropdown for faster workflow
- "Download PDF" calls `toast("PDF downloaded")` as a placeholder
- Tabs component from `@/components/ui/tabs` used for status filtering
- Active tab stored in local state; "All" is default
- Count badges use the existing `Badge` component

