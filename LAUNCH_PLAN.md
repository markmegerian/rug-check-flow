# RugBoost Launch Strategy

## Project Summary

**RugBoost** is a full-stack rug cleaning/restoration business management platform built with React + TypeScript + Vite + Tailwind + shadcn/ui on the frontend and Supabase (Postgres + Auth + Edge Functions) on the backend. It serves five distinct user personas through role-gated portals:

| Portal | Route | Roles | Purpose |
|--------|-------|-------|---------|
| **Facility Ops** | `/facility/ops` | admin, office, checkin_staff | Rug check-in, production board (Kanban), pending pickups |
| **Office** | `/facility/office` | admin, office | Pricing management, invoices, estimates, clients, pickup requests, deliveries |
| **Wholesale Portal** | `/portal` | any authenticated | Client-facing rug tracking, pickup requests, estimates, invoices |
| **Driver Portal** | `/driver` | admin, driver | Pickup verification, rug confirmation, signature capture |
| **Admin** | `/admin` | admin | User management, roles, audit log |

### Tech Stack

- **Frontend:** React 18, TypeScript, Vite 5, Tailwind CSS 3, shadcn/ui (Radix primitives), React Router 6, TanStack Query, react-hook-form + zod, dnd-kit, recharts
- **Backend:** Supabase (hosted Postgres), Row Level Security (RLS), Edge Functions (dev-login, checkout-delivery, send-estimate-email)
- **Auth:** Supabase Auth with email/password, role-based access via `user_roles` table

### Current State

- TypeScript compiles cleanly (zero errors)
- Production build succeeds (919 KB JS bundle -- needs code splitting)
- 1 placeholder test passes
- 15 Supabase migrations applied
- Core workflows are functional: check-in, production board, estimates, invoices, deliveries, pickup requests, driver verification
- Several areas still use mock data instead of live Supabase queries

---

## Audit Findings

### A. Architecture & Code Quality

| # | Finding | Severity | Area |
|---|---------|----------|------|
| A1 | **Admin panel uses mock data** -- `UsersTab` and `AuditLogTab` read from `MOCK_ADMIN_USERS` / `MOCK_AUDIT_LOG` instead of Supabase tables that already exist (`user_roles`, `profiles`, `audit_log`) | High | Admin |
| A2 | **Portal rugs tab uses hardcoded mock data** -- `PortalRugsTab` reads from `PORTAL_RUGS` array, never queries the DB | High | Portal |
| A3 | **Portal estimates/invoices tabs need live data** -- `PortalEstimatesTab` and `PortalInvoicesTab` should query Supabase using the portal user's `client_id` | High | Portal |
| A4 | **Heavy use of `(supabase as any)`** -- The generated types file doesn't include `estimates`, `estimate_items`, `communication_events`, `pickup_requests`, or `pickup_request_items` tables, forcing unsafe casts everywhere | High | Types |
| A5 | **No error boundaries** -- An uncaught error in any component crashes the entire app | Medium | Reliability |
| A6 | **Single 920 KB JS bundle** -- No code splitting; all portals load even if user only needs one | Medium | Performance |
| A7 | **DevAccountSwitcher always visible** -- Should be stripped from production builds or hidden behind env flag | Medium | Security |
| A8 | **No loading skeletons in most tabs** -- Many tabs show plain text "Loading..." instead of skeleton placeholders | Low | UX |
| A9 | **Inconsistent toast imports** -- Some files use `toast` from `@/hooks/use-toast`, others use `useToast()` -- both work but the codebase should pick one pattern | Low | Consistency |
| A10 | **No data refresh / real-time subscriptions** -- All data is fetched once on mount; no Supabase real-time listeners, no polling, no refetch-on-focus | Medium | UX |

### B. Database & Security

| # | Finding | Severity | Area |
|---|---------|----------|------|
| B1 | **Missing Supabase types for newer tables** -- `estimates`, `estimate_items`, `communication_events`, `pickup_requests`, `pickup_request_items` are not in `types.ts` | High | Types |
| B2 | **RLS policies need review for completeness** -- Phase 2 migration adds estimate/portal RLS, but pickup_request insert/update policies may be too permissive for production | High | Security |
| B3 | **No database indexes beyond PKs** -- Queries filter by `client_id`, `status`, `scheduled_date`, `assigned_driver_id` frequently -- indexes would improve performance at scale | Medium | Performance |
| B4 | **`audit_log` table exists but isn't being written to from the frontend** -- Only the mock data array is displayed | Medium | Observability |
| B5 | **Signature data stored as base64 data URL directly in `pickup_requests`** -- Will bloat the table row size; should be stored in Supabase Storage | Medium | Data |
| B6 | **No soft-delete pattern** -- Records are hard-deleted (e.g., invoices, pickup requests) with no recovery mechanism | Low | Data |

