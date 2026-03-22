import { describe, expect, it } from "vitest";
import {
  DAYS_OF_WEEK,
  DAY_INDEX,
  PRICING_TIERS,
  TIER_LABELS,
  TIER_COLORS,
  MS_PER_DAY,
} from "@/lib/constants";

describe("DAYS_OF_WEEK", () => {
  it("has exactly 7 days", () => {
    expect(DAYS_OF_WEEK).toHaveLength(7);
  });

  it("starts with Monday and ends with Sunday", () => {
    expect(DAYS_OF_WEEK[0]).toBe("Monday");
    expect(DAYS_OF_WEEK[6]).toBe("Sunday");
  });
});

describe("DAY_INDEX", () => {
  it("maps Sunday to 0 and Saturday to 6", () => {
    expect(DAY_INDEX.Sunday).toBe(0);
    expect(DAY_INDEX.Saturday).toBe(6);
  });

  it("has all 7 days", () => {
    expect(Object.keys(DAY_INDEX)).toHaveLength(7);
  });
});

describe("MS_PER_DAY", () => {
  it("equals 86400000", () => {
    expect(MS_PER_DAY).toBe(86400000);
  });
});

describe("PRICING_TIERS", () => {
  it("has standard, preferred, and vip", () => {
    expect(PRICING_TIERS).toEqual(["standard", "preferred", "vip"]);
  });

  it("each tier has a label", () => {
    for (const tier of PRICING_TIERS) {
      expect(TIER_LABELS[tier]).toBeTruthy();
    }
  });

  it("each tier has a color class", () => {
    for (const tier of PRICING_TIERS) {
      expect(TIER_COLORS[tier]).toBeTruthy();
    }
  });
});
