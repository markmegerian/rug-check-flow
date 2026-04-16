import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("check-in frontend cutover", () => {
  it("routes submit flow through the check-in-workflow edge function with a reusable idempotency key", () => {
    const layout = readFileSync(resolve(process.cwd(), "src/components/facility/CheckInLayout.tsx"), "utf-8");
    expect(layout).toContain('safeInvoke<CheckInWorkflowResponse>("check-in-workflow"');
    expect(layout).toContain('uploadCheckinPhotoFile');
    expect(layout).toContain('checkInIdempotencyKeyRef');
    expect(layout).toContain('"x-idempotency-key": idempotencyKey');
    expect(layout).not.toContain('advanceRugStage(');
    expect(layout).not.toContain('maybeAutoCreateEstimateDraft(');
  });
});
