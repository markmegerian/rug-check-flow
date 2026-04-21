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

  it("downloads signed invoice urls via browser navigation instead of JS blob fetch", () => {
    const client = readFileSync(resolve(process.cwd(), "src/lib/invoice-artifacts.ts"), "utf-8");
    expect(client).toContain('const signedUrl = functionData.signed_url as string;');
    expect(client).toContain('link.href = signedUrl;');
    expect(client).toContain('window.open(signedUrl, "_blank", "noopener,noreferrer")');
    expect(client).not.toContain('fetch(functionData.signed_url)');
    expect(client).not.toContain('URL.createObjectURL(data)');
  });

  it("surfaces edge-function error details instead of only generic non-2xx failures", () => {
    const client = readFileSync(resolve(process.cwd(), "src/lib/invoice-artifacts.ts"), "utf-8");
    expect(client).toContain('functionData?.details');
    expect(client).toContain('functionError ? JSON.stringify(functionError) : null');
    expect(client).toContain('throw new Error(details[0] ?? "Failed to request invoice PDF")');
  });
});
