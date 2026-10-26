import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveTargetHosts } from "@e2e/support/dns";
import { attachHttpLog, recordResponse } from "@e2e/support/http-log";
import { target, TEST_PASSWORD, testEmail } from "@e2e/support/targets";
import { chromium, expect, test } from "@playwright/test";
import type { BrowserContext, Page, TestInfo } from "@playwright/test";

/**
 * Web Push end to end in a real Chrome profile: the PWA's service worker,
 * Settings → Notifications (enable, test, disable), and an event whose
 * notification travels API → Queue → consumer → push service → service worker.
 *
 * Chrome disables the Push API in incognito-like contexts (Playwright's
 * default) and in headless mode, so this scenario opens a persistent profile
 * in a visible window.
 */
test.describe.configure({ mode: "serial" });

const rpc = async (page: Page, procedure: string, input: unknown = {}) => {
  const url = `${target.app}/rpc/${procedure}`;
  const raw = await page.request.post(url, {
    data: { json: input },
    headers: { origin: target.origin },
  });
  const response = await recordResponse("POST", url, input, raw);
  expect(response.ok(), `${procedure} → ${response.status()}`).toBe(true);
  const body: { json: Record<string, unknown> } = await response.json();
  return body.json;
};

const shownTitles = (page: Page) =>
  page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const notifications = await registration.getNotifications();
    return notifications.map(
      (notification) => `${notification.title} | ${notification.body}`
    );
  });

const currentEndpoint = (page: Page) =>
  page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription?.endpoint ?? null;
  });

const isSubscribed = async (page: Page, endpoint: string) => {
  const settings = await rpc(page, "notifications/get", { endpoint });
  return settings.subscribed;
};

const shownText = async (page: Page) => {
  const titles = await shownTitles(page);
  return titles.join("\n");
};

const snap = async (page: Page, testInfo: TestInfo, name: string) => {
  await testInfo.attach(name, {
    body: await page.screenshot(),
    contentType: "image/png",
  });
};

test("Settings → Notifications delivers real pushes", async ({}, testInfo) => {
  // The push service's display latency varies (seen 1–20 s); allow for it.
  test.setTimeout(300_000);
  test.skip(
    target.name === "local",
    "Web Push needs a public HTTPS origin and the browser's push service"
  );
  const profile = mkdtempSync(path.join(tmpdir(), "emitkit-push-"));
  const rules = process.env.E2E_DNS
    ? await resolveTargetHosts(process.env.E2E_DNS)
    : undefined;
  const context: BrowserContext = await chromium.launchPersistentContext(
    profile,
    {
      args: rules ? [`--host-resolver-rules=${rules}`] : [],
      channel: process.env.E2E_BROWSER_CHANNEL ?? "chrome",
      headless: false,
      ignoreDefaultArgs: ["--disable-background-networking"],
      permissions: ["notifications"],
      viewport: { height: 860, width: 1360 },
    }
  );
  const page = context.pages()[0] ?? (await context.newPage());
  let organizationId = "";

  try {
    await page.goto(`${target.app}/manifest.webmanifest`);
    const signUp = await page.request.post(
      `${target.app}/api/auth/sign-up/email`,
      {
        data: {
          email: testEmail("push"),
          name: "E2E Push",
          password: TEST_PASSWORD,
        },
        headers: { origin: target.origin },
      }
    );
    expect(signUp.ok()).toBe(true);
    const workspace = await rpc(page, "gettingStarted/bootstrap", {
      organizationName: "E2E Push Co",
      projectName: "Push",
    });
    organizationId = String(workspace.organizationId);
    const { secret } = workspace.apiKey as { secret: string };
    await page.request.post(`${target.app}/api/auth/organization/set-active`, {
      data: { organizationId },
      headers: { origin: target.origin },
    });

    await page.goto(
      `${target.app}/${String(workspace.organizationSlug)}?settings=notifications`
    );
    await page.getByRole("button", { name: "Turn on" }).click();
    await expect
      .poll(() => currentEndpoint(page), { timeout: 60_000 })
      .toMatch(/^https:\/\//u);
    const endpoint = String(await currentEndpoint(page));
    await expect
      .poll(() => isSubscribed(page, endpoint), { timeout: 15_000 })
      .toBe(true);
    await snap(page, testInfo, "notifications-enabled");

    const testResponse = page.waitForResponse((response) =>
      response.url().endsWith("/rpc/notifications/test")
    );
    await page.getByRole("button", { name: "Send test" }).click();
    const testResult = await testResponse;
    const sent: { json: { delivered: number } } = await testResult.json();
    expect(sent.json.delivered, "push service accepted the test push").toBe(1);
    await expect
      .poll(() => shownText(page), { timeout: 90_000 })
      .toContain("EmitKit test notification");

    const created = await page.request.post(`${target.api}/v1/events`, {
      data: {
        channelName: "alerts",
        description: "Card declined",
        icon: "🚨",
        title: "Checkout failed",
      },
      headers: { authorization: `Bearer ${secret}` },
    });
    await recordResponse(
      "POST",
      `${target.api}/v1/events`,
      { channelName: "alerts", title: "Checkout failed" },
      created
    );
    expect(created.status()).toBe(201);
    await expect
      .poll(() => shownText(page), { timeout: 90_000 })
      .toContain("🚨 Checkout failed | Card declined\n#alerts");
    await snap(page, testInfo, "push-received");

    await page.getByRole("button", { name: "Turn off" }).click();
    await expect
      .poll(() => isSubscribed(page, endpoint), { timeout: 15_000 })
      .toBe(false);
  } finally {
    if (organizationId) {
      await page.request.post(`${target.app}/api/auth/organization/delete`, {
        data: { organizationId },
        headers: { origin: target.origin },
      });
    }
    await page.request.post(`${target.app}/api/auth/delete-user`, {
      data: { password: TEST_PASSWORD },
      headers: { origin: target.origin },
    });
    await attachHttpLog(testInfo);
    await context.close();
    rmSync(profile, { force: true, recursive: true });
  }
});
