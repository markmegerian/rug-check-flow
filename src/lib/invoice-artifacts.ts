import { supabase } from "@/integrations/supabase/client";

export type InvoicePdfArtifact = {
  invoiceId: string;
  invoiceNumber: string;
  forceRegenerate?: boolean;
};

const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_DOWNLOAD_RETRIES = 2;

/** Fetch with a timeout via AbortController. */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function downloadInvoicePdf(artifact: InvoicePdfArtifact) {
  const { data: functionData, error: functionError } = await supabase.functions.invoke("invoice-pdf", {
    body: {
      invoice_id: artifact.invoiceId,
      force_regenerate: Boolean(artifact.forceRegenerate),
    },
  });

  if (functionError || functionData?.error || !functionData?.signed_url) {
    throw new Error(functionData?.error ?? functionError?.message ?? "Failed to request invoice PDF");
  }

  // Download the PDF with timeout and retry
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= MAX_DOWNLOAD_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(functionData.signed_url, DOWNLOAD_TIMEOUT_MS);
      if (!response.ok) {
        throw new Error(`Signed invoice download failed with status ${response.status}`);
      }
      const data = await response.blob();

      // Trigger browser download with proper cleanup
      let downloadUrl: string | undefined;
      try {
        downloadUrl = URL.createObjectURL(data);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = `${artifact.invoiceNumber}.pdf`;
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        if (downloadUrl) {
          URL.revokeObjectURL(downloadUrl);
        }
      }

      return {
        bucket: functionData.bucket as string,
        path: functionData.path as string,
        generated: Boolean(functionData.generated),
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_DOWNLOAD_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}
