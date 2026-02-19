

## Admin Section: Users, Roles, and Audit Log

### What This Is

A new admin page at `/admin` with three tabs: Users, Roles, and Audit Log. This is internal-only tooling for managing who can access the system and reviewing what happened. No payouts, no platform configuration.

### Layout

```text
+----------------------------------------------------------+
| Admin                                                    |
| [Users]  [Roles]  [Audit Log]                            |
+----------------------------------------------------------+

Users tab (default):
+----------------------------------------------------------+
| Name          | Email                | Role        | Status|
|---------------|----------------------|-------------|-------|
| Sarah Chen    | sarah@riverside..    | office      | Active|
| Amir Farouk   | amir@pacificrugs..  | admin       | Active|
| Tom Whitfield | tom@grandmas..       | checkin_staff| Active|
| Driver Mike   | mike@rugboost..      | driver      | Active|
| New Hire      | newhire@rugboost..   | checkin_staff| Invited|
+----------------------------------------------------------+
| [Add User]                                               |
+----------------------------------------------------------+

Roles tab:
+----------------------------------------------------------+
| Role           | Description              | Users |      |
|----------------|--------------------------|-------|------|
| admin          | Full system access       |   1   |      |
| office         | Office & billing access  |   1   |      |
| checkin_staff  | Check-in only            |   2   |      |
| driver         | Driver portal only       |   1   |      |
+----------------------------------------------------------+
| Read-only — roles are predefined.                        |
+----------------------------------------------------------+

Audit Log tab:
+----------------------------------------------------------+
| Timestamp         | User          | Action               |
|-------------------|---------------|-----------------------|
| 2/19 2:34 PM      | Amir Farouk   | Completed pickup dp-1|
| 2/19 1:15 PM      | Sarah Chen    | Checked in R-4510    |
| 2/19 12:40 PM     | Sarah Chen    | Updated client-3     |
| 2/19 11:00 AM     | System        | Invoice INV-2026-001 |
+----------------------------------------------------------+
| Read-only log. No actions.                               |
+----------------------------------------------------------+
```

### Behavior

**Users tab** (default):
- Table of all system users with name, email, role, and status (Active/Invited)
- Click a row to open a side drawer (Sheet) for editing name, email, and role assignment
- Role is a Select dropdown with the predefined roles
- "Add User" button opens the same drawer in create mode
- Save updates local state, shows toast
- No delete -- just deactivate (status toggle) to keep audit trail clean

**Roles tab**:
- Read-only table of predefined roles
- Each row shows: role name, description, count of users with that role
- No add/edit/delete -- roles are system-defined
- Simple informational view

**Audit Log tab**:
- Read-only table of system events in reverse chronological order
- Each row: timestamp, user name, action description
- No filtering for now -- just a scrollable list
- Seed data covers recent actions (check-ins, client updates, pickup completions, invoice creation)

### Data

**New file: `src/data/mock-admin.ts`**

```text
AdminUser interface:
  id, name, email, role (admin | office | checkin_staff | driver), status (active | invited)

MOCK_ADMIN_USERS: 5 seed users spanning all roles

RoleDefinition interface:
  id, name, description

ROLE_DEFINITIONS: 4 predefined roles with descriptions

AuditEntry interface:
  id, timestamp (Date), userName, action (string)

MOCK_AUDIT_LOG: ~8 seed entries covering various actions
```

### File Changes

1. **New: `src/data/mock-admin.ts`**
   - `AdminUser` interface and `MOCK_ADMIN_USERS` seed data
   - `RoleDefinition` interface and `ROLE_DEFINITIONS` array
   - `AuditEntry` interface and `MOCK_AUDIT_LOG` seed data

2. **New: `src/pages/AdminPanel.tsx`**
   - Same sidebar-tab layout pattern as `FacilityOffice.tsx`
   - Three tabs: Users, Roles, Audit Log
   - Local tab state, no routes

3. **New: `src/components/admin/UsersTab.tsx`**
   - User table with click-to-edit via Sheet drawer
   - Add User button creates new user
   - Role assignment via Select dropdown
   - Status toggle (Active/Invited)
   - Local state seeded from mock data

4. **New: `src/components/admin/RolesTab.tsx`**
   - Read-only table of role definitions
   - Shows user count per role (computed from users list passed as prop)

5. **New: `src/components/admin/AuditLogTab.tsx`**
   - Read-only table of audit entries
   - Reverse chronological, formatted timestamps
   - No actions, no filtering

6. **Edit: `src/App.tsx`**
   - Add route: `/admin` -> `AdminPanel`

### Technical Details

- Follows the same layout pattern as `FacilityOffice.tsx`: sidebar nav with icon + label, main content area
- Users tab uses Sheet (side drawer) for edit -- same pattern as ClientsTab
- Role dropdown uses existing Select component with the 4 predefined roles
- Roles tab receives the current users array as a prop to compute counts
- Audit log is purely presentational -- no state mutations, just renders seed data
- `AdminUser.role` matches the existing `UserRole` type from `check-in-log.ts` plus `"driver"`
- No auth gating yet -- this is UI scaffolding like the rest of the app

