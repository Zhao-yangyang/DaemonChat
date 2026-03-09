import { test, expect } from "@playwright/test";

const MOCK_ASSISTANT_RESPONSE = "这是 E2E 测试的模拟回复";

test.describe("Authenticated chat flow", () => {
  test.beforeEach(async ({ page }) => {
    // 拦截 /api/chat/stream，返回 mock SSE，避免依赖真实 LLM
    await page.route("**/api/chat/stream**", async (route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        return route.continue();
      }
      const body = (await request.postDataJSON()) as { userInput?: string };
      const userInput = body?.userInput ?? "";
      const sseBody = [
        `data: ${JSON.stringify({ type: "meta", requestId: "e2e-mock" })}\n\n`,
        `data: ${JSON.stringify({ type: "chunk", value: MOCK_ASSISTANT_RESPONSE })}\n\n`,
      ].join("");
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
        body: sseBody,
      });
    });
  });

  test("login后进入首页，自动跳转到聊天页并成功发送消息", async ({ page }) => {
    await page.goto("/zh");
    await expect(page).toHaveURL(/\/chat\/[a-f0-9-]+/, { timeout: 15_000 });
    const url = page.url();
    expect(url).toContain("/chat/");

    const input = page.getByPlaceholder("输入消息...");
    await expect(input).toBeVisible({ timeout: 10_000 });
    const testMessage = "E2E 测试消息 " + Date.now();
    await input.fill(testMessage);

    await page.getByRole("button", { name: "发送" }).click();

    await expect(page.getByText(testMessage)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(MOCK_ASSISTANT_RESPONSE)).toBeVisible({ timeout: 15_000 });
  });
});
