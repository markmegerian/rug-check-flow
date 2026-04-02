import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("db uniqueness guards", () => {
  it("adds unique indexes for cadence, throttles, and active thread identity", () => {
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260402014000_add_uniqueness_for_threads_and_cadence.sql"), "utf-8");
    expect(migration).toContain("notification_cadence_identity_idx");
    expect(migration).toContain("notification_throttles_identity_idx");
    expect(migration).toContain("message_threads_active_identity_idx");
  });
});
