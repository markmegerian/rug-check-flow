import { SUPABASE_URL } from "@/integrations/supabase/client";

export type InvoicePdfArtifact = {
  invoiceId?: string;
  estimateId?: string;
  invoiceNumber: string;
  forceRegenerate?: boolean;
  accessToken: string;
};

export async function downloadInvoicePdf(artifact: InvoicePdfArtifact) {
  if (!artifact.accessToken) {
    throw new Error("No active access token available for PDF download");
  }

  const functionResponse = await fetch(`${SUPABASE_URL}/functions/v1/invoice-pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${artifact.accessToken}`,
    },
    body: JSON.stringify({
      invoice_id: artifact.invoiceId ?? "",
      estimate_id: artifact.estimateId ?? "",
      force_regenerate: Boolean(artifact.forceRegenerate),
    }),
  });

  const functionData = await functionResponse.json().catch(() => ({}));

  if (!functionResponse.ok || functionData?.error || !functionData?.signed_url) {
    const detail = typeof functionData?.details === "string" ? ` ${functionData.details}` : "";
    throw new Error(`${functionData?.error ?? `Failed to request invoice PDF (${functionResponse.status})`}${detail}`.trim());
  }

  const fileResponse = await fetch(functionData.signed_url);
  if (!fileResponse.ok) {
    throw new Error(`Signed invoice download failed with status ${fileResponse.status}`);
  }
  const data = await fileResponse.blob();

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
