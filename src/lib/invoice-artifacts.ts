import { supabase } from "@/integrations/supabase/client";
import { getAuthHeaders } from "@/lib/supabase-helpers";

export type InvoicePdfArtifact = {
  invoiceId?: string;
  estimateId?: string;
  invoiceNumber: string;
  forceRegenerate?: boolean;
};

export async function downloadInvoicePdf(artifact: InvoicePdfArtifact) {
  const authHeaders = await getAuthHeaders();
  const { data: functionData, error: functionError } = await supabase.functions.invoke("invoice-pdf", {
    body: {
      invoice_id: artifact.invoiceId ?? "",
      estimate_id: artifact.estimateId ?? "",
      force_regenerate: Boolean(artifact.forceRegenerate),
    },
    headers: authHeaders ?? undefined,
  });

  if (functionError || functionData?.error || !functionData?.signed_url) {
    const detail = typeof functionData?.details === "string" ? ` ${functionData.details}` : "";
    throw new Error(`${functionData?.error ?? functionError?.message ?? "Failed to request invoice PDF"}${detail}`.trim());
  }

  const response = await fetch(functionData.signed_url);
  if (!response.ok) {
    throw new Error(`Signed invoice download failed with status ${response.status}`);
  }
  const data = await response.blob();

  const downloadUrl = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = `${artifact.invoiceNumber}.pdf`;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);

  return {
    bucket: functionData.bucket as string,
    path: functionData.path as string,
    generated: Boolean(functionData.generated),
  };
}
