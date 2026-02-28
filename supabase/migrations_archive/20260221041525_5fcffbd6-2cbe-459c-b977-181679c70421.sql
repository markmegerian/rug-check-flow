
-- Add route_day column to clients (which day of the week they're serviced)
ALTER TABLE public.clients
ADD COLUMN route_day text NOT NULL DEFAULT '';
