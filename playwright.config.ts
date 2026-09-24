import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  // Browser-E2E-Tests use *.spec.ts. Reine Node-Unit- und Live-Quality-Tests
  // werden separat ausgeführt und dürfen nicht von Playwright eingesammelt werden.
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  fullyParallel: true,
  workers: 4,
  use: {
    baseURL: process.env.E2E_BASE_URL || "https://myabiflow.de",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    bypassCSP: true,
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "ipad",
      use: { ...devices["iPad Pro 11"] },
      testDir: "./tests/tablet",
    },
    {
      name: "ipad-landscape",
      use: { ...devices["iPad Pro 11 landscape"] },
      testDir: "./tests/tablet",
    },
  ],
});
