import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  getNextDateForRouteDay,
  formatPickupDate,
  formatShortDate,
  formatDateTime,
  isValidIsoDate,
} from "@/lib/date-helpers";

describe("getNextDateForRouteDay", () => {
  beforeEach(() => {
    // Fix "today" to Wednesday, March 18, 2026
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 18)); // March 18, 2026 (Wednesday)
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns next Thursday when today is Wednesday", () => {
    expect(getNextDateForRouteDay("Thursday")).toBe("2026-03-19");
  });

  it("returns next Wednesday (7 days) when route day matches today", () => {
    expect(getNextDateForRouteDay("Wednesday")).toBe("2026-03-25");
  });

  it("returns next Monday (5 days from Wednesday)", () => {
    expect(getNextDateForRouteDay("Monday")).toBe("2026-03-23");
  });

  it("returns next Friday (2 days from Wednesday)", () => {
    expect(getNextDateForRouteDay("Friday")).toBe("2026-03-20");
  });

  it("defaults to Thursday for unknown day names", () => {
    expect(getNextDateForRouteDay("InvalidDay")).toBe("2026-03-19");
  });

  it("returns a valid YYYY-MM-DD string", () => {
    const result = getNextDateForRouteDay("Sunday");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("formatPickupDate", () => {
  it("formats a valid ISO date as a human-readable string", () => {
    const result = formatPickupDate("2026-03-19");
    expect(result).toContain("March");
    expect(result).toContain("19");
    expect(result).toContain("2026");
    expect(result).toContain("Thursday");
  });

  it("returns '—' for invalid dates", () => {
    expect(formatPickupDate("not-a-date")).toBe("—");
    expect(formatPickupDate("")).toBe("—");
  });
});

describe("formatShortDate", () => {
  it("formats a valid date as short form", () => {
    const result = formatShortDate("2026-03-19");
    expect(result).toContain("Mar");
    expect(result).toContain("19");
    expect(result).toContain("2026");
  });

  it("returns '—' for invalid dates", () => {
    expect(formatShortDate("xyz")).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("formats a valid datetime string", () => {
    const result = formatDateTime("2026-03-19T15:45:00Z");
    expect(result).toContain("Mar");
    expect(result).toContain("19");
    expect(result).toContain("at");
  });

  it("returns '—' for invalid datetimes", () => {
    expect(formatDateTime("nope")).toBe("—");
  });
});

describe("isValidIsoDate", () => {
  it("returns true for valid YYYY-MM-DD strings", () => {
    expect(isValidIsoDate("2026-03-19")).toBe(true);
    expect(isValidIsoDate("2024-01-01")).toBe(true);
  });

  it("returns false for invalid formats", () => {
    expect(isValidIsoDate("03-19-2026")).toBe(false);
    expect(isValidIsoDate("2026/03/19")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
    expect(isValidIsoDate("2026-3-19")).toBe(false);
  });
});
