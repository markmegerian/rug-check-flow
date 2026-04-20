# Supabase Migration Deploy

## Purpose

This repo does **not** apply Supabase SQL migrations as part of the frontend DreamHost deploy.
This workflow adds a dedicated GitHub Actions path for database migrations.

## Workflow

- Workflow file: `.github/workflows/supabase-db-migrate.yml`
- Triggered on:
  - pushes to `main`
  - pushes to `claude/**`
  - manual `workflow_dispatch`

## Required GitHub Secret

Add this repository secret:

- `SUPABASE_DB_PASSWORD`
  - the remote Postgres database password for project `toitgmaeuscrdwbpntda`

## What the workflow does

1. Checks out the repo
2. Verifies `SUPABASE_DB_PASSWORD` is present
3. Installs Supabase CLI
4. Links to project `toitgmaeuscrdwbpntda`
5. Runs `supabase db push`

## Safety notes

- Migrations in this repo should remain additive-first unless explicitly reviewed otherwise
- The workflow only pushes checked-in migration files
- Frontend deploy and DB migration are separate concerns, by design
- For risky production schema changes, prefer:
  - a reviewed migration PR
  - explicit rollback notes
  - smoke validation after apply

## First-time rollout

After adding the secret:

1. Run the workflow manually once from GitHub Actions, or push a new commit
2. Confirm the workflow succeeds
3. Confirm the new migration versions appear in Supabase migration history
4. Confirm app behavior against the migrated schema/functions
