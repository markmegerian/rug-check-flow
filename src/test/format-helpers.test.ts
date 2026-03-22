import { describe, expect, it } from "vitest";
import { numericOnly, formatCurrency, capitalize, pluralize } from "@/lib/format-helpers";

describe("numericOnly", () => {
  it("strips non-numeric characters", () => {
    expect(numericOnly("abc123def")).toBe("123");
    expect(numericOnly("R-4510")).toBe("4510");
    expect(numericOnly("$1,234.56")).toBe("123456");
  });

  it("returns empty string for no digits", () => {
    expect(numericOnly("abc")).toBe("");
  });

  it("passes through pure numbers", () => {
    expect(numericOnly("12345")).toBe("12345");
  });
});

describe("formatCurrency", () => {
  it("formats positive numbers as USD", () => {
    expect(formatCurrency(0)).toBe("$0.00");
    expect(formatCurrency(1234.5)).toBe("$1234.50");
    expect(formatCurrency(99.999)).toBe("$100.00");
  });

  it("formats negative numbers with minus before dollar sign", () => {
    expect(formatCurrency(-5)).toBe("-$5.00");
    expect(formatCurrency(-1234.56)).toBe("-$1234.56");
  });

  it("handles NaN and Infinity gracefully", () => {
    expect(formatCurrency(NaN)).toBe("$0.00");
    expect(formatCurrency(Infinity)).toBe("$0.00");
    expect(formatCurrency(-Infinity)).toBe("$0.00");
  });
});

describe("capitalize", () => {
  it("capitalizes the first letter", () => {
    expect(capitalize("pending")).toBe("Pending");
    expect(capitalize("hello world")).toBe("Hello world");
  });

  it("handles empty string", () => {
    expect(capitalize("")).toBe("");
  });

  it("handles already capitalized strings", () => {
    expect(capitalize("Already")).toBe("Already");
  });
});

describe("pluralize", () => {
  it("returns singular for count 1", () => {
    expect(pluralize(1, "rug")).toBe("rug");
    expect(pluralize(1, "item")).toBe("item");
  });

  it("returns plural for count != 1", () => {
    expect(pluralize(0, "rug")).toBe("rugs");
    expect(pluralize(2, "rug")).toBe("rugs");
    expect(pluralize(100, "client")).toBe("clients");
  });

  it("uses custom plural form", () => {
    expect(pluralize(2, "person", "people")).toBe("people");
  });
});
