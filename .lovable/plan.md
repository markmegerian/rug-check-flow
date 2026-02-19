

## Clients Tab: Row-Click Drawer with Portal Users

### What Changes

Rewrite `ClientsTab.tsx` so that clicking any table row opens the client drawer (not just a pencil icon). The drawer is restructured into two sections: client info (editable) and portal users management (inline create/delete). The "Add Client" button stays in the header and opens the same drawer in create mode.

### Drawer Layout

```text
+--------------------------------------+
| Pacific Rug Gallery            [Save]|
| "Update client details"             |
+--------------------------------------+
| Client Name    [Pacific Rug Gallery ]|
| Contact Name   [Amir Farouk        ]|
| Phone  [(555) 456-7890]  Email [...] |
| Address        [3300 NW 23rd Ave... ]|
| Pricing Tier   [VIP v]              |
| Notes          [VIP -- high volume..]|
+--------------------------------------+
| Portal Users                         |
+--------------------------------------+
| amir@pacificrugs.com   Active  [x]  |
| sales@pacificrugs.com  Active  [x]  |
|                                      |
| [Email___________] [Create Login]    |
+--------------------------------------+
```

### Behavior

**Table changes:**
- Remove the pencil icon column
- Make entire row clickable (cursor-pointer, hover highlight already exists)
- Row click opens the drawer with that client's data

**Drawer -- Client Info section** (top):
- Same fields as today: name, contact, phone, email, address, pricing tier, notes
- Save button in the footer

**Drawer -- Portal Users section** (bottom, only shown when editing an existing client):
- List of portal users associated with this client
- Each user row shows: email, status badge (Active/Invited), and a remove button (X)
- Below the list: inline form with an email input and "Create Login" button
- Creating a login adds the user to the local list with status "Invited" and shows a toast
- Removing a user removes from local list with a toast
- No separate user management screen, no modal, no navigation

### Data Model Changes

**Add to `Client` interface** in `mock-clients.ts`:
```
portalUsers: PortalUser[]
```

**New type** in `mock-clients.ts`:
```
interface PortalUser {
  id: string;
  email: string;
  status: "active" | "invited";
}
```

**Seed data**: 2-3 clients get portal users, others get empty arrays.

### File Changes

1. **Edit: `src/data/mock-clients.ts`**
   - Add `PortalUser` interface and export it
   - Add `portalUsers` field to `Client` interface
   - Add seed portal users to a few clients (Pacific Rug Gallery gets 2 users, Bella Casa gets 1, others get `[]`)

2. **Rewrite: `src/components/office/ClientsTab.tsx`**
   - Remove pencil icon column; make rows clickable
   - Restructure drawer: client info fields at top, portal users section below (only in edit mode)
   - Inline "Create Login" form: email input + button, adds to local `portalUsers` array on the client
   - Remove button per portal user
   - Toast feedback for create/remove actions

### Technical Details

- Portal users are stored on the `Client` object in local state -- no separate state map needed
- When saving a client edit, the full client object (including portal users) is updated in the `clients` state array
- "Create Login" validates email is non-empty and not already in the list
- No auth integration yet -- this is UI scaffolding for future Supabase auth hookup
- The portal users section is hidden when adding a new client (no client ID yet)

