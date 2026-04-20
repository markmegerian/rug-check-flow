import { PDFDocument, StandardFonts, type PDFPage, type PDFFont } from "https://esm.sh/pdf-lib@1.17.1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Types ──────────────────────────────────────────────────────────────────

export type CompanyInfo = {
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  businessFax: string;
  businessEmail?: string;
  brandFooter?: string;
};

export type ClientInfo = {
  name: string;
  contactName: string;
  phone: string;
  address: string;
};

export type RugServiceLine = {
  name: string;
  pricingLabel: string;
  extPrice: number;
};

export type RugSection = {
  rugNumber: string;
  customerRugNumber: string;
  size: string;
  rugType: string;
  notes: string;
  services: RugServiceLine[];
  subtotal: number;
};

export type InvoicePdfPayload = {
  documentType: "invoice" | "estimate";
  documentNumber: string;
  documentDate: string;
  company: CompanyInfo;
  client: ClientInfo;
  rugs: RugSection[];
  subtotal: number;
  total: number;
};

// Keep old type alias for backward compatibility
export type InvoicePdfLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function currency(value: number) {
  return `$${Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const y = date.getFullYear();
  return `${m}-${d}-${y}`;
}

// ─── Column positions (US Letter: 612 x 792) ───────────────────────────────

const PAGE_W = 612;
const PAGE_H = 792;
const ML = 48;   // margin left
const MR = 48;   // margin right
const CONTENT_W = PAGE_W - ML - MR;
const RIGHT_EDGE = PAGE_W - MR;

// Column X positions for rug table
const COL_RUG_NUM = ML;           // "Rug #" or "Megerian Rug #"
const COL_CUST_NUM = ML + 80;     // "Customer Rug #"
const COL_SIZE = ML + 160;        // "Size"
const COL_RUG_TYPE = ML + 240;    // "Rug Type"
const COL_EXT_PRICE = RIGHT_EDGE; // "Ext. Price" (right-aligned)

// Service line indents
const SVC_NAME_X = ML + 100;
const SVC_PRICING_X = ML + 340;

// ─── PDF Renderer ───────────────────────────────────────────────────────────

class PdfBuilder {
  private doc: typeof PDFDocument.prototype;
  private regularFont!: PDFFont;
  private boldFont!: PDFFont;
  private page!: PDFPage;
  private y = 0;

  constructor(doc: typeof PDFDocument.prototype) {
    this.doc = doc;
  }

  async init() {
    this.regularFont = await this.doc.embedFont(StandardFonts.Helvetica);
    this.boldFont = await this.doc.embedFont(StandardFonts.HelveticaBold);
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - 48;
  }

  get currentY() { return this.y; }
  set currentY(v: number) { this.y = v; }

  textWidth(text: string, size: number, bold = false) {
    const font = bold ? this.boldFont : this.regularFont;
    return font.widthOfTextAtSize(text, size);
  }

  drawAt(text: string, x: number, size = 11, bold = false) {
    this.page.drawText(text, {
      x,
      y: this.y,
      size,
      font: bold ? this.boldFont : this.regularFont,
    });
  }

  drawRight(text: string, rightX: number, size = 11, bold = false) {
    const w = this.textWidth(text, size, bold);
    this.drawAt(text, rightX - w, size, bold);
  }

  advance(amount = 16) {
    this.y -= amount;
  }

  ensureSpace(needed: number) {
    if (this.y < needed + 48) {
      this.newPage();
    }
  }

  drawLine(fromX: number, toX: number, thickness = 0.5) {
    this.page.drawLine({
      start: { x: fromX, y: this.y },
      end: { x: toX, y: this.y },
      thickness,
    });
  }

  // Word-wrap text to fit within maxWidth, returns lines
  wrapText(text: string, size: number, maxWidth: number, bold = false): string[] {
    const font = bold ? this.boldFont : this.regularFont;
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";

    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }
}

export async function renderInvoicePdfBytes(payload: InvoicePdfPayload) {
  const doc = await PDFDocument.create();
  const b = new PdfBuilder(doc);
  await b.init();

  const isMultiRug = payload.rugs.length > 1;
  const docLabel = payload.documentType === "estimate" ? "Estimate" : "Invoice";

  // ─── Company Header ─────────────────────────────────────────────────────
  b.drawAt(payload.company.businessName, ML, 16, true);
  b.drawRight(`${docLabel.toUpperCase()} # ${payload.documentNumber}`, RIGHT_EDGE, 11, true);
  b.advance(18);

  const headerMetaLines = [
    payload.company.businessAddress,
    payload.company.businessPhone ? `Tel ${payload.company.businessPhone}` : "",
    payload.company.businessEmail ? payload.company.businessEmail : "",
  ].filter(Boolean);

  for (const line of headerMetaLines) {
    b.drawAt(line, ML, 9);
    b.advance(13);
  }

  b.drawRight(`${docLabel} Date: ${formatDate(payload.documentDate)}`, RIGHT_EDGE, 10);
  b.advance(8);
  b.drawLine(ML, RIGHT_EDGE, 0.9);
  b.advance(24);

  // ─── Address Blocks ─────────────────────────────────────────────────────
  const shippingX = ML + 300;

  b.drawAt("Billing", ML, 10, true);
  b.drawAt("Service / Contact", shippingX, 10, true);
  b.advance(14);

  // Billing: just client address
  const billingLines = payload.client.address.split("\n").filter(Boolean);
  const shippingLines: string[] = [];
  if (payload.client.contactName) shippingLines.push(payload.client.contactName);
  if (payload.client.phone) shippingLines.push(payload.client.phone);
  // Reuse same address for shipping
  shippingLines.push(...billingLines);

  const maxAddrLines = Math.max(billingLines.length, shippingLines.length);
  for (let i = 0; i < maxAddrLines; i++) {
    if (i < billingLines.length) {
      b.drawAt(billingLines[i], ML, 10, i === 0);
    }
    if (i < shippingLines.length) {
      b.drawAt(shippingLines[i], shippingX, 10, i === 0);
    }
    b.advance(14);
  }

  b.advance(20);

  // ─── Column Headers ─────────────────────────────────────────────────────
  const drawColumnHeaders = () => {
    if (isMultiRug) {
      b.drawAt("Megerian", COL_RUG_NUM, 9, true);
      b.drawAt("Customer", COL_CUST_NUM, 9, true);
      b.advance(12);
      b.drawAt("Rug #", COL_RUG_NUM, 9, true);
      b.drawAt("Rug #", COL_CUST_NUM, 9, true);
    } else {
      b.drawAt("Rug #", COL_RUG_NUM, 9, true);
    }
    b.drawAt("Size", COL_SIZE, 9, true);
    b.drawAt("Rug Type", COL_RUG_TYPE, 9, true);
    b.drawRight("Ext. Price", COL_EXT_PRICE, 9, true);
    b.advance(16);
  };

  drawColumnHeaders();

  // ─── Rug Sections ───────────────────────────────────────────────────────
  for (const rug of payload.rugs) {
    // Estimate space: rug header + services + notes + gap
    const estimatedHeight = 20 + (rug.services.length * 16) + (rug.notes ? 40 : 0) + 20;
    b.ensureSpace(estimatedHeight);

    // Rug header row
    b.drawAt(rug.rugNumber, COL_RUG_NUM, 10);
    if (isMultiRug) {
      b.drawAt(rug.customerRugNumber || "|", COL_CUST_NUM, 10);
    }
    b.drawAt(rug.size, COL_SIZE, 10);
    b.drawAt(rug.rugType, COL_RUG_TYPE, 10);

    // Per-rug subtotal on the header row (multi-rug invoices)
    if (isMultiRug) {
      const subLabel = `Sub total:   ${currency(rug.subtotal)}`;
      b.drawRight(subLabel, COL_EXT_PRICE, 10);
    }

    b.advance(18);

    // Service lines
    for (const svc of rug.services) {
      b.ensureSpace(40);

      // Service name (indented)
      b.drawAt(svc.name, SVC_NAME_X, 10);

      // Pricing label (e.g. "1@490/unit")
      b.drawAt(svc.pricingLabel, SVC_PRICING_X, 10);

      // Ext price (right-aligned)
      b.drawRight(currency(svc.extPrice), COL_EXT_PRICE, 10);

      b.advance(16);
    }

    // Rug Notes
    if (rug.notes) {
      b.advance(4);
      b.ensureSpace(40);

      // Word-wrap notes
      const notePrefix = "Rug Notes: ";
      const fullText = notePrefix + rug.notes;
      const maxNoteWidth = CONTENT_W - (SVC_NAME_X - ML);
      const noteLines = b.wrapText(fullText, 10, maxNoteWidth);

      for (let i = 0; i < noteLines.length; i++) {
        b.ensureSpace(20);
        if (i === 0) {
          // Draw "Rug Notes:" bold and rest regular
          b.drawAt("Rug Notes:", SVC_NAME_X, 10, true);
          const prefixW = b.textWidth("Rug Notes: ", 10, true);
          const restText = noteLines[0].replace(/^Rug Notes:\s*/, "");
          if (restText) {
            b.drawAt(restText, SVC_NAME_X + prefixW, 10);
          }
        } else {
          b.drawAt(noteLines[i], SVC_NAME_X, 10);
        }
        b.advance(14);
      }
    }

    b.advance(12);
  }

  // ─── Totals ─────────────────────────────────────────────────────────────
  b.ensureSpace(60);
  b.advance(8);

  b.drawRight(`Subtotal: ${currency(payload.subtotal)}`, COL_EXT_PRICE, 11);
  b.advance(16);
  b.drawRight(`Total: ${currency(payload.total)}`, COL_EXT_PRICE, 11, true);

  const footerY = 30;
  b.page.drawLine({
    start: { x: ML, y: footerY + 18 },
    end: { x: RIGHT_EDGE, y: footerY + 18 },
    thickness: 0.6,
    opacity: 0.35,
  });
  b.page.drawText(payload.company.brandFooter ?? "Powered by RugBoost", {
    x: ML,
    y: footerY,
    size: 8,
    font: b.regularFont,
    opacity: 0.72,
  });

  return doc.save();
}

// ─── Storage Utilities ──────────────────────────────────────────────────────

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