### C. UX & Design

| # | Finding | Severity | Area |
|---|---------|----------|------|
| C1 | **`index.html` still has placeholder metadata** -- Title says "Lovable App", description says "Lovable Generated Project" | High | Launch |
| C2 | **No global navigation or breadcrumbs** -- Once inside a portal, the only way back is the browser back button or a small arrow link | Medium | Navigation |
| C3 | **No confirmation dialogs for destructive actions** -- Deleting invoices, cancelling pickups happen on a single click with no "Are you sure?" | Medium | UX |
| C4 | **Mobile experience is good but untested** -- Responsive layouts exist but no viewport-specific tests | Low | QA |
| C5 | **No dark mode toggle** -- `next-themes` is installed as a dependency but not wired up | Low | UX |
| C6 | **No favicon or branded assets** -- Uses default Vite/Lovable favicon | Low | Launch |

### D. Missing Features for Launch

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| D1 | **Email sending for estimates** -- Edge function `send-estimate-email` exists but isn't called from the UI when marking "sent" | High | The status is updated but no actual email goes out |
| D2 | **PDF generation for invoices** -- "Download PDF" button shows a toast but doesn't generate anything | Medium | |
| D3 | **Photo upload to Supabase Storage** -- Check-in form captures photos locally but never uploads them | High | Photos are lost on page refresh |
| D4 | **Search/filter on production board** -- No way to search rugs by tag, client, or status on the Kanban board | Medium | |
| D5 | **Reporting / dashboard** -- No analytics view showing revenue, rug throughput, turnaround time | Medium | recharts is installed but unused |
| D6 | **Password reset flow** -- No "forgot password" on the auth page | Medium | |
| D7 | **Notifications** -- No email or in-app notifications for status changes (rug ready, estimate approved, etc.) | Low | |
| D8 | **Bulk operations** -- No way to select multiple rugs for batch status change, invoice generation, etc. | Low | |

---

## Proposed Launch Roadmap

### Phase 1: Data Integrity & Security (Critical Path)

**Goal:** Every screen reads and writes real data; security is production-ready.

| Task | Description | Files Affected |
|------|-------------|---------------|
| 1.1 Regenerate Supabase types | Run `supabase gen types` to include all tables (`estimates`, `estimate_items`, `communication_events`, `pickup_requests`, `pickup_request_items`) and remove all `(supabase as any)` casts | `src/integrations/supabase/types.ts`, all components using `as any` |
| 1.2 Wire Admin Users to DB | Replace `MOCK_ADMIN_USERS` with live queries to `profiles` + `user_roles`. Support create/edit/deactivate users via Supabase Auth admin API or edge function | `UsersTab.tsx`, `RolesTab.tsx`, `AdminPanel.tsx` |
| 1.3 Wire Admin Audit Log to DB | Query `audit_log` table instead of mock array. Add audit logging calls throughout the app (check-in, status changes, invoice actions, etc.) | `AuditLogTab.tsx`, various components |
| 1.4 Wire Portal Rugs to live data | Replace `PORTAL_RUGS` mock with Supabase query filtered by the portal user's `client_id` | `PortalRugsTab.tsx` |
| 1.5 Wire Portal Estimates & Invoices | Query `estimates` and `invoices` by `client_id` for portal users | `PortalEstimatesTab.tsx`, `PortalInvoicesTab.tsx` |
| 1.6 RLS audit & hardening | Review all RLS policies; ensure portal users can only see their own data; staff can't escalate privileges; driver can only see assigned pickups | All migration files |
| 1.7 Hide DevAccountSwitcher in prod | Only render when `import.meta.env.DEV` is true | `DevAccountSwitcher.tsx`, `App.tsx` |

### Phase 2: Core Feature Completion

**Goal:** Complete the workflows that are currently stubbed.

