# Check-In Backend Pricing Deploy Status - 2026-04-22

## Change
Deployed the updated `check-in-workflow` edge function after moving routine Check In service pricing ownership from the frontend to the backend.

## Live deploy
Command:
- `supabase functions deploy check-in-workflow --project-ref toitgmaeuscrdwbpntda`

Result:
- Deploy completed successfully.
- Project: `toitgmaeuscrdwbpntda`
- Function: `check-in-workflow`

## What is now live
- Frontend submits minimal service payload for Check In:
  - `service_id`
  - `service_name`
  - `edges` when relevant
  - `quoted_price` only for quote/custom-price cases
- Backend now resolves normal pricing from:
  - service catalog pricing fields
  - client pricing tier
  - rug dimensions
  - selected linear-foot edges
- Backend now owns inserted `rug_services.unit_price` / `line_total`
- Backend now owns estimate draft item totals created from Check In

## Verification ceiling
Local build/tests passed before deploy.

This deploy confirms the updated function code is live, but it does **not** by itself prove a full end-to-end operator Check In against real catalog/client data. Real-use verification still requires a live check-in submission through the app.
