import { describe, expect, it } from "vitest";
import { isMissingRelationError } from "@/lib/supabase-helpers";

describe("isMissingRelationError", () => {
  it("returns true for PGRST205 error code", () => {
    expect(isMissingRelationError({ code: "PGRST205", message: "some error" })).toBe(true);
  });

  it("returns true for 42P01 error code (table does not exist)", () => {
    expect(isMissingRelationError({ code: "42P01", message: "relation does not exist" })).toBe(true);
  });

  it("returns true for message containing 'could not find the table'", () => {
    expect(isMissingRelationError({ message: "Could not find the table or view" })).toBe(true);
  });

  it("returns false for normal errors", () => {
    expect(isMissingRelationError({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingRelationError({ message: "connection refused" })).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isMissingRelationError(null)).toBe(false);
    expect(isMissingRelationError(undefined)).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(isMissingRelationError("string error")).toBe(false);
    expect(isMissingRelationError(42)).toBe(false);
  });
});
