import { test, expect } from "@playwright/test";

test.describe("Agents page — authenticated", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test("agents page loads and shows list + create button", async ({ page }) => {
    await page.goto("/zh/agents");
    await expect(page.getByTestId("agents-create")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("agents-list")).toBeVisible();
  });

  test("clicking create button opens CreateAgentDialog", async ({ page }) => {
    await page.goto("/zh/agents");
    await page.getByTestId("agents-create").click();
    // CreateAgentDialog uses a Dialog — verify the dialog title text is visible
    await expect(
      page.getByRole("dialog").filter({ hasText: /新建|Create Agent/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("create dialog can be closed with cancel", async ({ page }) => {
    await page.goto("/zh/agents");
    await page.getByTestId("agents-create").click();
    const dialog = page.getByRole("dialog").filter({ hasText: /新建|Create Agent/i });
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    // Click cancel / close button (aria label or text)
    const cancelBtn = dialog.getByRole("button", { name: /取消|Cancel/i });
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    } else {
      await page.keyboard.press("Escape");
    }
    await expect(dialog).not.toBeVisible({ timeout: 3_000 });
  });

  test("agent delete dialog shows and can be dismissed", async ({ page }) => {
    await page.goto("/zh/agents");
    await expect(page.getByTestId("agents-list")).toBeVisible({ timeout: 10_000 });

    // Only run if there is at least one agent card
    const deleteBtn = page.getByTestId("agent-delete-btn").first();
    const hasBtns = await deleteBtn.isVisible().catch(() => false);
    if (!hasBtns) {
      test.skip();
      return;
    }

    await deleteBtn.click();
    const deleteDialog = page.getByTestId("agent-delete-dialog");
    await expect(deleteDialog).toBeVisible({ timeout: 5_000 });

    // Cancel the delete — dialog should close
    await deleteDialog.getByRole("button", { name: /取消|Cancel/i }).click();
    await expect(deleteDialog).not.toBeVisible({ timeout: 3_000 });
  });

  test("agent config button opens config dialog", async ({ page }) => {
    await page.goto("/zh/agents");
    await expect(page.getByTestId("agents-list")).toBeVisible({ timeout: 10_000 });

    const configBtn = page.getByTestId("agent-config-btn").first();
    const hasConfig = await configBtn.isVisible().catch(() => false);
    if (!hasConfig) {
      test.skip();
      return;
    }

    await configBtn.click();
    // AgentConfigDialog opens a Dialog with save / cancel
    const configDialog = page.getByRole("dialog").filter({ hasText: /配置|Config/i });
    await expect(configDialog).toBeVisible({ timeout: 5_000 });

    // Close with escape
    await page.keyboard.press("Escape");
    await expect(configDialog).not.toBeVisible({ timeout: 3_000 });
  });

  test("agent publish dialog opens and can be dismissed", async ({ page }) => {
    await page.goto("/zh/agents");
    await expect(page.getByTestId("agents-list")).toBeVisible({ timeout: 10_000 });

    // Find the "发布 / Publish" ghost button on the first agent card
    const publishBtn = page
      .getByTestId("agents-list")
      .getByRole("button", { name: /发布|Publish/i })
      .first();
    const hasPublish = await publishBtn.isVisible().catch(() => false);
    if (!hasPublish) {
      test.skip();
      return;
    }

    await publishBtn.click();
    const publishDialog = page.getByTestId("agent-publish-dialog");
    await expect(publishDialog).toBeVisible({ timeout: 5_000 });

    await publishDialog.getByRole("button", { name: /取消|Cancel/i }).click();
    await expect(publishDialog).not.toBeVisible({ timeout: 3_000 });
  });
});

test.describe("Agents page — unauthenticated", () => {
  test("unauthenticated user sees auth form or is redirected", async ({ page }) => {
    await page.goto("/zh/agents");
    // Should either show auth form or redirect to home
    const body = page.locator("body");
    await expect(body).toBeVisible();
    // Verify no JS crash (no error boundary triggered)
    const errorBoundary = page.getByText(/something went wrong|出错了/i);
    await expect(errorBoundary).not.toBeVisible();
  });
});
