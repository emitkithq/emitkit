import { createHmac } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { ApiSession } from "@e2e/support/api-session";
import { attachHttpLog, recordResponse } from "@e2e/support/http-log";
import { startOpenPanelCapture } from "@e2e/support/openpanel-capture";
import type {
  CapturedRequest,
  OpenPanelCapture,
} from "@e2e/support/openpanel-capture";
import { runId, target, TEST_PASSWORD } from "@e2e/support/targets";
import { expect, request as playwrightRequest, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

/**
 * Operator telemetry (trakoo → OpenPanel and EmitKit), end to end on the
 * local dev server. The server's OpenPanel destination points at a capture
 * server started here, so every assertion reads what the Worker really sent:
 *
 *   TELEMETRY_OPENPANEL_CLIENT_ID=e2e-telemetry
 *   TELEMETRY_OPENPANEL_CLIENT_SECRET=<anything>
 *   TELEMETRY_OPENPANEL_API_URL=http://127.0.0.1:$E2E_TELEMETRY_PORT
 *
 * in `.dev.vars`, then `E2E_TELEMETRY_PORT=<port> pnpm e2e 18`. Skipped
 * otherwise. EmitKit's destination posts to api.emitkit.com and can't be
 * captured; see the report's notes.
 */
const port = Number(process.env.E2E_TELEMETRY_PORT ?? 0);

test.describe.configure({ mode: "serial" });
test.skip(
  !port || target.name !== "local",
  "needs E2E_TELEMETRY_PORT and a local dev server with telemetry pointed at it"
);

const USER_AGENT = "EmitKitTelemetryE2E/1.0";
/** Not an E2E mailbox, so the Worker reports it like a real sign-up. */
const email = `telemetry-${runId}@example.org`;

let capture: OpenPanelCapture;
let context: APIRequestContext;
let session: ApiSession;
let organizationId: string;
let projectId: string;
let starterKey: string;
let profileId: string;

const createEvents = async (key: string, count: number) => {
  for (let i = 0; i < count; i += 1) {
    const url = `${target.api}/v1/events`;
    const body = { channelName: "telemetry", title: `Event ${i + 1}` };
    const response = await recordResponse(
      "POST",
      url,
      body,
      await context.post(url, {
        data: body,
        headers: { authorization: `Bearer ${key}` },
      })
    );
    expect(response.status()).toBe(201);
  }
};

test.beforeAll(async () => {
  capture = await startOpenPanelCapture(port);
  context = await playwrightRequest.newContext();
});

let capturedBefore = 0;

test.beforeEach(() => {
  capturedBefore = capture.requests.length;
});

test.afterEach(async ({}, testInfo) => {
  await attachHttpLog(testInfo);
  await testInfo.attach("openpanel-requests", {
    body: JSON.stringify(capture.requests.slice(capturedBefore), null, 2),
    contentType: "application/json",
  });
});

test.afterAll(async () => {
  await context.dispose();
  await capture.close();
});

test("a sign-up is identified and reported with its request", async () => {
  session = await ApiSession.signUp(context, "telemetry", {
    email,
    headers: { "user-agent": USER_AGENT },
  });
  const signup = await capture.track(
    "new_signup",
    (request) => request.payload.properties?.user_email === email
  );
  expect(signup.headers).toMatchObject({
    clientId: "e2e-telemetry",
    hasClientSecret: true,
    userAgent: USER_AGENT,
  });
  expect(signup.payload.profileId).toMatch(/^user_/u);
  expect(signup.payload.properties).toMatchObject({
    category: "signup",
    description: `E2E telemetry (${email}) signed up with email and password.`,
    method: "password",
    name: "E2E telemetry",
  });
  profileId = signup.payload.profileId ?? "";

  const identify = await capture.identify(profileId);
  expect(identify.payload).toMatchObject({ email, firstName: "E2E" });
});

test("the workspace, the setup guide's test event and a first real event", async () => {
  const workspace = await session.bootstrap(
    "Telemetry Co",
    "Telemetry Project"
  );
  ({ organizationId } = workspace);
  projectId = workspace.project.id;
  starterKey = workspace.apiKey.secret;

  const created = await capture.track(
    "organization_created",
    (request) => request.payload.properties?.organizationId === organizationId
  );
  expect(created.payload).toMatchObject({
    profileId,
    properties: { category: "product", organizationName: "Telemetry Co" },
  });

  await session.rpc("gettingStarted/sendTestEvent");
  await capture.track(
    "test_event_sent",
    (request) => request.payload.properties?.organizationId === organizationId
  );
  // The dashboard's test event isn't the organization's first event.
  expect(capture.tracked("first_event_received")).toHaveLength(0);

  await createEvents(starterKey, 1);
  const first = await capture.track(
    "first_event_received",
    (request) => request.payload.properties?.organizationId === organizationId
  );
  expect(first.payload).toMatchObject({
    profileId,
    properties: {
      category: "milestone",
      description: "Telemetry Co sent its first event.",
      organizationName: "Telemetry Co",
    },
  });
});

test("100 events through the API is a milestone, reported once", async () => {
  // Two keys: each allows 100 requests a minute.
  const second = await session.rpc<{ secret: string }>("apiKeys/create", {
    name: "Telemetry second key",
    projectId,
  });
  await createEvents(starterKey, 49);
  await createEvents(second.secret, 50);
  const milestone = await capture.track(
    "milestone_reached",
    (request) => request.payload.properties?.organizationId === organizationId
  );
  expect(milestone.payload.properties).toMatchObject({
    description: "Telemetry Co has sent 100 events.",
    events: 100,
  });
  await createEvents(second.secret, 1);
  expect(capture.tracked("milestone_reached")).toHaveLength(1);
  expect(capture.tracked("first_event_received")).toHaveLength(1);
});

/** Posts a `billing.updated` webhook for the organization, signed like Autumn's. */
const billingWebhook = async (
  secret: string,
  data: { plan_changes: unknown[]; tags?: string[] }
) => {
  const body = JSON.stringify({
    data: { customer_id: organizationId, tags: [], ...data },
    type: "billing.updated",
  });
  const id = `msg_e2e_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const key = Buffer.from(secret.replace(/^whsec_/u, ""), "base64");
  const signature = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  const response = await context.post(`${target.app}/api/billing/webhook`, {
    data: body,
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-signature": `v1,${signature}`,
      "svix-timestamp": timestamp,
    },
  });
  expect(response.status()).toBe(204);
};

const DAY = 86_400_000;

const subscription = (
  planId: string,
  fields: Record<string, unknown> = {}
) => ({
  canceled_at: null,
  current_period_end: Date.now() + 30 * DAY,
  expires_at: null,
  past_due: false,
  plan_id: planId,
  status: "active",
  trial_ends_at: null,
  ...fields,
});

const ofOrganization = (request: CapturedRequest) =>
  request.payload.properties?.organizationId === organizationId;

test("checkout and Autumn's billing webhooks become billing events", async () => {
  const secret = process.env.E2E_AUTUMN_WEBHOOK_SECRET;
  test.skip(
    !secret,
    "needs billing on (an Autumn sandbox key) and E2E_AUTUMN_WEBHOOK_SECRET"
  );
  const webhook = (data: { plan_changes: unknown[]; tags?: string[] }) =>
    billingWebhook(secret ?? "", data);

  // Reported once Autumn hands back a checkout URL. A sandbox Stripe account
  // that refuses the session (see the report's notes) reports nothing.
  const opened = await session.rpc("billing/checkout", { planId: "team" }).then(
    () => true,
    () => false
  );
  await sleep(2000);
  expect(
    capture
      .tracked("checkout_started", ofOrganization)
      .map((request) => request.payload.properties)
  ).toEqual(
    opened
      ? [
          expect.objectContaining({
            billing: "month",
            plan: "team",
            planName: "Team monthly",
          }),
        ]
      : []
  );

  const trialEndsAt = Date.now() + 14 * DAY;
  await webhook({
    plan_changes: [
      {
        action: "activated",
        previous_attributes: null,
        subscription: subscription("team", {
          status: "trialing",
          trial_ends_at: trialEndsAt,
        }),
      },
    ],
  });
  const trial = await capture.track("trial_started", ofOrganization);
  expect(trial.payload.properties).toMatchObject({
    category: "billing",
    description: "Telemetry Co started a Team monthly trial ($39/mo after).",
    planPrice: 39,
  });
  // A trial charges nothing yet, so it carries no revenue.
  expect(trial.payload.properties?.amount).toBeUndefined();

  // The trial ends but its first charge fails: a failed payment, not a
  // conversion.
  await webhook({
    plan_changes: [
      {
        action: "updated",
        previous_attributes: { past_due: false, status: "trialing" },
        subscription: subscription("team", { past_due: true }),
      },
    ],
    tags: ["trial_ended"],
  });
  expect(
    await capture.properties("payment_failed", ofOrganization)
  ).toMatchObject({
    description: "Couldn't charge Telemetry Co for Team monthly.",
  });
  await sleep(2000);
  expect(capture.tracked("trial_converted", ofOrganization)).toEqual([]);

  await webhook({
    plan_changes: [
      {
        action: "updated",
        previous_attributes: { past_due: true },
        subscription: subscription("team"),
      },
    ],
    tags: ["trial_ended"],
  });
  expect(
    await capture.properties("trial_converted", ofOrganization)
  ).toMatchObject({
    amount: 39,
    currency: "USD",
    description: "Telemetry Co's Team monthly trial converted: $39/mo.",
  });

  const endsAt = Date.now() + 10 * DAY;
  await webhook({
    plan_changes: [
      {
        action: "updated",
        previous_attributes: { canceled_at: null },
        subscription: subscription("team", {
          canceled_at: Date.now(),
          expires_at: endsAt,
        }),
      },
    ],
  });
  expect(
    await capture.properties("subscription_canceled", ofOrganization)
  ).toMatchObject({
    description: `Telemetry Co canceled Team monthly; it ends ${new Date(endsAt).toISOString().slice(0, 10)}.`,
  });

  await webhook({
    plan_changes: [
      { action: "activated", subscription: subscription("team_annual") },
      {
        action: "expired",
        previous_attributes: { status: "active" },
        subscription: subscription("team", { status: "expired" }),
      },
    ],
  });
  expect(
    await capture.properties("plan_changed", ofOrganization)
  ).toMatchObject({
    description: "Telemetry Co moved from Team monthly to Team yearly.",
    plan: "team_annual",
    previousPlan: "team",
  });

  await webhook({
    plan_changes: [
      { action: "activated", purchase: { plan_id: "team_lifetime" } },
    ],
  });
  expect(
    await capture.properties("lifetime_purchased", ofOrganization)
  ).toMatchObject({
    amount: 499,
    currency: "USD",
    description: "Telemetry Co bought Team Lifetime for $499.",
  });

  await webhook({
    plan_changes: [
      {
        action: "expired",
        subscription: subscription("team_annual", { status: "expired" }),
      },
    ],
  });
  expect(
    await capture.properties("subscription_ended", ofOrganization)
  ).toMatchObject({
    description: "Telemetry Co's Team yearly plan ended.",
  });

  // The hidden comp plan isn't a sale.
  const before = capture.requests.length;
  await webhook({
    plan_changes: [{ action: "activated", subscription: subscription("comp") }],
  });
  await sleep(2000);
  expect(capture.requests.slice(before).filter(ofOrganization)).toEqual([]);
});

test("deleting the organization and the account is reported as churn", async () => {
  // Owned alone, so it goes with the account.
  const sideId = await session.createOrganization("Telemetry Side Co");
  await session.destroy(organizationId);
  const organization = await capture.track(
    "organization_deleted",
    (request) => request.payload.properties?.organizationId === organizationId
  );
  expect(organization.payload.properties).toMatchObject({
    category: "churn",
    description: `${email} deleted Telemetry Co.`,
  });
  const account = await capture.track(
    "account_deleted",
    (request) => request.payload.profileId === profileId
  );
  expect(account.payload.properties).toMatchObject({
    category: "churn",
    description: `E2E telemetry (${email}) deleted their account.`,
  });
  const side = await capture.track(
    "organization_deleted",
    (request) => request.payload.properties?.organizationId === sideId
  );
  expect(side.payload.profileId).toBe(profileId);
  expect(side.payload.properties).toMatchObject({
    category: "churn",
    description: `${email} deleted Telemetry Side Co with their account.`,
    organizationName: "Telemetry Side Co",
  });
});

test("E2E and dev accounts are never reported", async () => {
  const before = capture.requests.length;
  const tester = await ApiSession.signUp(context, "telemetry-filtered");
  const workspace = await tester.bootstrap("Filtered Co", "Filtered Project");
  await createEvents(workspace.apiKey.secret, 1);
  // Unfiltered, these would be identify, new_signup, organization_created
  // and first_event_received.
  await sleep(3000);
  const reported = capture.requests
    .slice(before)
    .filter(
      (request) =>
        request.payload.email === tester.email ||
        request.payload.properties?.user_email === tester.email
    );
  expect(reported).toEqual([]);
  await tester.destroy(workspace.organizationId);
});

/**
 * Pages report to OpenPanel too (`web/ui/visits.ts`), but never from an
 * automated browser, so production E2E runs send nothing. This browser says
 * it isn't one.
 */
const actLikeAPerson = (page: Page) =>
  page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "webdriver", {
      get: () => false,
    });
  });

/** The first page view a page sent after request number `from`. */
const pageView = (
  from: number,
  where: (path: string, request: CapturedRequest) => boolean
) =>
  capture.waitFor(
    (request) =>
      capture.requests.indexOf(request) >= from &&
      request.type === "track" &&
      request.payload.name === "screen_view" &&
      request.headers.origin !== undefined &&
      where(String(request.payload.properties?.__path ?? ""), request),
    "OpenPanel never received the page view"
  );

const leaked = (from: number, secret: string) =>
  capture.requests
    .slice(from)
    .filter((request) => JSON.stringify(request).includes(secret));

test("site and docs pages report anonymous page views, private query left out", async ({
  page,
}) => {
  test.skip(!target.hasSite, "the deployment serves no site");
  const from = capture.requests.length;
  await actLikeAPerson(page);

  await page.goto(`${target.site}/?utm_source=e2e&token=private-site#top`);
  const home = await pageView(
    from,
    (path) => path === `${target.site}/?utm_source=e2e`
  );
  expect(home.payload.profileId).toBeUndefined();
  expect(home.headers).toMatchObject({
    clientId: "e2e-telemetry",
    hasClientSecret: false,
    origin: target.site,
  });

  // The docs swap pages with Astro's client router: each one still counts.
  await page.goto(`${target.site}/docs`);
  await pageView(from, (path) => path.startsWith(`${target.site}/docs`));
  await page.locator('a[href="/docs/getting-started"]').first().click();
  await pageView(
    from,
    (path) => path === `${target.site}/docs/getting-started`
  );

  expect(leaked(from, "private-site")).toEqual([]);
});

