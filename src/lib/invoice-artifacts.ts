import { supabase } from "@/integrations/supabase/client";

const DEFAULT_INVOICE_PDF_BUCKET = "invoice-pdfs";
const INVOICE_PDF_BUCKET =
  (import.meta.env.VITE_INVOICE_PDF_BUCKET as string | undefined)?.trim() || DEFAULT_INVOICE_PDF_BUCKET;

export type InvoicePdfArtifact = {
  invoiceNumber: string;
  pdfStoragePath?: string | null;
};

export function resolveInvoicePdfStoragePath(artifact: InvoicePdfArtifact) {
  if (artifact.pdfStoragePath && artifact.pdfStoragePath.trim().length > 0) {
    return artifact.pdfStoragePath.trim();
  }
  return `invoices/${artifact.invoiceNumber}.pdf`;
}

export async function downloadInvoicePdf(artifact: InvoicePdfArtifact) {
  const path = resolveInvoicePdfStoragePath(artifact);
  const { data, error } = await supabase.storage.from(INVOICE_PDF_BUCKET).download(path);

  if (error || !data) {
    throw new Error(
      error?.message ??
        `Invoice PDF is unavailable at ${INVOICE_PDF_BUCKET}/${path}. Confirm the artifact was uploaded.`,
    );
  }

  const downloadUrl = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = `${artifact.invoiceNumber}.pdf`;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);

  return { bucket: INVOICE_PDF_BUCKET, path };
}
