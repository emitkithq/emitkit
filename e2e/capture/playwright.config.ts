import { defineConfig, devices } from "@playwright/test";

/** Screenshot capture of every dashboard screen (see screens.spec.ts). */
export default defineConfig({
  outputDir: "../../test-results/capture-run",
  reporter: [["list"]],
  retries: 0,
  testDir: ".",
  timeout: 600_000,
  use: {
    ...devices["Desktop Chrome"],
    channel: process.env.E2E_BROWSER_CHANNEL ?? "chrome",
  },
  workers: 1,
});