test("the dashboard names the signed-in user and forgets them at sign-out", async ({
  page,
}) => {
  const from = capture.requests.length;
  const visitor = `visits-${runId}@example.org`;
  await actLikeAPerson(page);

  // Reset links carry a token that must never leave the browser.
  await page.goto(`${target.app}/auth/reset-password?token=private-token`);
  await pageView(from, (path) => path === `${target.app}/auth/reset-password`);

  await page.goto(`${target.app}/auth/sign-up`);
  // Its page view means the route resolved: the form won't re-render empty.
  await pageView(from, (path) => path === `${target.app}/auth/sign-up`);
  const password = page.getByRole("textbox", { name: "Password" });
  await page.getByRole("textbox", { name: "Name" }).fill("Visits Person");
  await page.getByRole("textbox", { name: "Email" }).fill(visitor);
  // Earlier scenarios' sign-ups can trip Better Auth's sign-up rate limit.
  for (let attempt = 1; ; attempt += 1) {
    await password.fill(TEST_PASSWORD);
    const [response] = await Promise.all([
      page.waitForResponse((reply) =>
        reply.url().endsWith("/api/auth/sign-up/email")
      ),
      page.getByRole("button", { name: "Sign Up" }).click(),
    ]);
    if (response.status() !== 429 || attempt === 3) {
      expect(response.status()).toBe(200);
      break;
    }
    const wait = Number(response.headers()["x-retry-after"] ?? 10);
    await sleep((wait + 1) * 1000);
  }

  // The page names the user with the profile id the server reports under.
  const named = await capture.waitFor(
    (request) =>
      request.type === "identify" &&
      request.headers.origin === target.app &&
      request.payload.email === visitor,
    "the dashboard never identified the new user"
  );
  expect(named.payload).toMatchObject({ firstName: "Visits" });
  const signup = await capture.track(
    "new_signup",
    (request) => request.payload.properties?.user_email === visitor
  );
  expect(named.payload.profileId).toBe(signup.payload.profileId);
  await pageView(
    capture.requests.indexOf(named),
    (_path, request) => request.payload.profileId === named.payload.profileId
  );

  // Signing out in the app (no reload) makes the next views anonymous.
  const guide = page.getByRole("dialog", { name: "Setup guide" });
  if (await guide.isVisible()) {
    await guide.getByRole("button", { name: "I'll finish later" }).click();
  }
  const beforeSignOut = capture.requests.length;
  const paywallSignOut = page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign out" });
  if (await paywallSignOut.isVisible()) {
    await paywallSignOut.click();
  } else {
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
  }
  await expect(page).toHaveURL(/\/auth\/sign-in/u);
  const anonymous = await pageView(beforeSignOut, (path) =>
    path.startsWith(`${target.app}/auth/sign-in`)
  );
  expect(anonymous.payload.profileId).toBeUndefined();

  expect(leaked(from, "private-token")).toEqual([]);
});
