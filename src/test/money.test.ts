import { describe, expect, it } from "vitest";
import {
  fromCents,
  formatUSD,
  formatUSDFromDollars,
  multiplyCents,
  percentOfCents,
  sumCents,
  toCents,
} from "@/lib/money";

describe("money helpers", () => {
  describe("toCents", () => {
    it("rounds half-up to the nearest cent", () => {
      expect(toCents(10.005)).toBe(1001);
      expect(toCents(9.994)).toBe(999);
      expect(toCents("12.345")).toBe(1235);
    });

    it("handles invalid input defensively", () => {
      expect(toCents(null)).toBe(0);
      expect(toCents(undefined)).toBe(0);
      expect(toCents(NaN)).toBe(0);
      expect(toCents("not-a-number")).toBe(0);
      expect(toCents(Number.POSITIVE_INFINITY)).toBe(0);
    });

    it("handles zero and negatives", () => {
      expect(toCents(0)).toBe(0);
      expect(toCents(-10.5)).toBe(-1050);
    });
  });

  describe("fromCents", () => {
    it("is the inverse of toCents for integer input", () => {
      expect(fromCents(toCents(42.37))).toBeCloseTo(42.37, 6);
    });

    it("truncates fractional cent values", () => {
      expect(fromCents(999.9)).toBe(9.99);
    });
  });

  describe("sumCents", () => {
    it("avoids the classic 0.1 + 0.2 float trap", () => {
      const total = sumCents([toCents(0.1), toCents(0.2)]);
      expect(total).toBe(30);
      expect(fromCents(total)).toBe(0.3);
    });

    it("sums three identical line items exactly", () => {
      const lines = [toCents(0.07), toCents(0.07), toCents(0.07)];
      expect(sumCents(lines)).toBe(21);
      expect(formatUSD(sumCents(lines))).toBe("$0.21");
    });

    it("skips non-finite values rather than throwing", () => {
      expect(sumCents([100, NaN, 50, Number.POSITIVE_INFINITY])).toBe(150);
    });
  });

  describe("multiplyCents", () => {
    it("multiplies a cent unit price by an integer quantity", () => {
      expect(multiplyCents(toCents(9.99), 3)).toBe(2997);
      expect(formatUSD(multiplyCents(toCents(9.99), 3))).toBe("$29.97");
    });
  });

  describe("percentOfCents", () => {
    it("applies a percentage with half-up rounding", () => {
      // 8.875% of $10.00 = $0.8875 -> rounds to $0.89
      expect(percentOfCents(1000, 8.875)).toBe(89);
      expect(formatUSD(percentOfCents(1000, 8.875))).toBe("$0.89");
    });

    it("handles zero percent", () => {
      expect(percentOfCents(1234, 0)).toBe(0);
    });
  });

  describe("formatUSD / formatUSDFromDollars", () => {
    it("renders integer cents as USD", () => {
      expect(formatUSD(0)).toBe("$0.00");
      expect(formatUSD(1)).toBe("$0.01");
      expect(formatUSD(100000)).toBe("$1,000.00");
    });

    it("accepts dollar floats via the legacy helper", () => {
      expect(formatUSDFromDollars(10.5)).toBe("$10.50");
      expect(formatUSDFromDollars("0.1")).toBe("$0.10");
    });
  });
});
