import { describe, expect, it } from "vitest";
import { calcSelectedLinearFt, type RugEdge } from "@/lib/rug-edges";
import { isEntryEditable, type CheckInEntry } from "@/data/check-in-log";

const baseEntry = (checkedInAt: Date): CheckInEntry => ({
  id: "entry-1",
  rugNumber: "R-100",
  clientName: "Test Client",
  rugType: "Persian",
  length: 8,
  width: 10,
  services: [{ id: "svc-1", name: "Wash", price: 20 }],
  totalPrice: 20,
  checkedInAt,
  checkedInBy: "staff",
});

describe("calcSelectedLinearFt", () => {
  it("returns 0 when no edges are selected", () => {
    expect(calcSelectedLinearFt([], 10, 8)).toBe(0);
  });

  it("sums selected sides and ends correctly", () => {
    const edges: RugEdge[] = ["end1", "end2", "side1"];
    expect(calcSelectedLinearFt(edges, 10, 8)).toBe(26);
  });
});

describe("isEntryEditable", () => {
  it("always allows admin and office users", () => {
    const oldEntry = baseEntry(new Date(Date.now() - 1000 * 60 * 60 * 8));
    expect(isEntryEditable(oldEntry, "admin")).toBe(true);
    expect(isEntryEditable(oldEntry, "office")).toBe(true);
  });

  it("restricts check-in staff edits to first two hours", () => {
    const freshEntry = baseEntry(new Date(Date.now() - 1000 * 60 * 30));
    const staleEntry = baseEntry(new Date(Date.now() - 1000 * 60 * 60 * 3));
    expect(isEntryEditable(freshEntry, "checkin_staff")).toBe(true);
    expect(isEntryEditable(staleEntry, "checkin_staff")).toBe(false);
  });
});
