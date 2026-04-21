# Docs Cleanup Review - 2026-04-21

## Purpose

The docs directory has accumulated multiple generations of planning, audit, rebuild, and implementation notes.
Some of these are still useful reference material.
Some are now superseded by the newer workflow-surface review pack and should be removed or consolidated.

This review separates:
- docs that still matter
- docs that should likely stay as historical architecture records
- docs that appear redundant/superseded/no longer relevant to the current direction

## Keep as active/current

These still reflect the current working direction or hold important current truth:

- `platform-workflow-surface-review-2026-04-21.md`
- `platform-workflow-surface-review-2026-04-21.pdf`
- `office-workflow-surface-review-2026-04-21.md`
- `facility-workflow-surface-review-2026-04-21.md`
- `jobs-workflow-surface-review-2026-04-21.md`
- `estimates-workflow-surface-review-2026-04-21.md`
- `invoices-workflow-surface-review-2026-04-21.md`
- `driver-portal-workflow-surface-review-2026-04-21.md`
- `wholesale-client-portal-workflow-surface-review-2026-04-21.md`
- `backend-canonical-target-schema-2026-04-21.md`
- `backend-consolidation-migration-plan-2026-04-21.md`
- `services-pricing-consolidation-slice-01-2026-04-21.md`
- `services-pricing-consolidation-slice-01-verification-2026-04-21.md`
- `estimate-batch-send-consolidation-slice-01-2026-04-21.md`
- `estimate-review-live-verification-2026-04-21.md`
- `supabase-migration-deploy.md`
- `check-in-backend-workflow-contract.md`

## Keep as historical/reference architecture docs

These are older, but still useful as reference or audit trail rather than active clutter:

- `platform-reevaluation-master-plan-2026-04-20.md`
- `platform-subsystem-classification-2026-04-20.md`
- `platform-keep-repair-rebuild-remove-matrix-2026-04-20.md`
- `backend-architecture-map-2026-04-20.md`
- `backend-canonical-architecture-judgment-2026-04-20.md`
- `backend-table-relationship-review-2026-04-20.md`
- `backend-truth-audit-checklist-2026-04-20.md`
- `backend-truth-audit-pass-01-2026-04-20.md`
- `backend-weak-domain-deep-dive-2026-04-20.md`
- `frontend-rebuild-audit-2026-04-20.md`
- `frontend-rebuild-plan-2026-04-20.md`
- `frontend-rebuild-architecture-2026-04-20.md`
- `frontend-design-reset-2026-04-20.md`
- `platform-architecture-reframe-2026-04-20.md`
- `platform-migration-checklist-2026-04-20.md`
- `performance-audit-2026-04-20.md`
- `checkin-performance-audit-2026-04-20.md`
- `services-audit-2026-04-20.md`
- `estimate-workflow-redesign-2026-04-20.md`

## Likely redundant / removable from current GitHub docs surface

These appear to be older rollout/phase/readiness packs from a different planning layer and are likely not helping the current product rebuild direction:

- `phase2-2-dashboard-baseline.md`
- `phase2-3-synthetic-checks.md`
- `phase2-4-game-day-runbook.md`
- `phase3-1-rls-regression-cadence.md`
- `phase3-2-secrets-inventory-and-rotation.md`
- `phase3-3-least-privilege-review.md`
- `phase3-4-retention-and-compliance-policy.md`
- `phase4-1-beta-feedback-triage.md`
- `phase4-2-critical-journey-acceptance.md`
- `phase4-3-ux-consistency-pass.md`
- `phase4-4-regression-stabilization-window.md`
- `phase4b-quick-audit.md`
- `phase4-readiness-review.md`
- `phase5-1-schema-and-migration-freeze.md`
- `phase5-2-full-staging-rehearsal.md`
- `phase5-3-controlled-rollout-and-page-by-page-uat.md`
- `phase5-4-launch-monitoring-watch.md`
- `phase5-kickoff.md`
- `private-beta-launch-checklist.md`
- `platform-1.0-roadmap.md`
- `platform-1.0-status.md`
- `implementation-plan-platform-1.0.md`
- `release-runbook.md`
- `pr-1-implementation-summary.md`
- `pr-2-implementation-summary.md`
- `pr-3-implementation-summary.md`
- `pr-4-implementation-summary.md`
- `deployment-guide-pr1-4.md`
- `rug-check-flow-implementation-roadmap.md`
- `crunch-plan-2026-02-26.md`
- `full-system-check-2026-02-23.md`

## Likely removable generated artifact

- `platform-workflow-surface-review-2026-04-21.html`

The HTML file exists only as a PDF-generation artifact and should not stay in GitHub unless there is a real reason.

## Recommendation

Safe first cleanup:
1. remove the generated HTML artifact
2. remove the older phase/rollout/readiness pack listed above
3. keep the newer workflow review pack and the backend/frontend architecture/reference docs

This preserves important reasoning while removing clutter that is unlikely to help current work.
