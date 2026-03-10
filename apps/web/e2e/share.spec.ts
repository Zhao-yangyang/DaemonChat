import { test, expect } from "@playwright/test";

test.describe("Share page", () => {
  test("invalid agent ID returns 404", async ({ page }) => {
    const res = await page.goto("/zh/share/00000000-0000-0000-0000-000000000000");
    expect(res?.status()).toBe(404);
  });

  test("valid public agent shows name, summary, try and back buttons", async ({ page }) => {
    // Requires E2E_PUBLIC_AGENT_ID to be set and point to a real public agent
    const publicAgentId = process.env.E2E_PUBLIC_AGENT_ID;
    if (!publicAgentId) {
      test.skip();
      return;
    }

    await page.goto(`/zh/share/${publicAgentId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("share-try")).toBeVisible();
    await expect(page.getByTestId("share-back")).toBeVisible();
  });
});
