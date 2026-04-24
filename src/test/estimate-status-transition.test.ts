import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("estimate status transition backend cutover", () => {
  it("adds a shared backend status transition function for office and portal callers", () => {
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260424120000_add_transition_estimate_status_function.sql"), "utf-8");
    expect(migration).toContain("create or replace function public.transition_estimate_status(");
    expect(migration).toContain("p_next_status public.estimate_status");
    expect(migration).toContain("v_is_internal boolean := public.has_role");
    expect(migration).toContain("from public.portal_users pu");
    expect(migration).toContain("Portal client marked estimate");
    expect(migration).toContain("grant execute on function public.transition_estimate_status");
  });

  it("exposes the shared status transition through the frontend helper layer", () => {
    const helper = readFileSync(resolve(process.cwd(), "src/lib/estimate-group-actions.ts"), "utf-8");
    expect(helper).toContain('rpc("transition_estimate_status"');
    expect(helper).toContain("nextStatus: Extract<EstimateStatus, \"approved\" | \"rejected\" | \"needs_office_review\">");
  });
});
