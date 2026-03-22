import { describe, expect, it } from "vitest";
import { APP_NAME, APP_TAGLINE, DRIVER_TITLE } from "@/lib/branding";

describe("branding constants", () => {
  it("APP_NAME is defined and non-empty", () => {
    expect(APP_NAME).toBeTruthy();
    expect(APP_NAME.length).toBeGreaterThan(0);
  });

  it("APP_TAGLINE is defined", () => {
    expect(APP_TAGLINE).toBeTruthy();
  });

  it("DRIVER_TITLE includes APP_NAME", () => {
    expect(DRIVER_TITLE).toContain(APP_NAME);
    expect(DRIVER_TITLE).toContain("Driver");
  });
});
