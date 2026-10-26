import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveTargetHosts } from "@e2e/support/dns";
import { attachHttpLog, recordResponse } from "@e2e/support/http-log";
import { target, TEST_PASSWORD, testEmail } from "@e2e/support/targets";
import { chromium, expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";

/**
 * Push preferences are per device, across every organization you belong to
 * (Settings → Notifications): one switch turns the device on everywhere,
 * each organization can be switched off or narrowed to channels, and an
 * organization you create later picks the device up by itself. Subscribing
 * works on any origin; delivery is covered by 05-push-pwa.
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
    channelIds: string[];
  }[];
}

let context: BrowserContext;
let page: Page;
let profile = "";
const organizationIds: string[] = [];
const starterKeys: string[] = [];

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

const endpoint = () =>
  page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription?.endpoint ?? "";
  });

const preferences = async () =>
  rpc<Preferences>("notifications/preferences", {
    endpoint: await endpoint(),
  });

const byName = async (name: string) => {
  const { organizations } = await preferences();
  return organizations.find(
    (organization) => organization.organizationName === name
  );
};

test.beforeAll(async () => {
  profile = mkdtempSync(path.join(tmpdir(), "emitkit-prefs-"));
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
  const signUp = await page.request.post(
    `${target.app}/api/auth/sign-up/email`,
    {
      data: {
        email: testEmail("prefs"),
        name: "E2E Prefs",
        password: TEST_PASSWORD,
      },
      headers: { origin: target.origin },
    }
  );
  expect(signUp.ok()).toBe(true);
  for (const name of ["E2E Prefs One", "E2E Prefs Two"]) {
    const workspace = await rpc<{
      organizationId: string;
      apiKey: { secret: string };
    }>("gettingStarted/bootstrap", {
      organizationName: name,
      projectName: "Web",
    });
    organizationIds.push(workspace.organizationId);
    starterKeys.push(workspace.apiKey.secret);
  }
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

test("one switch turns this device on for every organization", async ({}, testInfo) => {
  const [first] = organizationIds;
  await page.request.post(`${target.app}/api/auth/organization/set-active`, {
    data: { organizationId: first },
    headers: { origin: target.origin },
  });
  const workspace = await rpc<{ organizationSlug: string }>(
    "workspace/current"
  );
  await page.goto(
    `${target.app}/${workspace.organizationSlug}?settings=notifications`
  );
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Turn on" }).click();
  const list = settings.getByRole("list", { name: "Organizations" });
  await expect(list.locator("li")).toHaveCount(2, { timeout: 30_000 });
  await expect(list).toContainText("E2E Prefs One");
  await expect(list).toContainText("E2E Prefs Two");
  const { organizations } = await preferences();
  expect(
    organizations.map((organization) => [
      organization.organizationName,
      organization.subscribed,
      organization.channelIds.length,
    ])
  ).toEqual([
    ["E2E Prefs One", true, 0],
    ["E2E Prefs Two", true, 0],
  ]);
  await testInfo.attach("notifications", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});

test("an organization can be switched off or narrowed to channels", async () => {
  // Two channels in the first organization, created by its first events.
  for (const channelName of ["payments", "signups"]) {
    const sent = await page.request.post(`${target.api}/v1/events`, {
      data: { channelName, title: `First ${channelName} event` },
      headers: { authorization: `Bearer ${starterKeys[0] ?? ""}` },
    });
    expect(sent.status()).toBe(201);
  }
  const settings = page.getByRole("dialog", { name: "Settings" });
  await page.reload();
  const two = settings.locator("li").filter({ hasText: "E2E Prefs Two" });
  await two
    .getByRole("switch", { name: "Notifications from E2E Prefs Two" })
    .click({ force: true });
  await expect(two).toContainText("Off");
  expect(await byName("E2E Prefs Two")).toMatchObject({ subscribed: false });

  const one = settings.locator("li").filter({ hasText: "E2E Prefs One" });
  await one.getByRole("button", { name: /All channels/u }).click();
  await one.getByText("Only some", { exact: true }).click();
  await expect(one.getByText("#payments")).toBeVisible();
  await one.getByText("#payments").click();
  await expect(one).toContainText(/channels? of/u, { timeout: 15_000 });
  const narrowed = await byName("E2E Prefs One");
  expect(narrowed?.subscribed).toBe(true);
  expect(narrowed?.channelIds.length).toBeGreaterThan(0);
});

test("an organization created later picks this device up", async () => {
  const created = await page.request.post(
    `${target.app}/api/auth/organization/create`,
    {
      data: { name: "E2E Prefs Three", slug: `e2e-prefs-three-${Date.now()}` },
      headers: { origin: target.origin },
    }
  );
  expect(created.ok()).toBe(true);
  expect(await byName("E2E Prefs Three")).toMatchObject({
    channelIds: [],
    subscribed: true,
  });
});

test("organizations you don't belong to are refused", async () => {
  const raw = await page.request.post(
    `${target.app}/rpc/notifications/setOrganization`,
    {
      data: {
        json: {
          auth: "x",
          channelIds: [],
          enabled: true,
          endpoint: await endpoint(),
          organizationId: "org_not_mine_000000000000",
          p256dh: "x",
        },
      },
      headers: { origin: target.origin },
    }
  );
  expect(raw.status()).toBe(404);
});
