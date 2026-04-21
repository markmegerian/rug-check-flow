import { supabase } from "@/integrations/supabase/client";

export type InvoicePdfArtifact = {
  invoiceId?: string;
  estimateId?: string;
  invoiceNumber: string;
  forceRegenerate?: boolean;
};

export async function downloadInvoicePdf(artifact: InvoicePdfArtifact) {
  const { data: functionData, error: functionError } = await supabase.functions.invoke("invoice-pdf", {
    body: {
      invoice_id: artifact.invoiceId ?? "",
      estimate_id: artifact.estimateId ?? "",
      force_regenerate: Boolean(artifact.forceRegenerate),
    },
  });

  if (functionError || functionData?.error || !functionData?.signed_url) {
    throw new Error(functionData?.error ?? functionError?.message ?? "Failed to request invoice PDF");
  }

  const link = document.createElement("a");
  link.href = functionData.signed_url as string;
  link.download = `${artifact.invoiceNumber}.pdf`;
  link.rel = "noopener";
  link.target = "_blank";
  document.body.appendChild(link);
  link.click();
  link.remove();

  return {
    bucket: functionData.bucket as string,
    path: functionData.path as string,
    generated: Boolean(functionData.generated),
  };
}
