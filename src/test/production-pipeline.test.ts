import { describe, expect, it } from "vitest";
import { PRODUCTION_STAGES, type ProductionStage } from "@/data/production";

describe("production pipeline state machine", () => {
  function getNextStage(current: ProductionStage): ProductionStage | null {
    const idx = PRODUCTION_STAGES.findIndex((s) => s.id === current);
    if (idx < 0 || idx >= PRODUCTION_STAGES.length - 1) return null;
    return PRODUCTION_STAGES[idx + 1].id;
  }

  it("checked_in advances to in_production", () => {
    expect(getNextStage("checked_in")).toBe("in_production");
  });

  it("in_production advances to ready", () => {
    expect(getNextStage("in_production")).toBe("ready");
  });

  it("ready advances to picked_up", () => {
    expect(getNextStage("ready")).toBe("picked_up");
  });

  it("picked_up has no next stage (terminal)", () => {
    expect(getNextStage("picked_up")).toBeNull();
  });

  it("full pipeline traversal works", () => {
    let current: ProductionStage = "checked_in";
    const visited: ProductionStage[] = [current];

    let next = getNextStage(current);
    while (next) {
      visited.push(next);
      current = next;
      next = getNextStage(current);
    }

    expect(visited).toEqual(["checked_in", "in_production", "ready", "picked_up"]);
    expect(visited).toHaveLength(PRODUCTION_STAGES.length);
  });

  it("each stage can be found by ID", () => {
    const stages: ProductionStage[] = ["checked_in", "in_production", "ready", "picked_up"];
    for (const stageId of stages) {
      const found = PRODUCTION_STAGES.find((s) => s.id === stageId);
      expect(found, `Stage ${stageId} not found`).toBeDefined();
    }
  });

  it("stages have monotonically increasing indices", () => {
    for (let i = 0; i < PRODUCTION_STAGES.length - 1; i++) {
      const current = PRODUCTION_STAGES[i];
      const next = PRODUCTION_STAGES[i + 1];
      const currentIdx = PRODUCTION_STAGES.findIndex((s) => s.id === current.id);
      const nextIdx = PRODUCTION_STAGES.findIndex((s) => s.id === next.id);
      expect(nextIdx).toBeGreaterThan(currentIdx);
    }
  });
});
