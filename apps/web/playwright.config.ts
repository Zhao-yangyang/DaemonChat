import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3333",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        // CI 使用 playwright 自带 chromium；本地优先用系统 Chrome 避免沙盒缓存路径问题
        ...(process.env.CI
          ? { browserName: "chromium" }
          : { browserName: "chromium", channel: "chrome" }),
      },
    },
  ],
  webServer: {
    command: "bun run dev",
    url: "http://localhost:3333",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
