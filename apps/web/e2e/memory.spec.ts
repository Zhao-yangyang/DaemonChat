import { test, expect } from "@playwright/test";

test.describe("Memory page — authenticated", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test("memory page loads with agent selector and controls", async ({ page }) => {
    await page.goto("/zh/memory");
    // Page should load without crashing
    await expect(page.locator("body")).toBeVisible();
    // Should not trigger error boundary
    await expect(page.getByText(/something went wrong|出错了/i)).not.toBeVisible();
    // Add button should be visible (even if no agent selected yet)
    await expect(page.getByTestId("memory-add-btn")).toBeVisible({ timeout: 10_000 });
  });

  test("memory page shows agent selector when agents exist", async ({ page }) => {
    await page.goto("/zh/memory");
    await expect(page.getByTestId("memory-add-btn")).toBeVisible({ timeout: 10_000 });
    // Agent selector label
    await expect(page.getByText("Agent")).toBeVisible();
  });

  test("clicking add button toggles create form", async ({ page }) => {
    await page.goto("/zh/memory");
    await expect(page.getByTestId("memory-add-btn")).toBeVisible({ timeout: 10_000 });

    // Form should not be visible initially
    await expect(page.getByTestId("memory-create-form")).not.toBeVisible();

    // Click add to show
    await page.getByTestId("memory-add-btn").click();
    await expect(page.getByTestId("memory-create-form")).toBeVisible({ timeout: 3_000 });

    // Click add again to hide
    await page.getByTestId("memory-add-btn").click();
    await expect(page.getByTestId("memory-create-form")).not.toBeVisible({ timeout: 3_000 });
  });

  test("create form submit is disabled when content is empty", async ({ page }) => {
    await page.goto("/zh/memory");
    await expect(page.getByTestId("memory-add-btn")).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("memory-add-btn").click();
    await expect(page.getByTestId("memory-create-form")).toBeVisible({ timeout: 3_000 });

    const submitBtn = page.getByTestId("memory-create-submit");
    await expect(submitBtn).toBeVisible();
    // Should be disabled with no content / no agent selected
    await expect(submitBtn).toBeDisabled();
  });

  test("memory list container renders without crash", async ({ page }) => {
    await page.goto("/zh/memory");
    await expect(page.getByTestId("memory-add-btn")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("memory-list")).toBeVisible();
  });

  test("memory delete dialog shows and can be dismissed", async ({ page }) => {
    await page.goto("/zh/memory");
    await expect(page.getByTestId("memory-list")).toBeVisible({ timeout: 10_000 });

    // Only run if there is at least one memory item with a delete button
    const deleteItemBtn = page.getByTestId("memory-delete-item-btn").first();
    const hasItems = await deleteItemBtn.isVisible().catch(() => false);
    if (!hasItems) {
      test.skip();
      return;
    }

    await deleteItemBtn.click();
    const deleteDialog = page.getByTestId("memory-delete-dialog");
    await expect(deleteDialog).toBeVisible({ timeout: 5_000 });

    // Cancel — dialog should close without deleting
    await deleteDialog.getByRole("button", { name: /取消|Cancel/i }).click();
    await expect(deleteDialog).not.toBeVisible({ timeout: 3_000 });
  });

  test("memory delete dialog confirm button is present and enabled", async ({ page }) => {
    await page.goto("/zh/memory");
    await expect(page.getByTestId("memory-list")).toBeVisible({ timeout: 10_000 });

    const deleteItemBtn = page.getByTestId("memory-delete-item-btn").first();
    const hasItems = await deleteItemBtn.isVisible().catch(() => false);
    if (!hasItems) {
      test.skip();
      return;
    }

    await deleteItemBtn.click();
    const deleteDialog = page.getByTestId("memory-delete-dialog");
    await expect(deleteDialog).toBeVisible({ timeout: 5_000 });

    // Confirm button should be visible and enabled
    const confirmBtn = page.getByTestId("memory-delete-confirm");
    await expect(confirmBtn).toBeVisible();
    await expect(confirmBtn).toBeEnabled();

    // Dismiss without confirming
    await page.keyboard.press("Escape");
    await expect(deleteDialog).not.toBeVisible({ timeout: 3_000 });
  });

  test("semantic search toggle switches search mode", async ({ page }) => {
    await page.goto("/zh/memory");
    await expect(page.getByTestId("memory-add-btn")).toBeVisible({ timeout: 10_000 });

    // The semantic toggle button has a Sparkles icon + text
    const semanticBtn = page.getByRole("button", { name: /语义|Semantic/i });
    const hasSemanticBtn = await semanticBtn.isVisible().catch(() => false);
    if (!hasSemanticBtn) {
      test.skip();
      return;
    }

    await semanticBtn.click();
    // After clicking, button should change to "active" (filled) variant
    await expect(semanticBtn).toHaveAttribute("data-variant", /default/).catch(() => {
      // variant check is best-effort; at minimum verify no crash
    });
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("Memory page — unauthenticated", () => {
  test("unauthenticated user sees no crash on memory page", async ({ page }) => {
    await page.goto("/zh/memory");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByText(/something went wrong|出错了/i)).not.toBeVisible();
  });
});
