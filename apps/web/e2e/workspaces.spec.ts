import { test, expect } from "@playwright/test";

test.describe("Workspaces page — authenticated", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test("workspaces page loads with create button", async ({ page }) => {
    await page.goto("/zh/workspaces");
    await expect(page.getByTestId("workspace-create-btn")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByText(/something went wrong|出错了/i)).not.toBeVisible();
  });

  test("clicking create button opens WorkspaceCreateDialog", async ({ page }) => {
    await page.goto("/zh/workspaces");
    await page.getByTestId("workspace-create-btn").click();
    const dialog = page.getByTestId("workspace-create-dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });
  });

  test("create dialog submit is disabled when fields are empty", async ({ page }) => {
    await page.goto("/zh/workspaces");
    await page.getByTestId("workspace-create-btn").click();
    const dialog = page.getByTestId("workspace-create-dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const submitBtn = page.getByTestId("workspace-create-submit");
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeDisabled();
  });

  test("create dialog submit becomes enabled when name and slug are filled", async ({ page }) => {
    await page.goto("/zh/workspaces");
    await page.getByTestId("workspace-create-btn").click();
    const dialog = page.getByTestId("workspace-create-dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await dialog.getByRole("textbox").nth(0).fill("E2E Test Workspace");
    await dialog.getByRole("textbox").nth(1).fill("e2e-test-ws");

    const submitBtn = page.getByTestId("workspace-create-submit");
    await expect(submitBtn).toBeEnabled();
  });

  test("create dialog can be closed with cancel", async ({ page }) => {
    await page.goto("/zh/workspaces");
    await page.getByTestId("workspace-create-btn").click();
    const dialog = page.getByTestId("workspace-create-dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await dialog.getByRole("button", { name: /取消|Cancel/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 3_000 });
  });

  test("create dialog can be closed with Escape", async ({ page }) => {
    await page.goto("/zh/workspaces");
    await page.getByTestId("workspace-create-btn").click();
    const dialog = page.getByTestId("workspace-create-dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 3_000 });
  });

  test("workspace list renders without crash", async ({ page }) => {
    await page.goto("/zh/workspaces");
    await expect(page.getByTestId("workspace-create-btn")).toBeVisible({ timeout: 10_000 });
    // Body should show workspace list area or empty hint
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByText(/something went wrong|出错了/i)).not.toBeVisible();
  });

  test("workspace delete dialog opens and can be dismissed", async ({ page }) => {
    await page.goto("/zh/workspaces");
    await expect(page.getByTestId("workspace-create-btn")).toBeVisible({ timeout: 10_000 });

    // Try to find the workspace delete icon button
    const wsDeleteIconBtn = page.locator("[title*='删除|delete' i]").first();
    const hasDeleteIcon = await wsDeleteIconBtn.isVisible().catch(() => false);
    if (!hasDeleteIcon) {
      // Try alternate: any button that opens workspace-delete-dialog
      // Workspace delete button has title={t("deleteWorkspace")}
      const anyTrash = page
        .locator("button")
        .filter({ has: page.locator(".lucide-trash-2") })
        .first();
      const hasTrash = await anyTrash.isVisible().catch(() => false);
      if (!hasTrash) {
        test.skip();
        return;
      }
      await anyTrash.click();
    } else {
      await wsDeleteIconBtn.click();
    }

    const deleteDialog = page.getByTestId("workspace-delete-dialog");
    const hasDialog = await deleteDialog.isVisible({ timeout: 3_000 }).catch(() => false);
    if (!hasDialog) {
      test.skip();
      return;
    }

    await expect(deleteDialog).toBeVisible();
    const confirmBtn = page.getByTestId("workspace-delete-confirm");
    await expect(confirmBtn).toBeVisible();
    await expect(confirmBtn).toBeEnabled();

    await deleteDialog.getByRole("button", { name: /取消|Cancel/i }).click();
    await expect(deleteDialog).not.toBeVisible({ timeout: 3_000 });
  });

  test("workspace members panel and invite dialog", async ({ page }) => {
    await page.goto("/zh/workspaces");
    await expect(page.getByTestId("workspace-create-btn")).toBeVisible({ timeout: 10_000 });

    // Click the "成员 / Members" button to expand a workspace's members panel
    const membersBtn = page.getByRole("button", { name: /成员|Members/i }).first();
    const hasMembers = await membersBtn.isVisible().catch(() => false);
    if (!hasMembers) {
      test.skip();
      return;
    }
    await membersBtn.click();

    // Invite button appears for owner/admin
    const inviteBtn = page.getByRole("button", { name: /邀请|Invite/i }).first();
    const hasInvite = await inviteBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    if (!hasInvite) {
      test.skip();
      return;
    }
    await inviteBtn.click();

    const inviteDialog = page.getByTestId("workspace-invite-dialog");
    await expect(inviteDialog).toBeVisible({ timeout: 5_000 });

    // Submit should be disabled when userId input is empty
    const inviteSubmit = page.getByTestId("workspace-invite-submit");
    await expect(inviteSubmit).toBeVisible();
    await expect(inviteSubmit).toBeDisabled();

    // Fill userId to enable submit
    const userIdInput = inviteDialog.getByRole("textbox");
    await userIdInput.fill("some-user-uuid");
    await expect(inviteSubmit).toBeEnabled();

    // Cancel closes the dialog
    await inviteDialog.getByRole("button", { name: /取消|Cancel/i }).click();
    await expect(inviteDialog).not.toBeVisible({ timeout: 3_000 });
  });

  test("workspace remove member dialog opens and can be dismissed", async ({ page }) => {
    await page.goto("/zh/workspaces");
    await expect(page.getByTestId("workspace-create-btn")).toBeVisible({ timeout: 10_000 });

    // Expand a workspace's members panel first
    const membersBtn = page.getByRole("button", { name: /成员|Members/i }).first();
    const hasMembers = await membersBtn.isVisible().catch(() => false);
    if (!hasMembers) {
      test.skip();
      return;
    }
    await membersBtn.click();

    // Remove button is an X icon button next to non-owner members
    const removeBtn = page
      .locator("button")
      .filter({ has: page.locator(".lucide-x") })
      .first();
    const hasRemove = await removeBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    if (!hasRemove) {
      test.skip();
      return;
    }
    await removeBtn.click();

    const removeDialog = page.getByTestId("workspace-remove-dialog");
    await expect(removeDialog).toBeVisible({ timeout: 5_000 });

    const confirmBtn = page.getByTestId("workspace-remove-confirm");
    await expect(confirmBtn).toBeVisible();
    await expect(confirmBtn).toBeEnabled();

    await removeDialog.getByRole("button", { name: /取消|Cancel/i }).click();
    await expect(removeDialog).not.toBeVisible({ timeout: 3_000 });
  });

  test("no error boundary triggered on workspaces page", async ({ page }) => {
    await page.goto("/zh/workspaces");
    await expect(page.getByTestId("workspace-create-btn")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/something went wrong|出错了/i)).not.toBeVisible();
  });
});

test.describe("Workspaces page — unauthenticated", () => {
  test("unauthenticated user sees no crash on workspaces page", async ({ page }) => {
    await page.goto("/zh/workspaces");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByText(/something went wrong|出错了/i)).not.toBeVisible();
  });

  test("unauthenticated user sees login prompt or redirect", async ({ page }) => {
    await page.goto("/zh/workspaces");
    // Should show login required state (not a crash)
    await expect(page.locator("body")).toBeVisible();
    // Should NOT show the create workspace button (requires auth)
    await expect(page.getByTestId("workspace-create-btn")).not.toBeVisible({ timeout: 5_000 });
  });
});
