import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for role-based dashboard/POS verification.
 *
 * Required env vars (tests skip cleanly if any are missing):
 *  - E2E_BASE_URL          e.g. https://infinitysales-pro.lovable.app
 *  - E2E_ADMIN_EMAIL       admin (or manager) account
 *  - E2E_ADMIN_PASSWORD
 *  - E2E_USER_EMAIL        non-privileged standard user account
 *  - E2E_USER_PASSWORD
 */
export default defineConfig({
  testDir: "./e2e",
  // The production suites create and remove tagged accounting records. Run
  // them sequentially so one suite cannot delete or alter data while another
  // suite is asserting dashboard/POS totals.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://infinitysales-pro.lovable.app",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 5"] },
    },
  ],
});
