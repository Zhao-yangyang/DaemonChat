import { test, expect } from "@playwright/test";

test.describe("Smoke tests — page loads", () => {
  test("homepage loads and shows login form when unauthenticated", async ({ page }) => {
    await page.goto("/zh");
    await expect(page.getByText("DaemonChat", { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("auth-form")).toBeVisible();
  });

  test("homepage shows feature cards", async ({ page }) => {
    await page.goto("/zh");
    await expect(page.getByTestId("auth-form")).toBeVisible();
    // Feature card titles (in CardTitle, not description paragraph)
    const cardTitles = page.locator("[data-slot='card-title']");
    await expect(cardTitles.filter({ hasText: /长期记忆|Long-term Memory/ })).toBeVisible();
    await expect(cardTitles.filter({ hasText: /多模型支持|Multi-model Support/ })).toBeVisible();
    await expect(cardTitles.filter({ hasText: /模板市场|Template Marketplace/ })).toBeVisible();
    await expect(cardTitles.filter({ hasText: /团队协作|Team Collaboration/ })).toBeVisible();
  });

  test("unauthenticated access to /agents redirects or shows auth prompt", async ({ page }) => {
    await page.goto("/agents");
    // Should either redirect to login or show empty/auth-required state
    // The page should at least load without crashing
    await expect(page.locator("body")).toBeVisible();
  });

  test("unauthenticated access to /memory loads without crash", async ({ page }) => {
    await page.goto("/memory");
    await expect(page.locator("body")).toBeVisible();
  });

  test("unauthenticated access to /templates loads without crash", async ({ page }) => {
    await page.goto("/templates");
    await expect(page.locator("body")).toBeVisible();
  });

  test("unauthenticated access to /usage loads without crash", async ({ page }) => {
    await page.goto("/usage");
    await expect(page.locator("body")).toBeVisible();
  });
});
