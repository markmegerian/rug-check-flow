import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Accessibility smoke: fails on WCAG 2.1 A/AA critical + serious violations only,
 * so the gate can start tight and expand as the backlog is triaged.
 */
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const FAIL_IMPACTS = new Set(["critical", "serious"]);

async function runAxe(page: import("@playwright/test").Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return violations.filter((v) => FAIL_IMPACTS.has(v.impact ?? ""));
}

test.describe("a11y smoke", () => {
  test("sign-in page has no critical or serious violations", async ({ page }) => {
    await page.goto("/auth");
    const violations = await runAxe(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test("404 page has no critical or serious violations", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");
    const violations = await runAxe(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});
