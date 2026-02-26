# Phase 4.2 — Critical Journey Acceptance Coverage

## Goal
Maintain deterministic acceptance coverage for the five highest-value journeys:
1. pickup request
2. check-in to production
3. estimate lifecycle
4. invoice send + PDF retrieval
5. portal onboarding + payment tracking

## Coverage implementation
- Added `src/test/critical-journeys.acceptance.test.ts` with one acceptance assertion group per critical journey.
- Coverage includes:
  - workflow guard behavior for pickup and estimate journeys
  - check-in editability constraints for check-in/production flow
  - readiness-gate assertions for invoice PDF step
  - role-scope smoke assertions for portal onboarding/payment tracking visibility

## How to run
```sh
npm run test -- src/test/critical-journeys.acceptance.test.ts
```

## Validation gate
Phase 4.2 is complete when:
1. All five critical journeys have deterministic acceptance checks.
2. Acceptance checks pass in CI/local test runs.
3. Any failing journey check blocks progression to later phases.

Current status: **Complete**.
