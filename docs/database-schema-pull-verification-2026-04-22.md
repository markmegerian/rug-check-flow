# Database Schema Pull Verification - 2026-04-22

## Goal

Attempt to advance the database checklist item around full schema comparison confidence by rerunning the linked public-schema pull against the current project.

## Command

```bash
supabase db pull --linked --schema public --yes
```

## Result

The command still fails during shadow database replay.

Observed output:

- `Initialising login role...`
- `Connecting to remote database...`
- `Creating shadow database...`
- `Initialising schema...`
- `Seeding globals from roles.sql...`
- `Applying migration 0001_initial.sql...`

Failure:

```text
ERROR: relation "public.companies" does not exist (SQLSTATE 42P01)
At statement: 0
CREATE TABLE public.admin_audit_logs (
  ...
  company_id uuid,
  CONSTRAINT admin_audit_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
)
```

The CLI also reports:

```text
Try rerunning the command with --debug to troubleshoot the error.
```

## Interpretation

This confirms the current issue is **not resolved**.

The linked schema-pull confidence path remains blocked by the replay-unsafety of the baseline/early migration snapshot in the shadow database.

In practical terms, this means:

- full generated pull diffs are still not a trustworthy primary DB truth source here
- remote migration history plus targeted live probes remain the safer source of truth
- the database checklist should continue to treat schema-pull confidence as open and blocked, not partially closed

## Checklist impact

### Still blocked
- `supabase db pull --linked --schema public --yes`

### Still safest current DB truth sources
1. remote migration history
2. targeted live RPC probes
3. deployed function/version evidence
4. explicit documentation of the current verification ceiling

## Recommended next step

If this item is to be advanced further, the next action should be one of:

1. run the failing pull path with `--debug` and inspect the earliest replay ordering issue in detail, or
2. establish an alternative schema-confidence method that does not depend on replaying the current baseline snapshot as executable migrations

Until then, this checklist item remains blocked.
