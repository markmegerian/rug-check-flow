# Database Schema Dump Verification - 2026-04-26

## Goal

Advance the schema-confidence checklist item without depending on `supabase db pull --linked`, which is still blocked by shadow replay of the non-executable `0001_initial.sql` context snapshot.

## Commands run

```bash
supabase db pull --linked --schema public --yes --debug
supabase db dump --linked --schema public --file /tmp/rug-check-public-schema.sql
```

## Results

### 1. `db pull` still fails for the known reason

The debug run still dies during shadow replay on:

```text
ERROR: relation "public.companies" does not exist (SQLSTATE 42P01)
```

The failure occurs because `supabase/migrations/0001_initial.sql` starts with:

```sql
-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.
```

and then tries to create `public.admin_audit_logs` with a foreign key to `public.companies` before `public.companies` exists.

So the old pull-based path remains unusable as an executable replay source.

### 2. `db dump` succeeds and gives a truthful remote schema snapshot

`supabase db dump --linked --schema public --file /tmp/rug-check-public-schema.sql`

Succeeded and produced:

- file: `/tmp/rug-check-public-schema.sql`
- size: `8795` lines

This bypasses the shadow replay problem and gives a direct schema snapshot from the linked remote project.

## Spot checks against the dumped remote schema

The dumped file includes current production objects that matter for the recent workflow work:

- `public.get_jobs_summary()`
- `public.transition_estimate_status(...)`
- `public.estimate_send_batches`
- `public.company_memberships`
- `public.messages`
- `public.notification_cadence`

This is enough to treat dump-based remote schema capture as a working schema-confidence method for this project.

## Honest interpretation

### What is now true
- Full remote public-schema capture is available.
- The schema-confidence item is no longer blocked on `db pull`.
- We now have a usable alternative method: `supabase db dump --linked --schema public`.

### What is still not true
- `supabase db pull --linked --schema public --yes` is still not replay-safe.
- `0001_initial.sql` is still a non-executable context snapshot, not a valid baseline migration.
- This does **not** by itself prove migration replay safety from zero.

## Recommended rule going forward

For schema-confidence work on this project:

1. Use `supabase db dump --linked --schema public --file <path>` for remote schema capture.
2. Use migration history + targeted live probes for rollout truth.
3. Do **not** treat `db pull` replay success as a prerequisite for truthful remote-schema inspection here.

## Checklist impact

This advances the checklist item:

- **Improve full schema comparison confidence**

from:
- blocked with no workable whole-schema capture path

to:
- workable via dump-based remote schema capture, while replay-safety remains a separate later-cleanup concern.
