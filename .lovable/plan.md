

## RugBoost: `/facility/ops` — Primary Operations Screen

### Overview
The daily working screen for facility staff. A fixed two-column layout with vertical tab navigation on the left and tab content filling the right. Tabs switch content in-place without changing the URL.

---

### Layout Structure

**Left Column (narrow, fixed)**
- Vertical tab selector with three tabs stacked vertically
- Active tab visually highlighted
- Tabs: **Check-In** | **Production** | **Pending Pickups**
- Keyboard navigable (arrow keys to switch tabs)

**Right Column (fills remaining space)**
- Renders the active tab's content
- No page reload, no route change — pure in-memory tab switching

---

### Tab 1: Check-In

The center panel form as previously specified:
- **Header bar**: Rug number + client name (always visible)
- **Form fields**: Rug type, length/width, condition notes, photo upload (1–20 required)
- **Service selection**: Grouped by category, live price calculation, client-specific override highlights, service preset selector
- **Submit**: Single "Complete Check-In" button, clears form on success, full keyboard navigation

> Left and right sub-panels of the check-in workflow (e.g., rug queue, order summary) will be added when those specs are provided.

---

### Tab 2: Production

- Placeholder panel with "Production tracking — coming soon" message
- Skipped per earlier instruction; ready to be built out when specs arrive

---

### Tab 3: Pending Pickups

- Placeholder panel with "Pending Pickups — coming soon" message
- Ready to be built out when specs arrive

---

### Technical Approach

- Create `FacilityOps` page component at `/facility/ops`
- Use local React state for active tab (no URL changes)
- Vertical `Tabs` layout using existing Radix tabs, restyled for vertical orientation
- Check-in form built with `react-hook-form` + zod validation
- Photo upload as a local file picker with preview thumbnails (backend storage deferred until Supabase is connected)
- Service selection as grouped checkboxes with computed price display
- All form fields support tab-key navigation
- Tablet + desktop first layout using CSS grid

