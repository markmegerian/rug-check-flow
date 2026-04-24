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

  it("routes office estimate status changes and queueing through backend helpers", () => {
    const file = readFileSync(resolve(process.cwd(), "src/components/office/EstimatesTab.tsx"), "utf-8");
    expect(file).toContain("markEstimateGroupReady([estimate])");
    expect(file).toContain("expireEstimateGroupBatch([estimate])");
    expect(file).toContain("queueEstimateGroupBatch([estimate])");
    expect(file).toContain("transitionEstimateStatus({");
    expect(file).not.toContain('.from("estimates")\n      .update(');
    expect(file).not.toContain("queueEstimateForBatchSend");
  });

  it("routes portal approve/reject transitions through the shared backend status helper", () => {
    const file = readFileSync(resolve(process.cwd(), "src/components/portal/PortalEstimatesTab.tsx"), "utf-8");
    expect(file).toContain("transitionEstimateStatus({");
    expect(file).not.toContain('.from("estimates")\n      .update({ status: nextStatus');
    expect(file).not.toContain('.from("communication_events").insert(eventPayload)');
  });
});
