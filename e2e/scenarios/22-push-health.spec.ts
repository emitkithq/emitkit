import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { postAuth } from "@e2e/support/api-session";
import { resolveTargetHosts } from "@e2e/support/dns";
import { attachHttpLog, recordResponse } from "@e2e/support/http-log";
import { runId, target, TEST_PASSWORD, testEmail } from "@e2e/support/targets";
import { chromium, expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";

/**
 * Push stays working on a device where it was turned on, and leaves with
 * the account. Ways it can break, each checked below:
 *
 * - The browser replaces its push subscription and the server keeps
 *   pushing to the old one, so the device silently gets nothing.
 * - Following the new subscription loses the person's per-organization
 *   choices (resets them to everything on).
 * - The server dropped the device (the push service said it was gone) and
 *   nobody tells the person, who keeps expecting alerts.
 * - Turning back on reuses the registration that stopped working.
 * - The browser dropped its subscription and the app waits for the person
 *   instead of registering again (permission still stands).
 * - Switching every organization off on purpose is reported as "stopped".
 * - After sign-out the device keeps getting the account's pushes, so the
 *   next person on it sees them.
 *
 * Chrome disables the Push API in incognito-like contexts and in headless
 * mode, so this opens a persistent profile in a visible window.
 */
test.describe.configure({ mode: "serial" });

interface Preferences {
  organizations: {
    organizationId: string;
    organizationName: string;
    subscribed: boolean;
  }[];
}

const email = testEmail("health");
const NAMES = ["E2E Health One", "E2E Health Two"] as const;
/** A subscription the browser has since replaced. */
const OLD_ENDPOINT = `https://fcm.googleapis.com/fcm/send/e2e-replaced-${runId}`;

let context: BrowserContext;
let page: Page;
let profile = "";
let userId = "";
let slug = "";
const organizationIds: string[] = [];

const rpc = async <T>(procedure: string, input: unknown = {}) => {
  const url = `${target.app}/rpc/${procedure}`;
  const raw = await page.request.post(url, {
    data: { json: input },
    headers: { origin: target.origin },
  });
  const response = await recordResponse("POST", url, input, raw);
  expect(response.ok(), `${procedure} → ${response.status()}`).toBe(true);
  const body: { json: T } = await response.json();
  return body.json;
};

const deviceEndpoint = () =>
  page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription?.endpoint ?? "";
  });

/** Which organizations push to `endpoint`, by name. */
const subscribedAt = async (endpoint: string) => {
  const { organizations } = await rpc<Preferences>(
    "notifications/preferences",
    { endpoint }
  );
  return organizations
    .filter((organization) => organization.subscribed)
    .map((organization) => organization.organizationName)
    .toSorted();
};

const marker = () =>
  page.evaluate(
    (key) => localStorage.getItem(key),
    `emitkit:push-endpoint:${userId}`
  );

