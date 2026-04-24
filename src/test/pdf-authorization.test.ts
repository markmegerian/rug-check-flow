import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("pdf authorization hardening", () => {
  it("applies portal ownership checks in both estimate and invoice branches", () => {
    const fn = readFileSync(resolve(process.cwd(), "supabase/functions/invoice-pdf/index.ts"), "utf-8");
    const matches = fn.match(/from\("portal_users"\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("resolves company branding using a company id instead of first-row lookup", () => {
    const fn = readFileSync(resolve(process.cwd(), "supabase/functions/invoice-pdf/index.ts"), "utf-8");
    expect(fn).toContain("fetchCompanyInfo(adminClient, companyId)");
    expect(fn).toContain('.eq("company_id", companyId)');
    expect(fn).toContain('select("id, client_id, company_id, invoice_number, total, issued_at, due_at, created_at, pdf_storage_path")');
    expect(fn).toContain('companyId = invoice.company_id ?? null;');
  });

  it("prepares signed invoice urls for UI-owned browser opening instead of JS blob fetch", () => {
    const helper = readFileSync(resolve(process.cwd(), "src/lib/invoice-artifacts.ts"), "utf-8");
    const officeInvoices = readFileSync(resolve(process.cwd(), "src/components/office/InvoicesTab.tsx"), "utf-8");
    const portalInvoices = readFileSync(resolve(process.cwd(), "src/components/portal/PortalInvoicesTab.tsx"), "utf-8");
    expect(helper).toContain('const signedUrl = functionData.signed_url as string;');
    expect(helper).toContain('export function openInvoicePdfUrl(signedUrl: string)');
    expect(helper).toContain('window.open(signedUrl, "_blank", "noopener,noreferrer")');
    expect(helper).toContain('signedUrl,');
    expect(helper).not.toContain('fetch(functionData.signed_url)');
    expect(helper).not.toContain('URL.createObjectURL(data)');
    expect(officeInvoices).toContain('forceRegenerate: true,');
    expect(officeInvoices).toContain('const openPdf = () => openInvoicePdfUrl(artifact.signedUrl);');
    expect(portalInvoices).toContain('openInvoicePdfUrl(artifact.signedUrl);');
  });

  it("surfaces edge-function error details instead of only generic non-2xx failures", () => {
    const client = readFileSync(resolve(process.cwd(), "src/lib/invoice-artifacts.ts"), "utf-8");
    expect(client).toContain('functionData?.details');
    expect(client).toContain('functionError ? JSON.stringify(functionError) : null');
    expect(client).toContain('throw new Error(details[0] ?? "Failed to request invoice PDF")');
  });
});
