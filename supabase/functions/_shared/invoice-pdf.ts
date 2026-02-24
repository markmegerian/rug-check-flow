import { PDFDocument, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type InvoicePdfLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type InvoicePdfPayload = {
  invoiceNumber: string;
  clientName: string;
  issuedAt: string;
  dueAt: string | null;
  totalAmount: number;
  lineItems: InvoicePdfLineItem[];
};

export const DEFAULT_INVOICE_PDF_BUCKET = "invoice-pdfs";

export function getInvoicePdfBucket() {
  return (Deno.env.get("INVOICE_PDF_BUCKET") ?? DEFAULT_INVOICE_PDF_BUCKET).trim();
}

export function resolveInvoicePdfStoragePath(
  clientId: string,
  invoiceNumber: string,
  existingPath?: string | null,
) {
  if (existingPath && existingPath.trim().length > 0) return existingPath.trim();
  return `clients/${clientId}/${invoiceNumber}.pdf`;
}

function currency(value: number) {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

function dateText(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}

function clampText(value: string, maxLength = 88) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

export async function renderInvoicePdfBytes(payload: InvoicePdfPayload) {
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([612, 792]);
  const marginX = 48;
  let y = 744;
  const lineHeight = 18;

  const draw = (text: string, size = 11, bold = false) => {
    page.drawText(text, {
      x: marginX,
      y,
      size,
      font: bold ? boldFont : regularFont,
    });
    y -= lineHeight;
  };

  draw("RugBoost Invoice", 20, true);
  y -= 8;
  draw(`Invoice: ${payload.invoiceNumber}`, 12, true);
  draw(`Client: ${payload.clientName}`, 11);
  draw(`Issued: ${dateText(payload.issuedAt)}   Due: ${dateText(payload.dueAt)}`, 11);
  y -= 10;
  draw("Line Items", 12, true);
  y -= 4;

  for (const [index, item] of payload.lineItems.entries()) {
    if (y < 92) {
      page = pdfDoc.addPage([612, 792]);
      y = 744;
      draw(`Invoice ${payload.invoiceNumber} (continued)`, 12, true);
      y -= 6;
    }

    const lineLabel = `${index + 1}. ${clampText(item.description, 74)}`;
    const lineValue = `${Number(item.quantity ?? 1)} × ${currency(item.unitPrice)} = ${currency(item.total)}`;
    draw(lineLabel, 10.5);
    draw(lineValue, 10.5);
    y -= 4;
  }

  if (y < 96) {
    page = pdfDoc.addPage([612, 792]);
    y = 744;
  }
  y -= 4;
  draw(`Total: ${currency(payload.totalAmount)}`, 13, true);
  y -= 4;
  draw("Thank you for your business.", 10);

  return pdfDoc.save();
}


export async function ensureInvoicePdfBucket(adminClient: SupabaseClient, bucket: string) {
  const { error } = await adminClient.storage.createBucket(bucket, { public: false });
  if (!error) return;

  const message = (error.message ?? '').toLowerCase();
  if (message.includes('already exists') || message.includes('duplicate')) return;

  throw new Error(`Failed to ensure storage bucket ${bucket}: ${error.message}`);
}

export async function storageObjectExists(
  adminClient: SupabaseClient,
  bucket: string,
  path: string,
) {
  const parts = path.split("/");
  const fileName = parts.pop();
  const folderPath = parts.join("/");
  if (!fileName) return false;

  const { data, error } = await adminClient.storage.from(bucket).list(folderPath, {
    limit: 100,
  });
  if (error) return false;
  return (data ?? []).some((entry) => entry.name === fileName);
}

export async function uploadInvoicePdf(
  adminClient: SupabaseClient,
  bucket: string,
  path: string,
  pdfBytes: Uint8Array,
) {
  const { error } = await adminClient.storage.from(bucket).upload(path, pdfBytes, {
    upsert: true,
    contentType: "application/pdf",
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
}

export async function createInvoicePdfSignedUrl(
  adminClient: SupabaseClient,
  bucket: string,
  path: string,
  expiresInSeconds = 300,
) {
  const { data, error } = await adminClient.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Failed to create signed URL");
  }
  return data.signedUrl;
}
