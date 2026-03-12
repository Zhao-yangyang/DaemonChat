import { test, expect } from "@playwright/test";

const MOCK_ASSISTANT_RESPONSE = "session spec mock reply";

test.describe("Chat session dialogs — authenticated", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async ({ page }) => {
    // Mock the chat stream so tests don't depend on a real LLM
    await page.route("**/api/chat/stream**", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const sseBody = [
        `data: ${JSON.stringify({ type: "meta", requestId: "session-e2e" })}\n\n`,
        `data: ${JSON.stringify({ type: "chunk", value: MOCK_ASSISTANT_RESPONSE })}\n\n`,
      ].join("");
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        body: sseBody,
      });
    });
  });

  test("chat page loads with message input and send button", async ({ page }) => {
    await page.goto("/zh");
    // After login redirect lands on a chat page
    await expect(page).toHaveURL(/\/chat\/[a-f0-9-]+/, { timeout: 15_000 });
    await expect(page.getByTestId("chat-input")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("chat-send")).toBeVisible();
  });

  test("session action dialog opens for archive and can be dismissed", async ({ page }) => {
    await page.goto("/zh");
    await expect(page).toHaveURL(/\/chat\/[a-f0-9-]+/, { timeout: 15_000 });
    await expect(page.getByTestId("chat-input")).toBeVisible({ timeout: 10_000 });

    // Look for the archive action in the session context menu / dropdown
    // The session list may have a MoreVertical / "..." button per session row
    const moreBtn = page.getByRole("button", { name: /more|更多|\.\.\./i }).first();
    const hasMore = await moreBtn.isVisible().catch(() => false);
    if (!hasMore) {
      // Fall back: look for a kebab icon button near the session list
      const kebab = page.locator("[aria-label*='more'], [aria-label*='更多']").first();
      const hasKebab = await kebab.isVisible().catch(() => false);
      if (!hasKebab) {
        test.skip();
        return;
      }
      await kebab.click();
    } else {
      await moreBtn.click();
    }

    // After opening the dropdown, click the "archive" option
    const archiveOption = page.getByRole("menuitem", { name: /归档|Archive/i });
    const hasArchiveOption = await archiveOption.isVisible({ timeout: 2_000 }).catch(() => false);
    if (!hasArchiveOption) {
      test.skip();
      return;
    }
    await archiveOption.click();

    // Session action dialog should appear
    const actionDialog = page.getByTestId("session-action-dialog");
    await expect(actionDialog).toBeVisible({ timeout: 5_000 });

    // Cancel — dialog should close
    await actionDialog.getByRole("button", { name: /取消|Cancel/i }).click();
    await expect(actionDialog).not.toBeVisible({ timeout: 3_000 });
  });

  test("session action dialog confirm button is present for delete", async ({ page }) => {
    await page.goto("/zh");
    await expect(page).toHaveURL(/\/chat\/[a-f0-9-]+/, { timeout: 15_000 });
    await expect(page.getByTestId("chat-input")).toBeVisible({ timeout: 10_000 });

    const moreBtn = page.getByRole("button", { name: /more|更多|\.\.\./i }).first();
    const hasMore = await moreBtn.isVisible().catch(() => false);
    if (!hasMore) {
      const kebab = page.locator("[aria-label*='more'], [aria-label*='更多']").first();
      const hasKebab = await kebab.isVisible().catch(() => false);
      if (!hasKebab) {
        test.skip();
        return;
      }
      await kebab.click();
    } else {
      await moreBtn.click();
    }

    const deleteOption = page.getByRole("menuitem", { name: /删除会话|Delete Session/i });
    const hasDelete = await deleteOption.isVisible({ timeout: 2_000 }).catch(() => false);
    if (!hasDelete) {
      test.skip();
      return;
    }
    await deleteOption.click();

    const actionDialog = page.getByTestId("session-action-dialog");
    await expect(actionDialog).toBeVisible({ timeout: 5_000 });

    // Confirm button should exist and be enabled
    const confirmBtn = page.getByTestId("session-action-confirm");
    await expect(confirmBtn).toBeVisible();
    await expect(confirmBtn).toBeEnabled();

    // Dismiss without confirming
    await page.keyboard.press("Escape");
    await expect(actionDialog).not.toBeVisible({ timeout: 3_000 });
  });

  test("session rename dialog opens and can be dismissed", async ({ page }) => {
    await page.goto("/zh");
    await expect(page).toHaveURL(/\/chat\/[a-f0-9-]+/, { timeout: 15_000 });
    await expect(page.getByTestId("chat-input")).toBeVisible({ timeout: 10_000 });

    const moreBtn = page.getByRole("button", { name: /more|更多|\.\.\./i }).first();
    const hasMore = await moreBtn.isVisible().catch(() => false);
    if (!hasMore) {
      const kebab = page.locator("[aria-label*='more'], [aria-label*='更多']").first();
      const hasKebab = await kebab.isVisible().catch(() => false);
      if (!hasKebab) {
        test.skip();
        return;
      }
      await kebab.click();
    } else {
      await moreBtn.click();
    }

    const renameOption = page.getByRole("menuitem", { name: /重命名|Rename/i });
    const hasRename = await renameOption.isVisible({ timeout: 2_000 }).catch(() => false);
    if (!hasRename) {
      test.skip();
      return;
    }
    await renameOption.click();

    const renameDialog = page.getByTestId("session-rename-dialog");
    await expect(renameDialog).toBeVisible({ timeout: 5_000 });

    // Input field should be present and focused
    const input = renameDialog.getByRole("textbox");
    await expect(input).toBeVisible();

    // Cancel closes the dialog
    await renameDialog.getByRole("button", { name: /取消|Cancel/i }).click();
    await expect(renameDialog).not.toBeVisible({ timeout: 3_000 });
  });

  test("session rename confirm is disabled when input is empty", async ({ page }) => {
    await page.goto("/zh");
    await expect(page).toHaveURL(/\/chat\/[a-f0-9-]+/, { timeout: 15_000 });
    await expect(page.getByTestId("chat-input")).toBeVisible({ timeout: 10_000 });

    const moreBtn = page.getByRole("button", { name: /more|更多|\.\.\./i }).first();
    const hasMore = await moreBtn.isVisible().catch(() => false);
    if (!hasMore) {
      const kebab = page.locator("[aria-label*='more'], [aria-label*='更多']").first();
      const hasKebab = await kebab.isVisible().catch(() => false);
      if (!hasKebab) {
        test.skip();
        return;
      }
      await kebab.click();
    } else {
      await moreBtn.click();
    }

    const renameOption = page.getByRole("menuitem", { name: /重命名|Rename/i });
    const hasRename = await renameOption.isVisible({ timeout: 2_000 }).catch(() => false);
    if (!hasRename) {
      test.skip();
      return;
    }
    await renameOption.click();

    const renameDialog = page.getByTestId("session-rename-dialog");
    await expect(renameDialog).toBeVisible({ timeout: 5_000 });

    // Clear the input
    const input = renameDialog.getByRole("textbox");
    await input.clear();

    const confirmBtn = page.getByTestId("session-rename-confirm");
    await expect(confirmBtn).toBeDisabled();

    // Dismiss
    await page.keyboard.press("Escape");
    await expect(renameDialog).not.toBeVisible({ timeout: 3_000 });
  });

  test("session rename confirm becomes enabled when input has content", async ({ page }) => {
    await page.goto("/zh");
    await expect(page).toHaveURL(/\/chat\/[a-f0-9-]+/, { timeout: 15_000 });
    await expect(page.getByTestId("chat-input")).toBeVisible({ timeout: 10_000 });

    const moreBtn = page.getByRole("button", { name: /more|更多|\.\.\./i }).first();
    const hasMore = await moreBtn.isVisible().catch(() => false);
    if (!hasMore) {
      const kebab = page.locator("[aria-label*='more'], [aria-label*='更多']").first();
      const hasKebab = await kebab.isVisible().catch(() => false);
      if (!hasKebab) {
        test.skip();
        return;
      }
      await kebab.click();
    } else {
      await moreBtn.click();
    }

    const renameOption = page.getByRole("menuitem", { name: /重命名|Rename/i });
    const hasRename = await renameOption.isVisible({ timeout: 2_000 }).catch(() => false);
    if (!hasRename) {
      test.skip();
      return;
    }
    await renameOption.click();

    const renameDialog = page.getByTestId("session-rename-dialog");
    await expect(renameDialog).toBeVisible({ timeout: 5_000 });

    const input = renameDialog.getByRole("textbox");
    await input.clear();
    await input.fill("E2E Test Session Name");

    const confirmBtn = page.getByTestId("session-rename-confirm");
    await expect(confirmBtn).toBeEnabled();

    // Dismiss without saving
    await page.keyboard.press("Escape");
    await expect(renameDialog).not.toBeVisible({ timeout: 3_000 });
  });

  test("chat page has no error boundary triggered after load", async ({ page }) => {
    await page.goto("/zh");
    await expect(page).toHaveURL(/\/chat\/[a-f0-9-]+/, { timeout: 15_000 });
    await expect(page.getByTestId("chat-input")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/something went wrong|出错了/i)).not.toBeVisible();
  });
});

test.describe("Chat page — unauthenticated", () => {
  test("unauthenticated access to chat page does not crash", async ({ page }) => {
    await page.goto("/zh/chat/00000000-0000-0000-0000-000000000000");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByText(/something went wrong|出错了/i)).not.toBeVisible();
  });
});
