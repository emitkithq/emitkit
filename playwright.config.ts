import { resolveTargetHosts } from "@e2e/support/dns";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E scenarios (see e2e/README.md). `E2E_TARGET=local|staging|production`.
 * Traces and screenshots are always captured; `pnpm e2e:report` redacts
 * secrets from them before they are written to e2e/reports/. Traces keep DOM
 * snapshots (text, so redactable) but no screencast frames: a frame is an
 * image of whatever was on screen, such as a revealed API key.
 */
const hostResolverRules = process.env.E2E_DNS
  ? await resolveTargetHosts(process.env.E2E_DNS)
  : undefined;

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: "test-results",
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  retries: 0,
  testDir: "e2e/scenarios",
  timeout: 120_000,
  use: {
    ...devices["Desktop Chrome"],
    channel: process.env.E2E_BROWSER_CHANNEL ?? "chrome",
    launchOptions: {
      args: hostResolverRules
        ? [`--host-resolver-rules=${hostResolverRules}`]
        : [],
      // Web Push needs Chrome's connection to its push service.
      ignoreDefaultArgs: ["--disable-background-networking"],
    },
    screenshot: "on",
    trace: { mode: "on", screenshots: false, snapshots: true, sources: true },
  },
  workers: 1,
});
