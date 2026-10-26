import { createHmac } from "node:crypto";

import { attachHttpLog, recordResponse } from "@e2e/support/http-log";
import { target, TEST_PASSWORD, testEmail } from "@e2e/support/targets";
import { expect, test } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";

/**
 * Hosted billing (Autumn), as the server is configured:
 *
 * - Billing off (self-hosted, `pnpm dev` without AUTUMN_SECRET_KEY): nothing
 *   is gated. Invites are unlimited and Settings → Billing says so.
 * - Billing on (Autumn sandbox key in .dev.vars): a new organization starts
 *   on the paywall modal (no invites, events still recorded), starts a
 *   14-day trial through Stripe's test checkout and lands in the setup
 *   guide, adds a seat after seeing the price, and the webhook rejects
 *   unsigned calls.
 *
 * `E2E_AUTUMN_WEBHOOK_SECRET` (the dev server's AUTUMN_WEBHOOK_SECRET)
 * enables the signed-webhook check.
 */
test.describe.configure({ mode: "serial" });

let page: Page;
let organizationId = "";
let orgSlug = "";
let billingOn = false;

const rpc = async <T>(procedure: string, input: unknown = {}) => {
  const url = `${target.app}/rpc/${procedure}`;
  const raw = await page.request.post(url, {
    data: { json: input },
    headers: { origin: target.origin },
  });
  const response = await recordResponse("POST", url, input, raw);
  const body: { json: T } = await response.json();
  return { body: body.json, status: response.status() };
};

interface Status {
  state: string;
  seats: number | null;
  seatsUsed: number;
  planId: string | null;
  trialEndsAt: string | null;
}

const billingStatus = async (refresh = false) => {
  const { body } = await rpc<Status>("billing/status", { refresh });
  return body;
};

const billingState = async () => {
  const { state } = await billingStatus();
  return state;
};

const invite = (email: string) =>
  page.request.post(`${target.app}/api/auth/organization/invite-member`, {
    data: { email, organizationId, role: "member" },
    headers: { origin: target.origin },
  });

const inviteStatus = async (email: string) => {
  const response = await invite(email);
  return response.status();
};

const snap = async (testInfo: TestInfo, name: string) => {
  await testInfo.attach(name, {
    body: await page.screenshot(),
    contentType: "image/png",
  });
};

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto(`${target.app}/auth/sign-in`);
  const signUp = await page.request.post(
    `${target.app}/api/auth/sign-up/email`,
    {
      data: {
        email: testEmail("billing"),
        name: "E2E Billing",
        password: TEST_PASSWORD,
      },
      headers: { origin: target.origin },
    }
  );
  expect(signUp.ok()).toBe(true);
  const workspace = await rpc<{
    organizationId: string;
    organizationSlug: string;
  }>("gettingStarted/ensureWorkspace");
  ({ organizationId, organizationSlug: orgSlug } = workspace.body);
  await page.request.post(`${target.app}/api/auth/organization/set-active`, {
    data: { organizationId },
    headers: { origin: target.origin },
  });
  billingOn = (await billingState()) !== "off";
});

test.afterEach(async ({}, testInfo) => {
  await attachHttpLog(testInfo);
});

test.afterAll(async () => {
  // Deleting the organization also cancels its subscription in Autumn.
  await page.request.post(`${target.app}/api/auth/organization/delete`, {
    data: { organizationId },
    headers: { origin: target.origin },
  });
  await page.request.post(`${target.app}/api/auth/delete-user`, {
    data: { password: TEST_PASSWORD },
    headers: { origin: target.origin },
  });
  await page.close();
});

test("billing off: nothing is gated", async ({}, testInfo) => {
  test.skip(billingOn, "this server has billing configured");
  expect(await billingStatus()).toMatchObject({ seats: null, state: "off" });
  for (const label of ["one", "two"]) {
    expect(await inviteStatus(testEmail(`off-${label}`))).toBe(200);
  }
  await page.goto(`${target.app}/${orgSlug}?settings=billing`);
  await expect(page.getByRole("dialog", { name: "Settings" })).toContainText(
    "This EmitKit server has no billing"
  );
  await snap(testInfo, "billing-off");
});