/** Opens the dashboard and waits for the device check it runs. */
const openApp = async () => {
  const synced = page.waitForResponse((response) =>
    response.url().includes("/rpc/notifications/syncDevice")
  );
  await page.goto(`${target.app}/${slug}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Events" })
  ).toBeVisible();
  const response = await synced;
  expect(response.ok()).toBe(true);
};

const notice = () =>
  page.getByRole("complementary", { name: "Notifications stopped" });

test.beforeAll(async () => {
  profile = mkdtempSync(path.join(tmpdir(), "emitkit-health-"));
  const rules = process.env.E2E_DNS
    ? await resolveTargetHosts(process.env.E2E_DNS)
    : undefined;
  context = await chromium.launchPersistentContext(profile, {
    args: rules ? [`--host-resolver-rules=${rules}`] : [],
    channel: process.env.E2E_BROWSER_CHANNEL ?? "chrome",
    headless: false,
    ignoreDefaultArgs: ["--disable-background-networking"],
    permissions: ["notifications"],
  });
  page = await context.newPage();
  await page.goto(`${target.app}/auth/sign-in`);
  const signUp = await postAuth(page.request, "/api/auth/sign-up/email", {
    email,
    name: "E2E Health",
    password: TEST_PASSWORD,
  });
  expect(signUp.ok()).toBe(true);
  const created: { user: { id: string } } = await signUp.json();
  userId = created.user.id;
  for (const name of NAMES) {
    const workspace = await rpc<{
      organizationId: string;
      organizationSlug: string;
    }>("gettingStarted/bootstrap", {
      organizationName: name,
      projectName: "Web",
    });
    organizationIds.push(workspace.organizationId);
    slug ||= workspace.organizationSlug;
  }
  await page.request.post(`${target.app}/api/auth/organization/set-active`, {
    data: { organizationId: organizationIds[0] },
    headers: { origin: target.origin },
  });
});

test.afterEach(async ({}, testInfo) => {
  await attachHttpLog(testInfo);
});

test.afterAll(async () => {
  const listed = await page.request.get(
    `${target.app}/api/auth/organization/list`,
    { headers: { origin: target.origin } }
  );
  const all: { id: string }[] = listed.ok() ? await listed.json() : [];
  for (const organization of all) {
    await page.request.post(`${target.app}/api/auth/organization/delete`, {
      data: { organizationId: organization.id },
      headers: { origin: target.origin },
    });
  }
  await page.request.post(`${target.app}/api/auth/delete-user`, {
    data: { password: TEST_PASSWORD },
    headers: { origin: target.origin },
  });
  await context.close();
  rmSync(profile, { force: true, recursive: true });
});

test("turning push on remembers this device", async () => {
  await page.goto(`${target.app}/${slug}?settings=notifications`);
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Turn on" }).click();
  await expect(
    settings.getByRole("list", { name: "Organizations" })
  ).toContainText(NAMES[1], { timeout: 30_000 });
  const endpoint = await deviceEndpoint();
  expect(await subscribedAt(endpoint)).toEqual([...NAMES]);
  expect(await marker()).toBe(endpoint);
});

test("a replaced subscription takes the device's choices with it", async () => {
  const endpoint = await deviceEndpoint();
  // As if the browser replaced its subscription after the person switched
  // the second organization off: the rows are still under the old endpoint.
  await rpc("notifications/disableEverywhere", { endpoint });
  await rpc("notifications/setOrganization", {
    auth: "e2e-old-auth",
    channelIds: [],
    enabled: true,
    endpoint: OLD_ENDPOINT,
    organizationId: organizationIds[0],
    p256dh: "e2e-old-p256dh",
  });
  await page.evaluate(([key, old]) => localStorage.setItem(key, old), [
    `emitkit:push-endpoint:${userId}`,
    OLD_ENDPOINT,
  ] as const);

  await openApp();
  expect(await subscribedAt(endpoint)).toEqual([NAMES[0]]);
  expect(await subscribedAt(OLD_ENDPOINT)).toEqual([]);
  expect(await marker()).toBe(endpoint);
  await expect(notice()).toBeHidden();
});

test("a device the server dropped says so, and turns back on", async () => {
  const before = await deviceEndpoint();
  // As if the push service reported the subscription gone.
  await rpc("notifications/disableEverywhere", { endpoint: before });

  await openApp();
  await expect(notice()).toContainText("Notifications stopped on this device");
  await page.screenshot({
    path: test.info().outputPath("push-stopped-notice.png"),
  });
  await notice().getByRole("button", { name: "Turn back on" }).click();
  await expect(notice()).toBeHidden({ timeout: 30_000 });

  const after = await deviceEndpoint();
  expect(after).not.toBe(before);
  expect(await subscribedAt(after)).toEqual([...NAMES]);
  expect(await marker()).toBe(after);
});

test("a subscription the browser dropped is renewed without asking", async () => {
  const before = await deviceEndpoint();
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    await subscription?.unsubscribe();
  });
  expect(await deviceEndpoint()).toBe("");

  await openApp();
  await expect(notice()).toBeHidden();
  const after = await deviceEndpoint();
  expect(after).not.toBe("");
  expect(after).not.toBe(before);
  expect(await subscribedAt(after)).toEqual([...NAMES]);
  expect(await subscribedAt(before)).toEqual([]);
  expect(await marker()).toBe(after);
});

test("switching every organization off is not reported as stopped", async () => {
  await page.goto(`${target.app}/${slug}?settings=notifications`);
  const settings = page.getByRole("dialog", { name: "Settings" });
  const [first, last] = NAMES;
  const row = settings.locator("li").filter({ hasText: first });
  await row
    .getByRole("switch", { name: `Notifications from ${first}` })
    .click({ force: true });
  await expect(row).toContainText("Off");
  await settings
    .getByRole("switch", { name: `Notifications from ${last}` })
    .click({ force: true });
  // The last one off turns the device off.
  await expect(settings).toContainText("Notifications are off on this device");
  expect(await subscribedAt(await deviceEndpoint())).toEqual([]);
  expect(await marker()).toBeNull();

  await openApp();
  await expect(notice()).toBeHidden();
});

test("signing out stops this device's pushes for the account", async () => {
  await page.goto(`${target.app}/${slug}?settings=notifications`);
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Turn on" }).click();
  const endpoint = await deviceEndpoint();
  await expect.poll(() => subscribedAt(endpoint)).toEqual([...NAMES]);

  await page.goto(`${target.app}/${slug}`);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/auth\/sign-in/u);
  expect(await marker()).toBeNull();

  const signIn = await postAuth(page.request, "/api/auth/sign-in/email", {
    email,
    password: TEST_PASSWORD,
  });
  expect(signIn.ok()).toBe(true);
  expect(await subscribedAt(endpoint)).toEqual([]);
  // The browser keeps its registration for whoever turns push on next.
  expect(await deviceEndpoint()).toBe(endpoint);
});
