# AGENTS.md — Rug Check Flow

## Project Overview

Rug Check Flow is a multi-role operations platform for a rug cleaning/processing facility. It manages the full lifecycle of rugs — from client intake and check-in, through production, to delivery — with role-based portals for facility staff, office workers, drivers, wholesale clients, and admins.

## Tech Stack

- **Framework:** React 18 + TypeScript (strict mode off — `noImplicitAny: false`, `strictNullChecks: false`)
- **Build:** Vite 5 with SWC (via `@vitejs/plugin-react-swc`)
- **Styling:** Tailwind CSS 3 with CSS custom properties for theming; font: Plus Jakarta Sans
- **Component library:** shadcn/ui (Radix primitives + `class-variance-authority`); components live in `src/components/ui/`
- **State / data fetching:** TanStack React Query v5
- **Routing:** React Router DOM v6
- **Backend:** Supabase (auth, Postgres via PostgREST, Edge Functions)
- **Forms:** React Hook Form + Zod validation
- **Testing:** Vitest + Testing Library (jsdom); test files match `src/**/*.{test,spec}.{ts,tsx}`
- **Linting:** ESLint 9 flat config with `typescript-eslint` and `react-hooks` / `react-refresh` plugins

## Repository Layout

```
├── src/
│   ├── App.tsx                  # Root: providers, router, all routes
│   ├── main.tsx                 # Entry point
│   ├── index.css                # Tailwind directives + CSS custom properties
│   ├── components/
│   │   ├── ui/                  # shadcn/ui primitives (do not hand-edit)
│   │   ├── admin/               # Admin panel components
│   │   ├── driver/              # Driver portal components
│   │   ├── facility/            # Facility ops components (check-in, production)
│   │   ├── office/              # Back-office components (clients, invoices, etc.)
│   │   ├── portal/              # Wholesale client portal components
│   │   ├── DevAccountSwitcher.tsx
│   │   ├── NavLink.tsx
│   │   └── ProtectedRoute.tsx
│   ├── contexts/
│   │   └── AuthContext.tsx      # Auth state + role management
│   ├── data/                    # Mock data and static constants
│   ├── hooks/                   # Custom hooks (use-mobile, use-toast)
│   ├── integrations/supabase/
│   │   ├── client.ts            # Supabase client init (auto-generated)
│   │   └── types.ts             # Generated DB types (auto-generated)
│   ├── lib/
│   │   └── utils.ts             # Tailwind `cn()` helper
│   ├── pages/                   # Top-level route pages
│   └── test/
│       └── setup.ts             # Vitest global setup
├── supabase/
│   ├── functions/               # Edge Functions (checkout-delivery, dev-login, send-estimate-email)
│   └── migrations/              # SQL migrations (ordered by timestamp)
├── public/                      # Static assets
├── scripts/
│   └── setup-env.sh             # Environment bootstrap script
├── .env                         # Supabase env vars (VITE_SUPABASE_*)
├── tailwind.config.ts
├── vite.config.ts
├── vitest.config.ts
├── eslint.config.js
├── tsconfig.json
└── components.json              # shadcn/ui config
```

## Key Concepts

### Roles & Auth

The app uses Supabase Auth with a `user_roles` table and a `has_role()` Postgres function. Four roles exist:

| Role            | Access                                     |
| --------------- | ------------------------------------------ |
| `admin`         | Everything, including admin panel          |
| `office`        | Facility ops + back-office tabs            |
| `checkin_staff` | Facility ops only                          |
| `driver`        | Driver portal                              |

Wholesale/portal users are any authenticated user (no special role required). The `ProtectedRoute` component gates routes by `allowedRoles`.

### Database Tables

Defined in `src/integrations/supabase/types.ts` (auto-generated — do not hand-edit):

- `clients` — wholesale client accounts (with `pricing_tier` and `route_day`)
- `rugs` — individual rug records with status lifecycle
- `pickup_requests` — client-initiated pickup requests
- `estimates` / `estimate_line_items` — cost estimates with line items
- `invoices` / `invoice_line_items` — billing
- `delivery_lists` / `delivery_list_items` — route-day delivery management
- `services` — service catalog with pricing
- `user_roles` — role assignments
- `audit_log` — admin audit trail

### Rug Status Lifecycle

`checked_in` → `in_production` → `ready` → `picked_up`

Defined as the `rug_status` enum and mirrored in `src/data/production.ts`.

### Important Enums

- `app_role`: `admin`, `office`, `checkin_staff`, `driver`
- `rug_status`: `checked_in`, `in_production`, `ready`, `picked_up`
- `delivery_list_status`: `compiling`, `confirmed`, `checked_out`
- `invoice_status`: `draft`, `sent`, `paid`, `overdue`
- `pricing_tier`: `standard`, `preferred`, `vip`

## Development Commands

| Command          | Purpose                            |
| ---------------- | ---------------------------------- |
| `npm run dev`    | Start Vite dev server (port 8080)  |
| `npm run build`  | Production build                   |
| `npm run lint`   | Run ESLint                         |
| `npm run test`   | Run Vitest (single run)            |
| `npm run test:watch` | Run Vitest in watch mode       |

## Coding Conventions

### Imports

- Use the `@/` path alias for all imports from `src/` (e.g., `import { cn } from "@/lib/utils"`).
- The Supabase client is imported as `import { supabase } from "@/integrations/supabase/client"`.

### Components

- UI primitives come from `@/components/ui/` (shadcn/ui). Do not modify these files directly; use the shadcn CLI to add or update components.
- Domain components are organized by role/area: `admin/`, `driver/`, `facility/`, `office/`, `portal/`.
- Pages are in `src/pages/` and correspond 1:1 with routes in `App.tsx`.

### Styling

- Use Tailwind utility classes. Combine with `cn()` from `@/lib/utils` for conditional classes.
- Theme colors use CSS custom properties (e.g., `hsl(var(--primary))`). Custom brand colors are under `rugboost`, `cream`, and `navy` namespaces.
- Custom animations are defined in `tailwind.config.ts` under `keyframes` / `animation`.

### Data Access

- All database operations go through the typed Supabase client. Use the generated types (`Tables`, `TablesInsert`, `TablesUpdate`, `Enums`) for type safety.
- Use TanStack React Query for server state management (`useQuery`, `useMutation`).
- Mock data in `src/data/` is for development/testing purposes.

### Routing

- All routes are defined in `src/App.tsx`. New routes must be added **above** the catch-all `*` route.
- Protected routes use the `ProtectedRoute` wrapper with an optional `allowedRoles` prop.

### Testing

- Tests use Vitest with jsdom environment and `@testing-library/react`.
- Test setup is in `src/test/setup.ts`.
- Place test files alongside source files using `.test.ts` or `.spec.ts` suffixes.

## Files Not to Edit Manually

- `src/integrations/supabase/types.ts` — auto-generated from the database schema
- `src/integrations/supabase/client.ts` — auto-generated Supabase client
- `src/components/ui/*` — managed by shadcn/ui CLI
- `bun.lockb` / `package-lock.json` — managed by package managers

## Environment Variables

The app requires three `VITE_SUPABASE_*` variables set in `.env`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

These are checked in for this project. Do not commit secrets or service-role keys.

## Supabase Edge Functions

Located in `supabase/functions/`:

- `checkout-delivery` — handles delivery checkout workflow
- `dev-login` — development-only login helper
- `send-estimate-email` — sends estimate emails to clients

## Before Submitting Changes

1. Run `npm run lint` and fix any errors.
2. Run `npm run test` and ensure all tests pass.
3. Run `npm run build` to verify the production build succeeds.
