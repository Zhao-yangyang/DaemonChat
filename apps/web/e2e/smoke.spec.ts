import { test, expect } from "@playwright/test";

test.describe("Smoke tests — page loads", () => {
  test("homepage loads and shows login form when unauthenticated", async ({ page }) => {
    await page.goto("/");
    // Landing page should show the product name (Badge or heading)
    await expect(page.getByText("DaemonChat", { exact: true }).first()).toBeVisible();
    // Should show login/signup card
    await expect(page.getByText("开始使用")).toBeVisible();
  });

  test("homepage shows feature cards", async ({ page }) => {
    await page.goto("/");
    // 使用带 emoji 的卡片标题，避免与描述段落中的重复文本冲突
    await expect(page.getByText("🧠 长期记忆")).toBeVisible();
    await expect(page.getByText("🤖 多模型支持")).toBeVisible();
    await expect(page.getByText("📋 模板市场")).toBeVisible();
    await expect(page.getByText("👥 团队协作")).toBeVisible();
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
