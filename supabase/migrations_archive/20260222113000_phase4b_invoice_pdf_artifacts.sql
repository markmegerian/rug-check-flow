-- Phase 4B: invoice delivery artifacts source-of-truth
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS pdf_storage_path text;

COMMENT ON COLUMN public.invoices.pdf_storage_path IS
  'Storage object path for rendered invoice PDF used by portal/office download actions.';

CREATE INDEX IF NOT EXISTS idx_invoices_pdf_storage_path
ON public.invoices (pdf_storage_path)
WHERE pdf_storage_path IS NOT NULL;
