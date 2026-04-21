import { supabase } from "@/integrations/supabase/client";

export type InvoicePdfArtifact = {
  invoiceId?: string;
  estimateId?: string;
  invoiceNumber: string;
  forceRegenerate?: boolean;
};

export async function downloadInvoicePdf(artifact: InvoicePdfArtifact) {
  const payload = {
    invoice_id: artifact.invoiceId ?? "",
    estimate_id: artifact.estimateId ?? "",
    force_regenerate: Boolean(artifact.forceRegenerate),
  };

  const { data: functionData, error: functionError } = await supabase.functions.invoke("invoice-pdf", {
    body: payload,
  });

  if (functionError || functionData?.error || !functionData?.signed_url) {
    const details = [
      functionData?.error,
      functionData?.details,
      functionError?.message,
      functionError ? JSON.stringify(functionError) : null,
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

    throw new Error(details[0] ?? "Failed to request invoice PDF");
  }

  const signedUrl = functionData.signed_url as string;
  const link = document.createElement("a");
  link.href = signedUrl;
  link.download = `${artifact.invoiceNumber}.pdf`;
  link.rel = "noopener noreferrer";
  link.target = "_blank";
  document.body.appendChild(link);
  link.click();
  link.remove();

  if (typeof window !== "undefined") {
    window.open(signedUrl, "_blank", "noopener,noreferrer");
  }

  return {
    bucket: functionData.bucket as string,
    path: functionData.path as string,
    signedUrl,
    generated: Boolean(functionData.generated),
  };
}
