# AGENTS.md – AI Coding Assistant Guide

This file provides context and instructions for AI coding assistants (Cursor, Copilot, etc.) working on this codebase.

## Project Overview

A Lovable-built web application for rug cleaning/facility operations with multiple role-based portals: Admin, Facility Ops, Facility Office, Wholesale Portal, and Driver Portal. Uses Supabase for backend and auth.

## Tech Stack

- **Framework**: React 18 + TypeScript
- **Build**: Vite 5
- **Styling**: Tailwind CSS, shadcn-ui (Radix UI primitives)
- **State**: TanStack React Query, React Context (AuthContext)
- **Routing**: React Router v6
- **Backend**: Supabase (auth, database, edge functions)
- **Forms**: React Hook Form + Zod
- **Testing**: Vitest, Testing Library
- **Linting**: ESLint 9

## Project Structure

```
src/
├── components/       # UI components
│   ├── ui/           # shadcn-ui primitives (do not modify unless customizing)
│   ├── admin/        # Admin panel components
│   ├── driver/       # Driver portal components
│   ├── facility/     # Facility ops & office components
│   ├── office/       # Office-specific components
│   └── portal/       # Wholesale/client portal components
├── contexts/         # React contexts (AuthContext)
├── data/             # Mock data, services, production config
├── hooks/            # Custom React hooks
├── integrations/     # Supabase client & types
├── lib/              # Utilities (cn, etc.)
├── pages/            # Route-level page components
└── test/             # Test setup and utilities
```

## Development Commands

```sh
npm install          # Install dependencies
npm run dev          # Start dev server (Vite)
npm run build        # Production build
npm run lint         # Run ESLint
npm run test         # Run Vitest (single run)
npm run test:watch   # Run Vitest in watch mode
npm run preview      # Preview production build
```

## Environment Setup

- Supabase: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`
- Optional: Run `./scripts/setup-env.sh` for npm/git credentials in fresh containers

## Coding Conventions

- **Imports**: Use `@/` path alias for `src/` (e.g. `@/components/ui/button`)
- **Components**: Functional components with TypeScript; prefer named exports
- **Styling**: Tailwind utility classes; use `cn()` from `@/lib/utils` for conditional classes
- **Forms**: React Hook Form + Zod validation; use shadcn Form components
- **Data fetching**: TanStack Query for server state; mock data in `src/data/` for development

## Role-Based Access

Routes are protected via `ProtectedRoute` with `allowedRoles`:

- `admin` – Admin panel only
- `office` – Facility office, facility ops
- `checkin_staff` – Facility ops
- `driver` – Driver portal
- Wholesale portal – general authenticated users

## Key Patterns

- **Supabase client**: Import from `@/integrations/supabase/client`
- **Auth**: Use `AuthContext` for current user and role
- **Protected routes**: Wrap pages with `<ProtectedRoute allowedRoles={[...]}>`
- **UI components**: Use shadcn components from `@/components/ui/`; extend via composition

## Testing

- Tests live in `src/test/` and colocated `*.test.ts(x)` files
- Use Vitest + Testing Library for component tests
- Run `npm run test` before committing

## Git

- Commit with clear, descriptive messages
- Prefer smaller, focused commits over large ones
