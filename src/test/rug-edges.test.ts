import { describe, expect, it } from "vitest";
import { calcSelectedLinearFt, type RugEdge } from "@/lib/rug-edges";

describe("calcSelectedLinearFt", () => {
  const length = 10;
  const width = 8;

  it("returns 0 when no edges selected", () => {
    expect(calcSelectedLinearFt([], length, width)).toBe(0);
  });

  it("returns width for a single end", () => {
    expect(calcSelectedLinearFt(["end1"], length, width)).toBe(8);
    expect(calcSelectedLinearFt(["end2"], length, width)).toBe(8);
  });

  it("returns length for a single side", () => {
    expect(calcSelectedLinearFt(["side1"], length, width)).toBe(10);
    expect(calcSelectedLinearFt(["side2"], length, width)).toBe(10);
  });

  it("returns both widths for both ends", () => {
    expect(calcSelectedLinearFt(["end1", "end2"], length, width)).toBe(16);
  });

  it("returns both lengths for both sides", () => {
    expect(calcSelectedLinearFt(["side1", "side2"], length, width)).toBe(20);
  });

  it("returns full perimeter for all edges", () => {
    const allEdges: RugEdge[] = ["end1", "end2", "side1", "side2"];
    expect(calcSelectedLinearFt(allEdges, length, width)).toBe(36);
  });

  it("sums mixed edges correctly", () => {
    expect(calcSelectedLinearFt(["end1", "side1"], length, width)).toBe(18);
    expect(calcSelectedLinearFt(["end2", "side2"], length, width)).toBe(18);
    expect(calcSelectedLinearFt(["end1", "end2", "side1"], length, width)).toBe(26);
  });

  it("handles zero dimensions", () => {
    expect(calcSelectedLinearFt(["end1", "side1"], 0, 0)).toBe(0);
  });

  it("handles fractional dimensions", () => {
    expect(calcSelectedLinearFt(["end1"], 9.5, 6.3)).toBeCloseTo(6.3);
    expect(calcSelectedLinearFt(["side1"], 9.5, 6.3)).toBeCloseTo(9.5);
  });
});
