# AGENTS.md

Guidance for coding agents and contributors working in this repository.

## Project snapshot

- Stack: Vite + React + TypeScript
- Styling/UI: Tailwind CSS + shadcn/ui (Radix primitives)
- Data layer: Supabase client usage under `src/integrations`
- Testing: Vitest + Testing Library

## Key directories

- `src/components` - UI and feature components
- `src/pages` - route-level views
- `src/contexts` - React context providers/state
- `src/hooks` - reusable custom hooks
- `src/lib` - shared helpers/utilities
- `src/integrations` - external service integrations (including Supabase)
- `src/test` - test setup/helpers/specs
- `public` - static assets
- `supabase` - Supabase-related project files

## Local development

```bash
npm install
npm run dev
```

## Validation commands

Run the checks that match your change scope before committing:

```bash
npm run lint
npm run test
npm run build
```

## Working rules for agents

1. Keep changes focused and minimal; avoid broad refactors unless requested.
2. Prefer existing patterns/components over introducing new abstractions.
3. Preserve TypeScript correctness (do not silence errors without reason).
4. Add or update tests when behavior changes.
5. Do not commit secrets, credentials, or generated build artifacts.
6. Update docs (README or this file) when workflow or commands change.

## Commit hygiene

- Use clear, descriptive commit messages.
- Include a short summary of what changed and what was validated.
