import { describe, expect, it } from "vitest";
import { PRODUCTION_STAGES, type ProductionStage } from "@/data/production";

describe("PRODUCTION_STAGES", () => {
  it("has exactly 4 stages", () => {
    expect(PRODUCTION_STAGES).toHaveLength(4);
  });

  it("follows the correct order", () => {
    const ids = PRODUCTION_STAGES.map((s) => s.id);
    expect(ids).toEqual(["checked_in", "in_production", "ready", "picked_up"]);
  });

  it("each stage has a human-readable label", () => {
    for (const stage of PRODUCTION_STAGES) {
      expect(stage.label).toBeTruthy();
      expect(stage.label.length).toBeGreaterThan(2);
    }
  });

  it("stage IDs are valid ProductionStage type", () => {
    const validStages: ProductionStage[] = ["checked_in", "in_production", "ready", "picked_up"];
    for (const stage of PRODUCTION_STAGES) {
      expect(validStages).toContain(stage.id);
    }
  });

  it("checked_in is the first stage (initial state)", () => {
    expect(PRODUCTION_STAGES[0].id).toBe("checked_in");
  });

  it("picked_up is the last stage (terminal state)", () => {
    expect(PRODUCTION_STAGES[PRODUCTION_STAGES.length - 1].id).toBe("picked_up");
  });
});
