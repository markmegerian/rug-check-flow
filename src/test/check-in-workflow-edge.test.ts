import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("check-in workflow edge function", () => {
  it("enforces authenticated office/admin/checkin staff access with company lookup", () => {
    const fn = readFileSync(resolve(process.cwd(), "supabase/functions/check-in-workflow/index.ts"), "utf-8");
    expect(fn).toContain('in("role", ALLOWED_ROLES)');
    expect(fn).toContain('rpc("get_user_company_id"');
    expect(fn).toContain('eq("company_id", params.callerCompanyId)');
  });

  it("keeps cleaning approval defaults and estimate skip logic on the backend", () => {
    const fn = readFileSync(resolve(process.cwd(), "supabase/functions/check-in-workflow/index.ts"), "utf-8");
    expect(fn).toContain('approval_status: isCleaningCategory(rule?.category) ? "approved" : "pending"');
    expect(fn).toContain('Boolean(rule?.requires_estimate) && !isCleaningCategory(rule?.category)');
    expect(fn).toContain('notification_type: "estimate_batch_send"');
  });

  it("documents idempotency header support and manual auth config registration", () => {
    const fn = readFileSync(resolve(process.cwd(), "supabase/functions/check-in-workflow/index.ts"), "utf-8");
    const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf-8");
    expect(fn).toContain('x-idempotency-key');
    expect(fn).toContain('anonClient.auth.getUser(token)');
    expect(config).toContain('[functions.check-in-workflow]');
    expect(config).toContain('verify_jwt = false');
  });
});