| Task | Description | Files Affected |
|------|-------------|---------------|
| 2.1 Photo upload to Storage | Upload check-in photos to Supabase Storage, save URLs on the rug record, display in production board and portal | `CheckInForm.tsx`, `ProductionRugCard.tsx`, `PortalRugsTab.tsx` |
| 2.2 Estimate email sending | Call `send-estimate-email` edge function when estimate status transitions to "sent" | `EstimatesTab.tsx` |
| 2.3 Invoice PDF generation | Generate a basic PDF (using a library like `jspdf` or a server-side edge function) for the "Download PDF" action | `InvoicesTab.tsx`, new edge function |
| 2.4 Password reset | Add "Forgot password?" link on auth page using `supabase.auth.resetPasswordForEmail()` | `Auth.tsx` |
| 2.5 Confirmation dialogs | Add `AlertDialog` before destructive actions (delete invoice, cancel pickup, etc.) | Various components |
| 2.6 Error boundaries | Wrap each portal in a React error boundary with a user-friendly fallback | `App.tsx`, new `ErrorBoundary.tsx` |

### Phase 3: Performance & Polish

**Goal:** Production-quality performance and UX.

| Task | Description | Files Affected |
|------|-------------|---------------|
| 3.1 Code splitting | Lazy-load each page/portal with `React.lazy` + `Suspense` to reduce initial bundle | `App.tsx` |
| 3.2 Real-time subscriptions | Add Supabase real-time listeners for rugs status changes (production board), pickup completions, estimate approvals | `ProductionBoard.tsx`, `PendingPickupsPanel.tsx`, `PortalRugsTab.tsx` |
| 3.3 Skeleton loading states | Replace "Loading..." text with skeleton components in all tabs | All tab components |
| 3.4 Search & filters | Add search/filter controls to production board, rugs list, pickup requests | `ProductionBoard.tsx`, `PortalRugsTab.tsx` |
| 3.5 Dashboard / reporting | Build a simple analytics dashboard showing rug throughput, revenue by period, turnaround times | New `DashboardPage.tsx` |
| 3.6 Signature storage optimization | Move signature data URLs from the DB column to Supabase Storage; store only the URL reference | `DriverPortal.tsx`, migration |
| 3.7 Database indexes | Add indexes on frequently filtered columns (`rugs.client_id`, `rugs.status`, `pickup_requests.assigned_driver_id`, etc.) | New migration |

### Phase 4: Launch Readiness

**Goal:** Branding, metadata, and deployment.

| Task | Description | Files Affected |
|------|-------------|---------------|
| 4.1 Update HTML metadata | Set proper title, description, OG tags, favicon for RugBoost | `index.html`, `public/` |
| 4.2 Environment configuration | Create `.env.example`, ensure all env vars are documented, configure production Supabase project | `.env.example`, docs |
| 4.3 Dark mode toggle | Wire up `next-themes` with a toggle in the header | `App.tsx`, new `ThemeToggle.tsx` |
| 4.4 E2E / integration tests | Add tests for critical paths: check-in flow, invoice creation, estimate lifecycle, pickup request | New test files |
| 4.5 CI/CD pipeline | Configure GitHub Actions for lint, type-check, test, and build on every PR | `.github/workflows/` |
| 4.6 Global navigation | Add a consistent header/nav bar across all portals with breadcrumbs and sign-out | New `AppLayout.tsx`, all pages |
| 4.7 Clean up unused mock data | Remove or archive `mock-portal.ts`, `mock-admin.ts`, `mock-clients.ts`, `mock-driver.ts`, `mock-invoices.ts`, `mock-pending-rugs.ts` once all live data is wired | `src/data/` |

---

## Recommended Priority Order

If working sequentially, the order of maximum impact per effort is:

1. **1.1** Regenerate types (unblocks everything)
2. **1.7** Hide dev switcher in prod (quick security win)
3. **4.1** Update HTML metadata (quick launch win)
4. **1.2 + 1.3** Admin panel live data
5. **1.4 + 1.5** Portal live data
6. **2.1** Photo upload (critical check-in workflow)
7. **3.1** Code splitting (quick perf win)
8. **2.5 + 2.6** Confirmation dialogs + error boundaries
9. **1.6** RLS audit
10. **2.2 + 2.3** Email + PDF generation
11. **3.2 + 3.3** Real-time + skeletons
12. **Remaining Phase 3 + 4** items

---

## What I Can Start Working On Now

I'm ready to begin implementing any of these items. The recommended starting point would be the Phase 1 critical-path items since they affect data integrity and security. Specifically:

1. **Hide the DevAccountSwitcher in production** (1.7) -- a one-line fix
2. **Fix the HTML metadata** (4.1) -- a few lines in `index.html`
3. **Code-split the pages** (3.1) -- `React.lazy` + `Suspense` in `App.tsx`
4. **Wire the admin panel to live data** (1.2 + 1.3)
5. **Wire the portal to live data** (1.4 + 1.5)

Let me know which items you'd like to prioritize, or I can start working through the recommended priority order above.
