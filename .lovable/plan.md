

## Pricing Tab: Simplified Single Table with Client Overrides

### What Changes

Replace the current PricingTab (grouped tables + Sheet drawers + presets section) with a single flat table and a client selector dropdown. No modals, no sheets, no grouped sub-tables.

### Layout

```text
+--------------------------------------------------+
| Services          [Client: None v]               |
+--------------------------------------------------+
| Service        | Category | Base Price | Unit    |
|----------------|----------|-----------|---------|
| Standard Wash  | Cleaning | $3.50     | / sq ft |
| Deep Wash      | Cleaning | $5.00     | / sq ft |
| ...            |          |           |         |
+--------------------------------------------------+
```

When a client is selected:

```text
+--------------------------------------------------------------+
| Services          [Client: Pacific Rug Gallery v]  [Clear x] |
+--------------------------------------------------------------+
| Service        | Category | Base Price | Unit    | Override  |
|----------------|----------|-----------|---------|-----------|
| Standard Wash  | Cleaning | $3.50     | / sq ft | [__3.00_] |
| Deep Wash      | Cleaning | $5.00     | / sq ft | [______]  |
| ...            |          |           |         |           |
+--------------------------------------------------------------+
```

### Behavior

- **Client selector**: A `Select` dropdown in the header. Default is "None" (no client). Selecting a client reveals the "Client Override" column.
- **Override column**: Each cell is an inline `Input` (number). Empty means "use base price". Entering a value sets a per-client override. Clearing the input removes the override.
- **No row duplication**: The service list is always the same rows. Overrides are stored in a separate map keyed by `clientId -> serviceId -> price`.
- **Inline base price editing**: Base price cells are also editable inline (click to edit, blur to save). No sheet/modal needed.
- **Presets section**: Kept below the table as-is (it's small and useful), but the preset sheet drawers remain since they're multi-select forms that don't fit inline.

### Data Model

- **Client overrides**: `Record<string, Record<string, number>>` -- maps `clientId` to `serviceId` to override price
- Seed a couple of overrides for visual testing (e.g., Pacific Rug Gallery gets a discount on Standard Wash)

### File Changes

1. **Rewrite: `src/components/office/PricingTab.tsx`**
   - Remove grouped sub-tables, replace with single flat table
   - Remove service add/edit Sheet drawers
   - Add client selector dropdown in header (from `MOCK_CLIENTS`)
   - Add `clientOverrides` state map
   - Base price cells become inline-editable inputs (click to focus, blur to save)
   - Override column appears conditionally when `selectedClientId` is set
   - Override cells are inline number inputs
   - Keep presets section at bottom (unchanged)

### Technical Details

- `selectedClientId: string | null` state controls override column visibility
- `clientOverrides: Record<string, Record<string, number>>` stores all overrides
- When override input is empty/cleared, the entry is removed from the map (not stored as 0)
- Base price inline edit: each row shows the price as text; clicking makes it an input; blur saves
- No new files needed -- this is a rewrite of `PricingTab.tsx` only
- Presets section and its Sheet drawer are preserved (multi-select service picker doesn't work inline)

