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

  it("keeps cleaning approval defaults, walk-in company stamping, and estimate skip logic on the backend", () => {
    const fn = readFileSync(resolve(process.cwd(), "supabase/functions/check-in-workflow/index.ts"), "utf-8");
    expect(fn).toContain('function shouldAutoApproveService(service: WorkflowServiceInput, rule: ServiceRuleRow | undefined)');
    expect(fn).toContain('if (isCleaningCategory(rule?.category)) return true;');
    expect(fn).toContain('return isStandardCleaningServiceName(service.service_name);');
    expect(fn).toContain('approval_status: shouldAutoApproveService(service, rule) ? "approved" : "pending"');
    expect(fn).toContain('Boolean(rule?.requires_estimate) && !isCleaningCategory(rule?.category)');
    expect(fn).toContain('notification_type: "estimate_batch_send"');
    expect(fn).toContain('company_id: actor.companyId');
  });

  it("documents durable idempotency support and manual auth config registration", () => {
    const fn = readFileSync(resolve(process.cwd(), "supabase/functions/check-in-workflow/index.ts"), "utf-8");
    const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf-8");
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260416230000_add_checkin_idempotency_keys.sql"), "utf-8");
    expect(fn).toContain('x-idempotency-key');
    expect(fn).toContain('claimIdempotencyKey');
    expect(fn).toContain('completeIdempotencyKey');
    expect(fn).toContain('from("checkin_idempotency_keys")');
    expect(fn).toContain('anonClient.auth.getUser(token)');
    expect(config).toContain('[functions.check-in-workflow]');
    expect(config).toContain('verify_jwt = false');
    expect(migration).toContain('create table if not exists public.checkin_idempotency_keys');
    expect(migration).toContain('unique (actor_user_id, idempotency_key)');
  });

  it("documents walk-in rug company backfill for rows without clients", () => {
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260416231500_fix_walkin_rug_company_scope.sql"), "utf-8");
    expect(migration).toContain('new.checked_in_by is not null');
    expect(migration).toContain('from public.company_memberships cm');
    expect(migration).toContain('update public.rugs r');
    expect(migration).toContain('r.company_id is null');
  });
});
