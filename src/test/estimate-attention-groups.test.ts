import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("estimate attention group cutover", () => {
  it("adds backend functions for grouped office estimate attention", () => {
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260424134000_add_estimate_attention_group_functions.sql"), "utf-8");
    expect(migration).toContain("create or replace function public.get_estimate_attention_groups()");
    expect(migration).toContain("create or replace function public.get_estimate_attention_group_details(");
    expect(migration).toContain("'needs_office_review', 'needs_revision', 'ready_to_send'");
    expect(migration).toContain("group by c.id, c.name, c.email, c.company");
    expect(migration).toContain("grant execute on function public.get_estimate_attention_groups() to authenticated;");
    expect(migration).toContain("grant execute on function public.get_estimate_attention_group_details(uuid) to authenticated;");
  });

  it("routes the office Estimates attention queue through the new grouped helper", () => {
    const helper = readFileSync(resolve(process.cwd(), "src/lib/estimate-attention-groups.ts"), "utf-8");
    const file = readFileSync(resolve(process.cwd(), "src/components/office/EstimatesTab.tsx"), "utf-8");
    expect(helper).toContain('rpc("get_estimate_attention_groups"');
    expect(helper).toContain('rpc("get_estimate_attention_group_details"');
    expect(file).toContain("fetchEstimateAttentionGroups()");
    expect(file).toContain("fetchEstimateAttentionGroupDetails(clientId)");
    expect(file).toContain("One client/company card per active estimate account");
    expect(file).not.toContain("fetchEstimateReviewGroups()");
  });
});
