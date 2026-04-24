import { describe, expect, it } from "vitest";
import { extractInvokeErrorMessage, isMissingRelationError } from "@/lib/supabase-helpers";

describe("extractInvokeErrorMessage", () => {
  it("prefers JSON edge-function error payloads", async () => {
    const error = {
      message: "Edge Function returned a non-2xx status code",
      context: new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    };

    await expect(extractInvokeErrorMessage(error)).resolves.toBe("Client not found");
  });

  it("falls back to text response payloads", async () => {
    const error = {
      message: "Edge Function returned a non-2xx status code",
      context: new Response("Forbidden pickup item link", {
        status: 403,
        headers: { "Content-Type": "text/plain" },
      }),
    };

    await expect(extractInvokeErrorMessage(error)).resolves.toBe("Forbidden pickup item link");
  });

  it("falls back to the generic error message when no response body exists", async () => {
    await expect(extractInvokeErrorMessage({ message: "Network request failed" })).resolves.toBe("Network request failed");
  });
});

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