test("a new organization starts on the trial paywall", async ({}, testInfo) => {
  test.skip(!billingOn, "billing is off on this server");
  expect(await billingStatus(true)).toMatchObject({
    planId: null,
    seats: 1,
    seatsUsed: 1,
    state: "required",
  });
  const blocked = await invite(testEmail("too-early"));
  expect(blocked.status()).toBe(403);
  expect(await blocked.text()).toContain("Start a plan");
  // Events are accepted and recorded even without a plan.
  const event = await rpc<{ eventId: string }>("gettingStarted/sendTestEvent");
  expect(event.status).toBe(200);

  await page.goto(`${target.app}/${orgSlug}?guide=setup`);
  const paywall = page.getByRole("dialog", { name: "Start your free trial" });
  await expect(paywall).toContainText("Start your 14-day free trial");
  // The setup guide waits until the trial has started.
  await expect(page.getByRole("dialog", { name: "Setup guide" })).toHaveCount(
    0
  );
  await expect(paywall.locator('[data-plan="solo"]')).toContainText("$9/mo");
  await expect(paywall.locator('[data-plan="team"]')).toContainText("$39/mo");
  await paywall.getByText("Lifetime", { exact: true }).click();
  await expect(paywall.locator('[data-plan="solo_lifetime"]')).toContainText(
    "$79 once"
  );
  await paywall.getByText("Monthly", { exact: true }).click();
  await snap(testInfo, "paywall");

  // Settings stays reachable: the paywall steps aside while it's open.
  await paywall.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await expect(paywall).toBeHidden();
});

test("the trial starts through Stripe's test checkout and lands in the setup guide", async ({}, testInfo) => {
  test.skip(!billingOn, "billing is off on this server");
  test.setTimeout(180_000);
  await page.goto(`${target.app}/${orgSlug}`);
  const paywall = page.getByRole("dialog", { name: "Start your free trial" });
  await paywall.getByRole("button", { name: "Start free trial" }).click();

  await page.waitForURL(/checkout\.stripe\.com/u, { timeout: 30_000 });
  await snap(testInfo, "stripe-checkout");
  await page.locator("#cardNumber").fill("4242424242424242");
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  await page.locator("#billingName").fill("E2E Billing");
  const postal = page.locator("#billingPostalCode");
  if (await postal.isVisible()) {
    await postal.fill("10001");
  }
  await page.locator('[data-testid="hosted-payment-submit-button"]').click();

  await page.waitForURL(
    (url) =>
      url.href.startsWith(target.app) &&
      url.searchParams.get("guide") === "setup",
    { timeout: 90_000 }
  );
  await expect(page.getByRole("dialog", { name: "Setup guide" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(paywall).toHaveCount(0);
  const status = await billingStatus(true);
  expect(status).toMatchObject({ planId: "solo", seats: 1, state: "trialing" });
  expect(status.trialEndsAt).not.toBeNull();
  await snap(testInfo, "setup-guide-after-checkout");
});

test("adding a seat shows the price first, then invites work", async ({}, testInfo) => {
  test.skip(!billingOn, "billing is off on this server");
  const blocked = await invite(testEmail("seat-two"));
  expect(blocked.status()).toBe(403);
  expect(await blocked.text()).toContain("Add a seat");

  await page.goto(`${target.app}/${orgSlug}?settings=billing`);
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Add a seat" }).click();
  await expect(settings.locator("[data-seat-target]")).toHaveText("2");
  // During the trial nothing is due now; the next invoice includes the seat.
  await expect(settings.locator("[data-seat-preview]")).toContainText("$18", {
    timeout: 20_000,
  });
  await snap(testInfo, "seat-preview");
  const confirm = settings.getByRole("button", { name: "Confirm 2 seats" });
  await confirm.click();
  // The change is saved once the confirmation row goes away.
  await expect(confirm).toHaveCount(0, { timeout: 30_000 });
  await expect(settings.locator("[data-seat-target]")).toHaveText("2");
  const { seats } = await billingStatus();
  expect(seats).toBe(2);
  expect(await inviteStatus(testEmail("seat-two"))).toBe(200);
});

test("the webhook only accepts Autumn's signature", async () => {
  test.skip(!billingOn, "billing is off on this server");
  const url = `${target.app}/api/billing/webhook`;
  const body = JSON.stringify({
    data: { customer_id: organizationId, plan_changes: [], tags: [] },
    type: "billing.updated",
  });
  const unsigned = await page.request.post(url, {
    data: body,
    headers: { "content-type": "application/json" },
  });
  expect([401, 204]).toContain(unsigned.status());

  const secret = process.env.E2E_AUTUMN_WEBHOOK_SECRET;
  test.skip(!secret, "set E2E_AUTUMN_WEBHOOK_SECRET to check signed calls");
  expect(unsigned.status()).toBe(401);
  const id = `msg_e2e_${Date.now()}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const key = Buffer.from((secret ?? "").replace(/^whsec_/u, ""), "base64");
  const signature = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  const headers = {
    "content-type": "application/json",
    "svix-id": id,
    "svix-signature": `v1,${signature}`,
    "svix-timestamp": timestamp,
  };
  const signed = await page.request.post(url, { data: body, headers });
  expect(signed.status()).toBe(204);
  const tampered = await page.request.post(url, {
    data: body.replace("billing.updated", "billing.updatex"),
    headers,
  });
  expect(tampered.status()).toBe(401);
});
