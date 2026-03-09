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
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...(process.env.CI
          ? { browserName: "chromium" }
          : { browserName: "chromium", channel: "chrome" }),
      },
      testIgnore: [/.*\.setup\.ts/, /chat\.spec\.ts/],
    },
    {
      name: "chromium-authenticated",
      use: {
        ...(process.env.CI
          ? { browserName: "chromium" }
          : { browserName: "chromium", channel: "chrome" }),
        storageState: "playwright/.auth/user.json",
      },
      testMatch: /chat\.spec\.ts/,
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "bun run dev",
    url: "http://localhost:3333",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
