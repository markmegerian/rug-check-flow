import { expect, test } from "@playwright/test";

const testEmail = process.env.PLAYWRIGHT_EMAIL;
const testPassword = process.env.PLAYWRIGHT_PASSWORD;

test.describe("public smoke", () => {
  test("loads sign-in page", async ({ page }) => {
    await page.goto("/auth");

    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("redirects protected ops route to auth when signed out", async ({ page }) => {
    await page.goto("/ops");
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });
});

test.describe("authenticated smoke", () => {
  test.skip(!testEmail || !testPassword, "Set PLAYWRIGHT_EMAIL and PLAYWRIGHT_PASSWORD to run authenticated smoke.");

  test("can sign in and reach a protected workspace", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("Email").fill(testEmail ?? "");
    await page.getByLabel("Password").fill(testPassword ?? "");
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveURL(/\/auth$/);
    await expect(page).toHaveURL(/\/(|ops|portal|driver|admin)$/);
  });
});
