import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("estimate workflow edge function", () => {
  it("enforces authenticated office/admin access with company lookup", () => {
    const fn = readFileSync(resolve(process.cwd(), "supabase/functions/estimate-workflow/index.ts"), "utf-8");
    expect(fn).toContain('in("role", ALLOWED_ROLES)');
    expect(fn).toContain('rpc("get_user_company_id"');
    expect(fn).toContain('anonClient.auth.getUser(token)');
  });

  it("owns estimate creation and revision writes on the backend", () => {
    const fn = readFileSync(resolve(process.cwd(), "supabase/functions/estimate-workflow/index.ts"), "utf-8");
    expect(fn).toContain('.from("rug_services")');
    expect(fn).toContain('.from("estimate_items").insert(items)');
    expect(fn).toContain('.from("estimate_items").insert(copiedItems)');
    expect(fn).toContain('event_type: "estimate_created"');
    expect(fn).toContain('event_type: "estimate_revised"');
  });

  it("is registered for manual auth verification in config", () => {
    const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf-8");
    expect(config).toContain('[functions.estimate-workflow]');
    expect(config).toContain('verify_jwt = false');
  });
});
