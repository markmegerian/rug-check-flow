# AGENTS.md

## Cursor Cloud specific instructions

### Overview

MR Intranet ("RugBoost") is a React/TypeScript SPA for rug-care business operations. It is a pure frontend app backed by a **remote hosted Supabase** project (no local backend or database required).

### Quick reference

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Dev server | `npm run dev` (port 8080) |
| Lint | `npm run lint` |
| Test | `npm run test` |
| Build | `npm run build` |

### Environment setup

Copy `.env.example` to `.env` before first run. The defaults connect to the hosted Supabase project — no additional secrets are required for the frontend to load and render.

### Caveats

- The Vite dev server binds to `::` (all interfaces) on port **8080**.
- Supabase credentials are baked into `src/integrations/supabase/client.ts` as fallbacks, so the app works even without `.env` vars, but the `.env` file is still recommended.
- The `role-scope.integration.test.ts` tests are skipped by default because they require live Supabase user credentials (`OFFICE_USER_EMAIL`, `PORTAL_USER_EMAIL`, etc.).
- Login requires a provisioned Supabase account — there is no self-registration; accounts are created via the `admin-provision-employee` edge function.
