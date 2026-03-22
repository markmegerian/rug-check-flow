import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { deriveUserRole, isEntryEditable, type CheckInEntry } from "@/data/check-in-log";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 2, 18, 12, 0, 0)); });
afterEach(() => { vi.useRealTimers(); });

const makeEntry = (minutesAgo: number): CheckInEntry => ({
  id: "entry-test",
  rugNumber: "R-100",
  clientName: "Test Client",
  rugType: "Persian",
  length: 8,
  width: 10,
  services: [{ id: "svc-1", name: "Wash", price: 20 }],
  totalPrice: 20,
  checkedInAt: new Date(Date.now() - minutesAgo * 60 * 1000),
  checkedInBy: "staff",
});

describe("deriveUserRole", () => {
  it("returns admin for users with admin role", () => {
    expect(deriveUserRole(["admin"])).toBe("admin");
    expect(deriveUserRole(["admin", "office"])).toBe("admin");
  });

  it("returns office for users with office role but not admin", () => {
    expect(deriveUserRole(["office"])).toBe("office");
    expect(deriveUserRole(["office", "checkin_staff"])).toBe("office");
  });

  it("returns checkin_staff for all other role combinations", () => {
    expect(deriveUserRole(["checkin_staff"])).toBe("checkin_staff");
    expect(deriveUserRole(["driver"])).toBe("checkin_staff");
    expect(deriveUserRole([])).toBe("checkin_staff");
  });

  it("picks the highest privilege role", () => {
    expect(deriveUserRole(["driver", "admin"])).toBe("admin");
    expect(deriveUserRole(["checkin_staff", "office"])).toBe("office");
  });
});

describe("isEntryEditable", () => {
  it("always allows admin to edit", () => {
    const staleEntry = makeEntry(300); // 5 hours ago
    expect(isEntryEditable(staleEntry, "admin")).toBe(true);
  });

  it("always allows office to edit", () => {
    const staleEntry = makeEntry(300);
    expect(isEntryEditable(staleEntry, "office")).toBe(true);
  });

  it("allows checkin_staff to edit within 2 hours", () => {
    const freshEntry = makeEntry(30);
    expect(isEntryEditable(freshEntry, "checkin_staff")).toBe(true);
  });

  it("blocks checkin_staff after 2 hours", () => {
    const staleEntry = makeEntry(121);
    expect(isEntryEditable(staleEntry, "checkin_staff")).toBe(false);
  });

  it("boundary: exactly at 2 hours is not editable", () => {
    const entry = makeEntry(120);
    expect(isEntryEditable(entry, "checkin_staff")).toBe(false);
  });

  it("boundary: just under 2 hours is editable", () => {
    const entry = makeEntry(119);
    expect(isEntryEditable(entry, "checkin_staff")).toBe(true);
  });
});
