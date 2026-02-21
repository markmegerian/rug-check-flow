

# Add Route Day Filter to Clients Tab

## What Already Exists
The **Deliveries tab** already has a full weekly route view grouping clients by their assigned route day, with compile/confirm/checkout workflow. No changes needed there.

The **Clients tab** shows a "Route Day" column but has no way to filter the list by day.

## What Will Change

**File: `src/components/office/ClientsTab.tsx`**

Add a route day filter dropdown in the header bar next to the "Add Client" button. When a day is selected, the client table will only show clients assigned to that route day. An "All" option resets the filter.

### Implementation Details

1. Add a `filterDay` state variable (default: `""` meaning "All")
2. Add a `Select` dropdown in the header between the title and the "Add Client" button with options: All, Monday through Sunday
3. Filter the `clients` array before rendering the table rows: if `filterDay` is set, only show clients whose `route_day` matches
4. Show a count badge next to the filter indicating how many clients match

This is a small, self-contained UI change -- no database or backend modifications needed.

