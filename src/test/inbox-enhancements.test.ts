import { describe, expect, it } from "vitest";
import { getMessageVisibility, isInternalMessage } from "@/lib/message-metadata";

describe("inbox enhancements helpers", () => {
  it("treats absent metadata as shared", () => {
    expect(getMessageVisibility(undefined)).toBe("shared");
  });

  it("detects internal notes from metadata attachments", () => {
    const attachments = [{ kind: "meta", visibility: "internal" }];
    expect(isInternalMessage(attachments)).toBe(true);
  });
});
