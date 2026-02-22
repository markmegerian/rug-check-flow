import { describe, expect, it } from "vitest";
import {
  canDriverCompletePickup,
  canPortalEditPickup,
  canRoleTransitionEstimateStatus,
  canRoleTransitionPickupStatus,
  normalizePortalPickupStatus,
} from "@/lib/workflow-guards";

describe("workflow guards", () => {
  it("normalizes portal pickup statuses for client UI", () => {
    expect(normalizePortalPickupStatus("pending")).toBe("pending");
    expect(normalizePortalPickupStatus("confirmed")).toBe("confirmed");
    expect(normalizePortalPickupStatus("assigned")).toBe("confirmed");
    expect(normalizePortalPickupStatus("completed")).toBe("confirmed");
  });

  it("allows portal pickup edits only while pending", () => {
    expect(canPortalEditPickup("pending")).toBe(true);
    expect(canPortalEditPickup("confirmed")).toBe(false);
  });

  it("enforces role-based pickup transitions", () => {
    expect(canRoleTransitionPickupStatus("office", "pending", "assigned")).toBe(true);
    expect(canRoleTransitionPickupStatus("office", "completed", "pending")).toBe(false);
    expect(canRoleTransitionPickupStatus("driver", "assigned", "completed")).toBe(true);
    expect(canRoleTransitionPickupStatus("driver", "pending", "completed")).toBe(false);
    expect(canRoleTransitionPickupStatus("portal", "pending", "cancelled")).toBe(true);
    expect(canRoleTransitionPickupStatus("portal", "confirmed", "cancelled")).toBe(false);
  });

  it("requires signature and verification before driver completion", () => {
    expect(
      canDriverCompletePickup({
        status: "assigned",
        allVerified: true,
        hasSignature: true,
      })
    ).toBe(true);
    expect(
      canDriverCompletePickup({
        status: "assigned",
        allVerified: false,
        hasSignature: true,
      })
    ).toBe(false);
    expect(
      canDriverCompletePickup({
        status: "completed",
        allVerified: true,
        hasSignature: true,
      })
    ).toBe(false);
  });

  it("enforces role-based estimate transitions", () => {
    expect(canRoleTransitionEstimateStatus("office", "draft", "sent")).toBe(true);
    expect(canRoleTransitionEstimateStatus("office", "sent", "approved")).toBe(true);
    expect(canRoleTransitionEstimateStatus("portal", "sent", "approved")).toBe(true);
    expect(canRoleTransitionEstimateStatus("portal", "sent", "expired")).toBe(false);
    expect(canRoleTransitionEstimateStatus("portal", "draft", "approved")).toBe(false);
    expect(canRoleTransitionEstimateStatus("checkin_staff", "sent", "approved")).toBe(false);
  });
});
