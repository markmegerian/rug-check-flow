import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("generate invoice workflow edge function", () => {
  it("enforces authenticated office/admin access with company lookup", () => {
    const fn = readFileSync(resolve(process.cwd(), "supabase/functions/generate-invoice-workflow/index.ts"), "utf-8");
    expect(fn).toContain('in("role", ALLOWED_ROLES)');
    expect(fn).toContain('rpc("get_user_company_id"');
    expect(fn).toContain('anonClient.auth.getUser(token)');
  });

  it("owns invoice creation writes and pricing logic on the backend", () => {
    const fn = readFileSync(resolve(process.cwd(), "supabase/functions/generate-invoice-workflow/index.ts"), "utf-8");
    expect(fn).toContain('applyCleaningServiceMinimum');
    expect(fn).toContain('.from("invoice_items").insert(lineItems)');
    expect(fn).toContain('event_type: "walkin_invoice_created"');
    expect(fn).toContain('status: "draft"');
  });

  it("is registered for manual auth verification in config", () => {
    const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf-8");
    expect(config).toContain('[functions.generate-invoice-workflow]');
    expect(config).toContain('verify_jwt = false');
  });
});
