-- Remove duplicate delivery_list_items rows, keeping only the earliest per (delivery_list_id, rug_id)
DELETE FROM public.delivery_list_items
WHERE id NOT IN (
  SELECT DISTINCT ON (delivery_list_id, rug_id) id
  FROM public.delivery_list_items
  ORDER BY delivery_list_id, rug_id, created_at ASC
);

-- Prevent future duplicates
ALTER TABLE public.delivery_list_items
  ADD CONSTRAINT delivery_list_items_list_rug_unique
  UNIQUE (delivery_list_id, rug_id);
