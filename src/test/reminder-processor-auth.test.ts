import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("reminder processor auth model", () => {
  it("supports scheduler secret auth and company-scoped manual auth", () => {
    const fn = readFileSync(resolve(process.cwd(), "supabase/functions/process-notification-cadence/index.ts"), "utf-8");
    expect(fn).toContain('const cronSecret = req.headers.get("x-cron-secret")');
    expect(fn).toContain('const configuredCronSecret = Deno.env.get("PROCESS_NOTIFICATION_CADENCE_SECRET")');
    expect(fn).toContain('rpc("get_user_company_id"');
    expect(fn).toContain('callerCompanyId');
  });
});
