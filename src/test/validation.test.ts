import { describe, expect, it } from "vitest";
import {
  isValidRugNumber,
  findDuplicateRugNumber,
  isValidEmail,
  normalizeEmail,
  sanitizeCsvCell,
  parseCsvRows,
} from "@/lib/validation";

describe("isValidRugNumber", () => {
  it("returns true for non-empty strings", () => {
    expect(isValidRugNumber("1234")).toBe(true);
    expect(isValidRugNumber("R-001")).toBe(true);
  });

  it("returns false for empty or whitespace-only strings", () => {
    expect(isValidRugNumber("")).toBe(false);
    expect(isValidRugNumber("   ")).toBe(false);
  });
});

describe("findDuplicateRugNumber", () => {
  it("returns null when no duplicates exist", () => {
    expect(findDuplicateRugNumber(["1", "2", "3"])).toBeNull();
  });

  it("returns the first duplicate found", () => {
    expect(findDuplicateRugNumber(["1", "2", "1"])).toBe("1");
    expect(findDuplicateRugNumber(["5", "3", "3"])).toBe("3");
  });

  it("ignores empty strings", () => {
    expect(findDuplicateRugNumber(["", "", "1"])).toBeNull();
  });

  it("trims values before comparing", () => {
    expect(findDuplicateRugNumber(["1 ", " 1"])).toBe("1");
  });
});

describe("isValidEmail", () => {
  it("returns true for valid email formats", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("test+tag@domain.org")).toBe(true);
  });

  it("returns false for invalid email formats", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("notanemail")).toBe(false);
    expect(isValidEmail("@domain.com")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims email", () => {
    expect(normalizeEmail("  User@EXAMPLE.com  ")).toBe("user@example.com");
  });
});

describe("sanitizeCsvCell", () => {
  it("trims whitespace", () => {
    expect(sanitizeCsvCell("  hello  ")).toBe("hello");
  });

  it("strips formula injection characters", () => {
    expect(sanitizeCsvCell("=cmd()")).toBe("cmd()");
    expect(sanitizeCsvCell("+1234")).toBe("1234");
    expect(sanitizeCsvCell("-alert()")).toBe("alert()");
    expect(sanitizeCsvCell("@import")).toBe("import");
  });

  it("preserves normal values", () => {
    expect(sanitizeCsvCell("John Doe")).toBe("John Doe");
    expect(sanitizeCsvCell("123 Main St")).toBe("123 Main St");
  });
});

describe("parseCsvRows", () => {
  it("parses basic CSV data", () => {
    const csv = "name,email\nJohn,john@test.com\nJane,jane@test.com";
    const rows = parseCsvRows(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual(["name", "email"]);
    expect(rows[1]).toEqual(["John", "john@test.com"]);
    expect(rows[2]).toEqual(["Jane", "jane@test.com"]);
  });

  it("handles quoted fields with commas", () => {
    const csv = 'name,address\nJohn,"123 Main St, Suite 100"';
    const rows = parseCsvRows(csv);
    expect(rows[1][1]).toBe("123 Main St, Suite 100");
  });

  it("handles escaped quotes in quoted fields", () => {
    const csv = 'name,note\nJohn,"He said ""hello"""';
    const rows = parseCsvRows(csv);
    expect(rows[1][1]).toBe('He said "hello"');
  });

  it("handles CRLF line endings", () => {
    const csv = "a,b\r\nc,d\r\n";
    const rows = parseCsvRows(csv);
    expect(rows).toHaveLength(2);
  });

  it("skips empty rows", () => {
    const csv = "a,b\n\nc,d";
    const rows = parseCsvRows(csv);
    expect(rows).toHaveLength(2);
  });

  it("handles single column CSV", () => {
    const csv = "name\nAlice\nBob";
    const rows = parseCsvRows(csv);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(["Alice"]);
  });

  it("sanitizes cells with formula injection", () => {
    const csv = "name,value\n=cmd(),normal";
    const rows = parseCsvRows(csv);
    expect(rows[1][0]).toBe("cmd()");
    expect(rows[1][1]).toBe("normal");
  });

  it("strips UTF-8 BOM from Excel exports", () => {
    const csv = "\uFEFFname,email\nAlice,alice@test.com";
    const rows = parseCsvRows(csv);
    expect(rows[0][0]).toBe("name");
    expect(rows[1][0]).toBe("Alice");
  });

  it("handles empty string input", () => {
    expect(parseCsvRows("")).toHaveLength(0);
  });
});
