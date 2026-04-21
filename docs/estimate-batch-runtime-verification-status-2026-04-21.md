# Estimate Batch Runtime Verification Status - 2026-04-21

## Purpose

Record the current verification boundary for the runtime/service-role estimate batch send path in `process-notification-cadence`.

## Verified facts

### 1. Runtime code path is deployed
`process-notification-cadence` was redeployed successfully to the correct project:
- project: `toitgmaeuscrdwbpntda`
- function version after deploy: `10`
- deploy time observed: `2026-04-21 19:50:07 UTC`

### 2. The currently deployed runtime includes the batch helper path
The function code in repo and deployed version now reflects the newer batch-owned send logic built around:
- `processEstimateBatchSend(...)`
- `adminClient.rpc("ensure_estimate_send_batch", ...)`
- `estimate_send_batch_items`
- batch-owned `communication_events`
- grouped send/reminder updates

### 3. Safe invocation credentials are not available in this session
A truthful end-to-end live invocation requires one of:
- valid `x-cron-secret` matching `PROCESS_NOTIFICATION_CADENCE_SECRET`, or
- a valid office/admin bearer JWT for manual mode

This session does **not** currently have:
- `PROCESS_NOTIFICATION_CADENCE_SECRET` in environment, and
- no repo-local `.env` file exposing it was present

## Current verification ceiling

From this session, we can truthfully say:
- the database/helper boundary has been cleaned up and verified live
- the frontend/browser queue and summary paths are healthy
- the runtime function is deployed with the intended newer batch-owned code

But we **cannot yet truthfully claim** a full live end-to-end invocation result for `process-notification-cadence` from this session, because the required invocation credential is unavailable.

## Correct next step

When a safe invocation credential is available, run one of these:
- scheduler-mode dry run using `x-cron-secret`
- manual-mode dry run using a valid office/admin JWT

Preferred first check:
- invoke `process-notification-cadence` with `{"dry_run": true}`
- confirm the function returns a valid `success` payload and processes/queues estimate-batch-send rows without auth/runtime failure

## Important truth

This is a credential/verification-boundary limitation, **not** evidence of a product bug.
