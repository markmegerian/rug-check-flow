import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("estimates frontend cutover", () => {
  it("routes create and revise flows through the estimate workflow edge function", () => {
    const file = readFileSync(resolve(process.cwd(), "src/components/office/EstimatesTab.tsx"), "utf-8");
    expect(file).toContain('safeInvoke<EstimateWorkflowResponse>("estimate-workflow"');
    expect(file).toContain('mode: "create"');
    expect(file).toContain('mode: "revise"');
    expect(file).not.toContain('.from("estimate_items").insert(items)');
    expect(file).not.toContain('delete().eq("id", insertedEstimate.id)');
    expect(file).not.toContain('.select("description, quantity, unit_price, total, service_category, rug_service_id")');
  });
});
