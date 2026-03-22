import { describe, expect, it } from "vitest";
import {
  canRoleTransitionPickupStatus,
  canRoleTransitionEstimateStatus,
  canTransitionPickupStatus,
  canDriverCompletePickup,
  type PickupRequestStatus,
  type EstimateStatus,
} from "@/lib/workflow-guards";
import { PRODUCTION_STAGES, type ProductionStage } from "@/data/production";
import { isEntryEditable, deriveUserRole, type CheckInEntry } from "@/data/check-in-log";

describe("full rug lifecycle simulation", () => {
  it("simulates a rug from pickup request through delivery", () => {
    // Step 1: Portal user creates a pickup request (status = pending)
    let pickupStatus: PickupRequestStatus = "pending";

    // Step 2: Office confirms the pickup
    expect(canRoleTransitionPickupStatus("office", pickupStatus, "confirmed")).toBe(true);
    pickupStatus = "confirmed";

    // Step 3: Office assigns a driver
    expect(canRoleTransitionPickupStatus("office", pickupStatus, "assigned")).toBe(true);
    pickupStatus = "assigned";

    // Step 4: Driver verifies all items and has signature → can complete
    expect(canDriverCompletePickup({ status: pickupStatus, allVerified: true, hasSignature: true })).toBe(true);
    pickupStatus = "completed";

    // Step 5: Rug enters check-in → production pipeline
    let rugStage: ProductionStage = "checked_in";
    const stageIdx = PRODUCTION_STAGES.findIndex((s) => s.id === rugStage);
    expect(stageIdx).toBe(0);

    // Step 6: Move through production stages
    rugStage = "in_production";
    rugStage = "ready";

    // Step 7: When ready, auto-invoice may be created

    // Step 8: After delivery, rug is picked up
    rugStage = "picked_up";
    expect(PRODUCTION_STAGES.findIndex((s) => s.id === rugStage)).toBe(PRODUCTION_STAGES.length - 1);
  });

  it("simulates estimate flow for a rug needing approval", () => {
    let estimateStatus: EstimateStatus = "draft";

    // Office creates and sends estimate
    expect(canRoleTransitionEstimateStatus("office", estimateStatus, "sent")).toBe(true);
    estimateStatus = "sent";

    // Client approves via portal
    expect(canRoleTransitionEstimateStatus("portal", estimateStatus, "approved")).toBe(true);
    estimateStatus = "approved";

    // No further transitions from approved
    expect(canRoleTransitionEstimateStatus("office", estimateStatus, "sent")).toBe(false);
    expect(canRoleTransitionEstimateStatus("office", estimateStatus, "draft")).toBe(false);
  });

  it("simulates estimate rejection and revision flow", () => {
    let estimateStatus: EstimateStatus = "draft";

    // Send to client
    expect(canRoleTransitionEstimateStatus("office", estimateStatus, "sent")).toBe(true);
    estimateStatus = "sent";

    // Client rejects
    expect(canRoleTransitionEstimateStatus("portal", estimateStatus, "rejected")).toBe(true);
    estimateStatus = "rejected";

    // Office creates a new revision (new estimate, starts at draft)
    estimateStatus = "draft";
    expect(canRoleTransitionEstimateStatus("office", estimateStatus, "sent")).toBe(true);
  });

  it("simulates pickup cancellation by portal user", () => {
    let pickupStatus: PickupRequestStatus = "pending";

    // Portal user can cancel while pending
    expect(canRoleTransitionPickupStatus("portal", pickupStatus, "cancelled")).toBe(true);
    pickupStatus = "cancelled";

    // Terminal state — no further transitions
    expect(canTransitionPickupStatus(pickupStatus, "pending")).toBe(false);
    expect(canTransitionPickupStatus(pickupStatus, "assigned")).toBe(false);
  });

  it("validates check-in editability rules across time", () => {
    const entry: CheckInEntry = {
      id: "test",
      rugNumber: "R-100",
      clientName: "Test",
      rugType: "Persian",
      length: 8,
      width: 10,
      services: [],
      totalPrice: 0,
      checkedInAt: new Date(Date.now() - 30 * 60 * 1000), // 30 min ago
      checkedInBy: "staff",
    };

    // Admin and office can always edit
    expect(isEntryEditable(entry, "admin")).toBe(true);
    expect(isEntryEditable(entry, "office")).toBe(true);

    // Check-in staff can edit within 2 hours
    expect(isEntryEditable(entry, "checkin_staff")).toBe(true);

    // After 2+ hours, check-in staff can't edit
    const oldEntry = { ...entry, checkedInAt: new Date(Date.now() - 3 * 60 * 60 * 1000) };
    expect(isEntryEditable(oldEntry, "checkin_staff")).toBe(false);
    expect(isEntryEditable(oldEntry, "admin")).toBe(true);
  });

  it("validates role derivation from AppRole arrays", () => {
    expect(deriveUserRole(["admin", "office"])).toBe("admin");
    expect(deriveUserRole(["office", "checkin_staff"])).toBe("office");
    expect(deriveUserRole(["driver"])).toBe("checkin_staff");
    expect(deriveUserRole([])).toBe("checkin_staff");
  });
});
