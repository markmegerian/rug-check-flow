

## Office Page: `/facility/office`

### Overview
A new page at `/facility/office` following the same vertical tab nav pattern as `/facility/ops`. Contains three tabs: Pricing, Invoices, and Clients. All edit/create forms open in right-side Sheet drawers (no modals, no route changes).

### Layout

```text
+----------+--------------------------------------------+
| Pricing  |                                            |
| Invoices |  Tab content area                          |
| Clients  |  (full-width, scrollable)                  |
|          |                                            |
+----------+--------------------------------------------+
```

Same vertical nav pattern as `FacilityOps.tsx`.

---

### Tab 1: Pricing

**Main view**: Editable table of all services from `src/data/services.ts`, grouped by category.

Each row shows:
- Service name
- Category
- Base price
- Unit (sqft / flat)
- Edit button

**Header actions**:
- "Add Service" button
- Preset management section (list of presets, edit/create)

**Sheet drawers**:
- "Add/Edit Service" sheet: form with name, category (select), base price, unit (radio)
- "Add/Edit Preset" sheet: form with preset name, multi-select of services

All changes update the in-memory state (no DB yet).

---

### Tab 2: Invoices

**Main view**: Table of mock invoices, newest first.

Each row shows:
- Invoice number
- Client name
- Date
- Rug count
- Total amount
- Status (Draft / Sent / Paid / Overdue)
- View/Edit button

**Sheet drawer**: Invoice detail/edit form showing:
- Client info (read-only)
- Line items (rug number, services, subtotal per rug)
- Totals
- Status change dropdown
- Notes field

Mock data: 4-5 seed invoices referencing existing clients.

---

### Tab 3: Clients

**Main view**: Table of wholesale clients.

Each row shows:
- Client name
- Contact info (phone, email)
- Rug count (total checked in)
- Outstanding balance
- Edit button

**Header actions**: "Add Client" button

**Sheet drawer**: Add/Edit Client form with:
- Client name
- Contact name
- Phone
- Email
- Address
- Notes
- Pricing tier (standard / preferred / VIP) for future discount logic

Mock data: seed from existing `MOCK_CLIENTS` list with added detail.

---

### File Changes

1. **New: `src/pages/FacilityOffice.tsx`**
   - Same vertical tab nav pattern as `FacilityOps.tsx`
   - Three tabs: Pricing, Invoices, Clients
   - Icons: DollarSign, FileText, Users

2. **New: `src/components/office/PricingTab.tsx`**
   - Service table grouped by category
   - Preset list section
   - State initialized from `SERVICES` and `SERVICE_PRESETS`
   - Opens Sheet drawer for add/edit service and add/edit preset

3. **New: `src/components/office/InvoicesTab.tsx`**
   - Invoice table with status badges
   - Opens Sheet drawer for invoice detail/edit

4. **New: `src/components/office/ClientsTab.tsx`**
   - Client table
   - Opens Sheet drawer for add/edit client

5. **New: `src/data/mock-clients.ts`**
   - `Client` interface (id, name, contactName, phone, email, address, notes, pricingTier, rugCount, outstandingBalance)
   - Seed data from existing `MOCK_CLIENTS` names

6. **New: `src/data/mock-invoices.ts`**
   - `Invoice` interface (id, invoiceNumber, clientName, date, rugCount, totalAmount, status, lineItems, notes)
   - 4-5 seed invoices

7. **Edit: `src/App.tsx`**
   - Add route: `<Route path="/facility/office" element={<FacilityOffice />} />`

### Technical Details

- All state in-memory, seeded from mock data files
- Sheet component (already installed via `@radix-ui/react-dialog`) used for all drawers -- slides in from right
- Tables use the existing `src/components/ui/table.tsx` components
- Status badges use existing `Badge` component with color variants
- Forms use `react-hook-form` + `zod` for validation, matching existing patterns
- No cross-page state sharing needed; each tab manages its own state
- Pricing tab edits are local state only (they don't retroactively change check-in log prices)

