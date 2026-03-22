import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  fullyParallel: true,
  workers: 4,
  use: {
    baseURL: "https://myabiflow.de",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    bypassCSP: true,
    serviceWorkers: "block",
  },
  projects: [
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
