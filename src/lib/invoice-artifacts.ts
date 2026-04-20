import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";

export type InvoicePdfArtifact = {
  invoiceId?: string;
  estimateId?: string;
  invoiceNumber: string;
  forceRegenerate?: boolean;
};

export async function downloadInvoicePdf(artifact: InvoicePdfArtifact) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (!accessToken) {
    throw new Error("No active Supabase session found for PDF download");
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/invoice-pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      invoice_id: artifact.invoiceId ?? "",
      estimate_id: artifact.estimateId ?? "",
      force_regenerate: Boolean(artifact.forceRegenerate),
    }),
  });

  const functionData = await response.json().catch(() => ({}));

  if (!response.ok || functionData?.error || !functionData?.signed_url) {
    const detail = typeof functionData?.details === "string" ? ` ${functionData.details}` : "";
    throw new Error(`${functionData?.error ?? `Failed to request invoice PDF (${response.status})`}${detail}`.trim());
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
