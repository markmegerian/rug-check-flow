-- Reset today's delivery flow back to pre-truck-confirmation state.
-- This allows the driver to re-confirm the truck from scratch.
--
-- Order matters due to foreign keys.

BEGIN;

-- 1. Delete route_stop_items for today's delivery route_stops
DELETE FROM "public"."route_stop_items"
WHERE "route_stop_id" IN (
    SELECT "id" FROM "public"."route_stops"
    WHERE "route_date" = CURRENT_DATE
    AND "delivery_list_id" IS NOT NULL
)
AND "phase" = 'delivery';

-- 2. Delete route_stop_events for today's delivery route_stops
DELETE FROM "public"."route_stop_events"
WHERE "route_stop_id" IN (
    SELECT "id" FROM "public"."route_stops"
    WHERE "route_date" = CURRENT_DATE
    AND "delivery_list_id" IS NOT NULL
);

-- 3. Delete route_stops that were created for delivery today
--    (only those with no remaining pickup items)
DELETE FROM "public"."route_stops"
WHERE "route_date" = CURRENT_DATE
AND "delivery_list_id" IS NOT NULL
AND "id" NOT IN (
    SELECT DISTINCT "route_stop_id" FROM "public"."route_stop_items"
    WHERE "phase" = 'pickup'
);

-- For stops that have both pickup and delivery, just unlink the delivery_list
UPDATE "public"."route_stops"
SET "delivery_list_id" = NULL,
    "status" = 'queued',
    "started_at" = NULL,
    "completed_at" = NULL,
    "signature_data_url" = NULL
WHERE "route_date" = CURRENT_DATE
AND "delivery_list_id" IS NOT NULL;

-- 4. Delete invoice_items for invoices created from today's delivery lists
DELETE FROM "public"."invoice_items"
WHERE "invoice_id" IN (
    SELECT "i"."id" FROM "public"."invoices" "i"
    JOIN "public"."delivery_lists" "dl" ON "dl"."id" = "i"."delivery_list_id"
    WHERE "dl"."target_date" = CURRENT_DATE
    AND "dl"."status" = 'checked_out'
);

-- 5. Delete invoices created from today's delivery lists
DELETE FROM "public"."invoices"
WHERE "delivery_list_id" IN (
    SELECT "id" FROM "public"."delivery_lists"
    WHERE "target_date" = CURRENT_DATE
    AND "status" = 'checked_out'
);

-- 6. Reset rugs back to "ready" (from "picked_up")
UPDATE "public"."rugs"
SET "status" = 'ready',
    "picked_up_at" = NULL
WHERE "id" IN (
    SELECT "dli"."rug_id"
    FROM "public"."delivery_list_items" "dli"
    JOIN "public"."delivery_lists" "dl" ON "dl"."id" = "dli"."delivery_list_id"
    WHERE "dl"."target_date" = CURRENT_DATE
)
AND "status" = 'picked_up';

-- 7. Reset delivery_list_items back to unconfirmed/unloaded
UPDATE "public"."delivery_list_items"
SET "confirmed_for_delivery" = false,
    "loaded_on_truck" = false
WHERE "delivery_list_id" IN (
    SELECT "id" FROM "public"."delivery_lists"
    WHERE "target_date" = CURRENT_DATE
);

-- 8. Reset delivery_lists back to "compiling"
UPDATE "public"."delivery_lists"
SET "status" = 'compiling',
    "confirmed_at" = NULL,
    "checked_out_at" = NULL,
    "checked_out_by" = NULL
WHERE "target_date" = CURRENT_DATE;

COMMIT;
