import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("production board snapshot queue", () => {
  it("limits the backend snapshot to approved non-cleaning rugs still in production", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260427143000_refine_production_board_snapshot_queue.sql"),
      "utf-8",
    );

    expect(migration).toContain("coalesce(lower(trim(rs.service_category)), '') <> 'cleaning'");
    expect(migration).toContain("coalesce(rs.approval_status, 'pending') = 'approved'");
    expect(migration).toContain("where r.status in ('checked_in', 'in_production')");
    expect(migration).toContain("join rug_service_rollup rsr on rsr.rug_id = r.id");
  });
});
