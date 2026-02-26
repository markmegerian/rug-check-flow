# Git merge / PR recovery quick guide

Use this when branch merges fail or GitHub will not allow creating a PR.

## 1) Verify you are on the expected branch

```bash
git branch --show-current
git status
```

If you are not on your feature branch:

```bash
git checkout <your-feature-branch>
```

## 2) Refresh from remote safely

```bash
git fetch --all --prune
```

Inspect divergence:

```bash
git log --oneline --decorate --graph --max-count=20
git rev-list --left-right --count origin/main...HEAD
```

## 3) Resolve a stuck or partial merge

If Git says a merge is in progress and you want to restart:

```bash
git merge --abort
```

If abort is unavailable:

```bash
git reset --merge
```

## 4) Rebase branch onto latest main (recommended)

```bash
git fetch origin
git rebase origin/main
```

When conflicts appear:

```bash
# edit files to resolve
git add <resolved-files>
git rebase --continue
```

If you need to cancel:

```bash
git rebase --abort
```

## 5) Confirm branch is pushable

```bash
git status
git diff --name-only --diff-filter=U
```

The second command must print nothing (no unresolved conflicts).

## 6) Push branch and open PR

```bash
git push -u origin <your-feature-branch>
```

If push is rejected after rebase:

```bash
git push --force-with-lease
```

Then open PR from your feature branch to `main`.

## 7) If GitHub says PR cannot be created

Common causes:

- No commits difference between base/head.
- Branch not pushed.
- Wrong base branch selected.
- Repository permissions missing.

Quick checks:

```bash
git rev-list --left-right --count origin/main...origin/<your-feature-branch>
```

If output is `0\t0`, there is no diff to PR.

## 8) Safe fallback: create a clean rescue branch

```bash
git checkout -b rescue/<short-topic>
git push -u origin rescue/<short-topic>
```

Open PR from `rescue/<short-topic>`.
