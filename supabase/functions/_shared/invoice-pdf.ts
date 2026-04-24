import { PDFDocument, type PDFImage, type PDFPage, type PDFFont } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SAMPLE_FONT_BOLD_BASE64, SAMPLE_FONT_REGULAR_BASE64 } from "./sample-fonts.ts";
import { SAMPLE_LOGO_PNG_BASE64 } from "./sample-logo.ts";

export type CompanyInfo = {
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  businessFax: string;
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

function decodeBase64(base64: string) {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

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

const PAGE_W = 595.28;
const PAGE_H = 841.89;

const HEADER_X = 45.117;
const HEADER_RIGHT = 548.5;
const LOGO_X = 269.288;
const LOGO_Y = 723.504;
const LOGO_W = 56.194;
const LOGO_H = 70.435;

const BILLING_X = 45.12;
const SHIPPING_X = 401.238;

const TABLE_HEADER_FIRST_Y = 551.242;
const TABLE_HEADER_OTHER_Y = 785.651;
const TABLE_HEADER_SECOND_ROW_OFFSET = 10.996;
const TABLE_FIRST_ROW_OFFSET = 25.025;

const RUG_X = 54.967;
const CUSTOMER_RUG_X = 124.398;
const SIZE_X = 157.592;
const RUG_TYPE_X = 275.994;
const SERVICE_NAME_X = 209.97;
const SERVICE_NAME_MAX_WIDTH = 150;
const PRICING_X = 379.492;
const PRICE_RIGHT_X = 548;
const NOTE_TEXT_X = 261.212;
const NOTE_TEXT_MAX_WIDTH = 250;

const HEADER_FONT_SIZE = 10.989;
const BLOCK_FONT_SIZE = 11;
const TABLE_FONT_SIZE = 9.164;

const COMPANY_LINE_STEP = 13.187;
const ADDRESS_LINE_STEP = 13.2;
const ROW_STEP = 14.078;
const WRAP_STEP = 10.996;
const NOTE_GAP = 11.048;
const NEXT_RUG_GAP = 14.028;

const SUBTOTAL_Y = 85.53;
const TOTAL_Y = 72.33;

class PdfBuilder {
  private doc: typeof PDFDocument.prototype;
  private regularFont!: PDFFont;
  private boldFont!: PDFFont;
  private logo!: PDFImage;
  page!: PDFPage;

  constructor(doc: typeof PDFDocument.prototype) {
    this.doc = doc;
  }

  async init() {
    this.doc.registerFontkit(fontkit);
    this.regularFont = await this.doc.embedFont(decodeBase64(SAMPLE_FONT_REGULAR_BASE64));
    this.boldFont = await this.doc.embedFont(decodeBase64(SAMPLE_FONT_BOLD_BASE64));
    this.logo = await this.doc.embedPng(decodeBase64(SAMPLE_LOGO_PNG_BASE64));
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
  }

  textWidth(text: string, size: number, bold = false) {
    const font = bold ? this.boldFont : this.regularFont;
    return font.widthOfTextAtSize(text, size);
  }

  drawText(text: string, x: number, y: number, size = BLOCK_FONT_SIZE, bold = false) {
    if (!text) return;
    this.page.drawText(text, {
      x,
      y,
      size,
      font: bold ? this.boldFont : this.regularFont,
    });
  }

  drawRight(text: string, rightX: number, y: number, size = BLOCK_FONT_SIZE, bold = false) {
    const w = this.textWidth(text, size, bold);
    this.drawText(text, rightX - w, y, size, bold);
  }

  drawLogo() {
    this.page.drawImage(this.logo, {
      x: LOGO_X,
      y: LOGO_Y,
      width: LOGO_W,
      height: LOGO_H,
    });
  }

  wrapText(text: string, size: number, maxWidth: number, bold = false): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    const lines: string[] = [];
    let current = words[0];

    for (const word of words.slice(1)) {
      const candidate = `${current} ${word}`;
      if (this.textWidth(candidate, size, bold) <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }

    lines.push(current);
    return lines;
  }
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function estimateRugHeight(builder: PdfBuilder, rug: RugSection) {
  let height = ROW_STEP;

  for (const service of rug.services) {
    const wrapped = Math.max(builder.wrapText(service.name, TABLE_FONT_SIZE, SERVICE_NAME_MAX_WIDTH).length, 1);
    height += ROW_STEP + ((wrapped - 1) * WRAP_STEP);
  }

  const noteLines = builder.wrapText(rug.notes || "", TABLE_FONT_SIZE, NOTE_TEXT_MAX_WIDTH).length;
  height += NOTE_GAP + NEXT_RUG_GAP + (Math.max(noteLines - 1, 0) * WRAP_STEP);
  return height;
}

function drawTableHeader(builder: PdfBuilder, topY: number) {
  builder.drawText("Megerian", 48.599, topY, TABLE_FONT_SIZE, true);
  builder.drawText("Rug #", 56.498, topY - TABLE_HEADER_SECOND_ROW_OFFSET, TABLE_FONT_SIZE, true);
  builder.drawText("Customer", 103.382, topY, TABLE_FONT_SIZE, true);
  builder.drawText("Rug #", 111.592, topY - TABLE_HEADER_SECOND_ROW_OFFSET, TABLE_FONT_SIZE, true);
  builder.drawText("Size", 171.374, topY, TABLE_FONT_SIZE, true);
  builder.drawText("Rug Type", 271.486, topY, TABLE_FONT_SIZE, true);
  builder.drawRight("Ext. Price", HEADER_RIGHT, topY, TABLE_FONT_SIZE, true);

  return topY - TABLE_FIRST_ROW_OFFSET;
}

function normalizePhoneForTemplate(phone: string) {
  return phone.replace(/[^\d]/g, "") || phone;
}

export async function renderInvoicePdfBytes(payload: InvoicePdfPayload) {
  const doc = await PDFDocument.create();
  const builder = new PdfBuilder(doc);
  await builder.init();

  const docLabel = payload.documentType === "estimate" ? "Estimate" : "Invoice";

  builder.drawText(payload.company.businessName, HEADER_X, 783.482, HEADER_FONT_SIZE, true);

  const companyAddressLines = splitLines(payload.company.businessAddress);
  let companyY = 770.356;
  for (const line of companyAddressLines) {
    builder.drawText(line, HEADER_X, companyY, HEADER_FONT_SIZE);
    companyY -= COMPANY_LINE_STEP;
  }

  if (payload.company.businessPhone) {
    builder.drawText(`Tel: ${payload.company.businessPhone}`, HEADER_X, companyY, HEADER_FONT_SIZE);
    companyY -= COMPANY_LINE_STEP;
  }

  if (payload.company.businessFax) {
    builder.drawText(`Fax: ${payload.company.businessFax}`, HEADER_X, companyY, HEADER_FONT_SIZE);
  }

  builder.drawLogo();
  builder.drawRight(`${docLabel} #: ${payload.documentNumber}`, HEADER_RIGHT, 783.543, HEADER_FONT_SIZE);
  builder.drawRight(`${docLabel} Date: ${formatDate(payload.documentDate)}`, HEADER_RIGHT, 770.356, HEADER_FONT_SIZE);

  builder.drawText("Billing Address:", BILLING_X, 664.11, BLOCK_FONT_SIZE, true);
  const billingLines = splitLines(payload.client.address);
  let billingY = 650.91;
  for (const line of billingLines) {
    builder.drawText(line, BILLING_X, billingY, BLOCK_FONT_SIZE);
    billingY -= ADDRESS_LINE_STEP;
  }

  builder.drawText("Shipping Address:", SHIPPING_X, 664.11, BLOCK_FONT_SIZE, true);
  const shippingLines = [
    payload.client.contactName || payload.client.name,
    payload.client.phone ? normalizePhoneForTemplate(payload.client.phone) : "",
    ...billingLines,
  ].filter(Boolean);
  let shippingY = 650.85;
  for (const [index, line] of shippingLines.entries()) {
    builder.drawText(line, SHIPPING_X, shippingY, BLOCK_FONT_SIZE, index === 0);
    shippingY -= ADDRESS_LINE_STEP;
  }

  let rowY = drawTableHeader(builder, TABLE_HEADER_FIRST_Y);

  for (const rug of payload.rugs) {
    const estimatedHeight = estimateRugHeight(builder, rug);
    if (rowY - estimatedHeight < 60) {
      builder.newPage();
      rowY = drawTableHeader(builder, TABLE_HEADER_OTHER_Y);
    }

    builder.drawText(rug.rugNumber, RUG_X, rowY, TABLE_FONT_SIZE);
    builder.drawText(rug.customerRugNumber || "|", CUSTOMER_RUG_X, rowY, TABLE_FONT_SIZE);
    builder.drawText(rug.size, SIZE_X, rowY, TABLE_FONT_SIZE);
    builder.drawText(rug.rugType, RUG_TYPE_X, rowY, TABLE_FONT_SIZE);

    let cursorY = rowY - ROW_STEP;

    for (const service of rug.services) {
      const nameLines = builder.wrapText(service.name, TABLE_FONT_SIZE, SERVICE_NAME_MAX_WIDTH);
      const primaryName = nameLines[0] ?? service.name;
      builder.drawText(primaryName, SERVICE_NAME_X, cursorY, TABLE_FONT_SIZE);
      builder.drawText(service.pricingLabel, PRICING_X, cursorY, TABLE_FONT_SIZE);
      builder.drawRight(currency(service.extPrice), PRICE_RIGHT_X, cursorY, TABLE_FONT_SIZE);

      let serviceBottomY = cursorY;
      for (const extraLine of nameLines.slice(1)) {
        serviceBottomY -= WRAP_STEP;
        builder.drawText(extraLine, SERVICE_NAME_X, serviceBottomY, TABLE_FONT_SIZE);
      }

      cursorY = serviceBottomY - ROW_STEP;
    }

    const noteY = cursorY - NOTE_GAP;
    builder.drawText("Rug Notes:", SERVICE_NAME_X, noteY, TABLE_FONT_SIZE, true);

    if (rug.notes.trim()) {
      const noteLines = builder.wrapText(rug.notes.trim(), TABLE_FONT_SIZE, NOTE_TEXT_MAX_WIDTH);
      builder.drawText(noteLines[0] ?? rug.notes.trim(), NOTE_TEXT_X, noteY, TABLE_FONT_SIZE);
      let noteBottomY = noteY;
      for (const extraLine of noteLines.slice(1)) {
        noteBottomY -= WRAP_STEP;
        builder.drawText(extraLine, SERVICE_NAME_X, noteBottomY, TABLE_FONT_SIZE);
      }
      rowY = noteBottomY - NEXT_RUG_GAP;
    } else {
      rowY = noteY - NEXT_RUG_GAP;
    }
  }

  if (rowY < 120) {
    builder.newPage();
  }

  builder.drawRight(`Subtotal: ${currency(payload.subtotal)}`, HEADER_RIGHT, SUBTOTAL_Y, BLOCK_FONT_SIZE);
  builder.drawRight(`Total: ${currency(payload.total)}`, HEADER_RIGHT, TOTAL_Y, BLOCK_FONT_SIZE, true);

  return doc.save();
}

export async function ensureInvoicePdfBucket(adminClient: SupabaseClient, bucket: string) {
  const { error } = await adminClient.storage.createBucket(bucket, { public: false });
  if (!error) return;

  const message = (error.message ?? "").toLowerCase();
  if (message.includes("already exists") || message.includes("duplicate")) return;

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
