# Deploy Truth Pass - 2026-04-22

## Goal

Review the recent failed GitHub Actions runs and determine whether the intended frontend/UI changes actually made it to the live deploy.

## Conclusion

The recent failed runs from 2026-04-22 **were superseded by a later successful CI + Deploy run**.

For the current branch (`claude/codebase-analysis-ideas-JJIeo`), the latest authoritative state is:

- **CI success** on commit `dc0496c2e082815a6e48e52544dc24e0d5e32816`
- **Deploy to DreamHost success** on commit `dc0496c2e082815a6e48e52544dc24e0d5e32816`
- **Supabase DB Migrate success** on the same commit

This means the currently intended code from that commit is the live truth for this branch's latest deploy pipeline.

## Failed runs reviewed

### 1. Commit `c6b3cb56c002ef0636373db8b55921f4d60edae7`
Message:
- `fix: show sidebar labels in mobile drawer`

Runs:
- `24777854255` — **CI failure**
- `24777854216` — **Deploy to DreamHost failure**
- `24777854233` — **Supabase DB Migrate success**

### 2. Commit `156b2eee37e85ccbb0f69267225ede05b2bf400f`
Message:
- `feat: use provided logo in sidebar`

Runs:
- `24777915058` — **CI failure**
- `24777915056` — **Deploy to DreamHost failure**
- `24777915060` — **Supabase DB Migrate success**

## Root cause of those failures

The failures were caused by a missing frontend asset import in `src/components/layout/AppSidebar.tsx`:

- imported file: `src/assets/micro-navy-gold-texture.png`
- problem: file existed locally but was never committed
- effect: Vite build failed in CI/Deploy with `ENOENT`

This was a **frontend build/deploy failure**, not a database migration failure.

## Fix that superseded the failures

Commit:
- `dc0496c2e082815a6e48e52544dc24e0d5e32816`
- message: `fix: remove missing texture asset dependency`

Resulting runs:
- `24778089550` — **CI success**
- `24778089551` — **Deploy to DreamHost success**
- `24778089545` — **Supabase DB Migrate success**

## Live-truth interpretation

### What did NOT reliably go live from the failed runs
The exact failed attempts tied to `c6b3cb5` and `156b2ee` should **not** be treated as having deployed live at the time they failed.

### What IS now live
Because `dc0496c` deployed successfully afterward, the branch's latest intended frontend state **did** make it live, minus the abandoned heavy-texture-file dependency.

That means the following work is now represented in the live deployed branch state:

- shared UI primitive polish
- shell/home surface polish
- sidebar text contrast fix
- mobile sidebar label visibility fix
- sidebar logo swap
- removal of the broken missing-texture import path

## Rule going forward

For frontend deploy truth:

- **failed CI or failed Deploy to DreamHost** => do **not** assume that commit is live
- **later successful Deploy to DreamHost on a superseding commit** => that later commit becomes the live truth

For DB truth:

- do not apply the same simplification automatically, because DB migration failures may partially apply changes depending on where the failure occurred
