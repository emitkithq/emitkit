import { target, TEST_PASSWORD, testEmail } from "@e2e/support/targets";
import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page, TestInfo } from "@playwright/test";

/**
 * The dashboard's critical journeys through the real UI, with events sent
 * through the public API: getting started, the live events feed, API keys,
 * members and organization switching. Projects and channels have their own
 * scenarios (10-projects, 11-channels).
 */
test.describe.configure({ mode: "serial" });

let page: Page;
let orgPath = "";
let starterKey = "";

const sendEvent = (
  request: APIRequestContext,
  key: string,
  body: Record<string, unknown>
) =>
  request.post(`${target.api}/v1/events`, {
    data: body,
    headers: { authorization: `Bearer ${key}` },
  });

const statusOf = async (pending: Promise<{ status: () => number }>) => {
  const response = await pending;
  return response.status();
};

const secretText = async (view: Page) => {
  const text = await view
    .getByTestId("one-time-secret")
    .locator("code")
    .first()
    .textContent();
  return text?.trim() ?? "";
};

/** The id of the organization's API key named `name`, through the dashboard RPC. */
const keyId = async (name: string) => {
  const response = await page.request.post(`${target.app}/rpc/apiKeys/list`, {
    data: { json: {} },
    headers: { origin: target.origin },
  });
  const body: { json: { id: string; name: string }[] } = await response.json();
  return body.json.find((key) => key.name === name)?.id ?? "";
};

/** `apiKeys.reveal` for `id`: 200 with the key, or 404 once it's gone. */
const revealStatus = async (id: string) => {
  const response = await page.request.post(`${target.app}/rpc/apiKeys/reveal`, {
    data: { json: { id } },
    headers: { origin: target.origin },
  });
  return response.status();
};

/** Attaches a screenshot of the shared page to the report. */
const snap = async (testInfo: TestInfo, name: string) => {
  await testInfo.attach(name, {
    body: await page.screenshot(),
    contentType: "image/png",
  });
};

const openSettings = async (section: string) => {
  await page.goto(`${target.app}${orgPath}?settings=${section}`);
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
};

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto(`${target.app}/auth/sign-in`);
  const signUp = await page.request.post(
    `${target.app}/api/auth/sign-up/email`,
    {
      data: {
        email: testEmail("dash"),
        name: "E2E Dash",
        password: TEST_PASSWORD,
      },
      headers: { origin: target.origin },
    }
  );
  expect(signUp.ok()).toBe(true);
});

test.afterAll(async () => {
  const organizations = await page.request.get(
    `${target.app}/api/auth/organization/list`,
    { headers: { origin: target.origin } }
  );
  const list: { id: string }[] = organizations.ok()
    ? await organizations.json()
    : [];
  for (const organization of list) {
    await page.request.post(`${target.app}/api/auth/organization/delete`, {
      data: { organizationId: organization.id },
      headers: { origin: target.origin },
    });
  }
  await page.request.post(`${target.app}/api/auth/delete-user`, {
    data: { password: TEST_PASSWORD },
    headers: { origin: target.origin },
  });
  await page.close();
});

test("setup guide: workspace, revealed key, first event, phone", async ({}, testInfo) => {
  await page.goto(`${target.app}/`);
  // A new user lands in a workspace made for them, with the guide open.
  await expect(page).toHaveURL(/\/[a-z0-9-]+\?guide=setup$/u);
  const guide = page.getByRole("dialog", { name: "Setup guide" });
  await expect(guide).toContainText("Welcome to EmitKit");

  // Step 1: the starter key is masked until revealed, then fills the snippet.
  const key = guide.locator("[data-api-key]");
  await expect(key).toContainText("••••");
  await snap(testInfo, "setup-guide");
  await guide.getByRole("button", { name: "Reveal" }).click();
  await expect(key).toHaveText(/^emitkit_[A-Za-z]{12}$/u);
  starterKey = (await key.textContent()) ?? "";
  await expect(
    guide.locator("code").filter({ hasText: "/v1/events" }).first()
  ).toContainText(`${target.api}/v1/events`);
  await expect(
    guide.locator("code").filter({ hasText: "/v1/events" }).first()
  ).toContainText(starterKey);

  // Step 2: an event from "your app" (curl) lands while the guide watches,
  // and it celebrates.
  const confetti = page.waitForSelector("canvas[data-confetti]", {
    state: "attached",
    timeout: 30_000,
  });
  const created = await sendEvent(page.request, starterKey, {
    channelName: "payments",
    icon: "💰",
    metadata: { amount: 49, plan: "pro" },
    tags: ["billing"],
    title: "New subscription",
  });
  expect(created.status()).toBe(201);
  await expect(guide.locator("[data-event-arrived]")).toBeVisible({
    timeout: 30_000,
  });
  await confetti;
  await snap(testInfo, "setup-guide-first-event");
  await expect(guide.locator('[data-step="2"]')).toHaveAttribute(
    "data-done",
    "true"
  );

  // Step 3 opens the phone setup, which offers a QR code on desktop.
  await guide.getByRole("button", { name: "Set up your phone" }).click();
  const phone = page.getByRole("dialog", {
    name: "Get EmitKit on your phone",
  });
  await expect(phone).toBeVisible();
  await expect(phone.getByRole("img", { name: /^Open http/u })).toBeVisible();
  await expect(phone).toContainText("Install app");
  await phone.getByRole("tab", { name: "iPhone" }).click();
  await expect(phone).toContainText("Add to Home Screen");
  await snap(testInfo, "phone-setup");
  await phone.getByRole("button", { name: "Done" }).click();
  await expect(phone).toBeHidden();

  await expect(
    page.getByRole("heading", { level: 1, name: "Events" })
  ).toBeVisible();
  orgPath = new URL(page.url()).pathname;
});

test("events feed: live updates, pulse, search, channel, details, delete", async () => {
  const rows = page.getByTestId("event-row");
  await expect(rows.filter({ hasText: "New subscription" })).toBeVisible();

  // Money at the top level of metadata is the event's value; the currency
  // may be sent in any case.
  expect(
    await statusOf(
      sendEvent(page.request, starterKey, {
        channelName: "payments",
        icon: "💳",
        metadata: {
          amount: 240,
          card: { brand: "visa", last4: "4242" },
          currency: "eur",
          durationMs: 1500,
          invoiceUrl: "https://example.com/invoices/42",
          plan: "Team",
        },
        title: "Annual upgrade",
      })
    )
  ).toBe(201);
  expect(
    await statusOf(
      sendEvent(page.request, starterKey, {
        channelName: "signups",
        icon: "🙋",
        title: "New user signed up",
      })
    )
  ).toBe(201);
  await expect(rows.filter({ hasText: "New user signed up" })).toBeVisible({
    timeout: 20_000,
  });
  const upgrade = rows.filter({ hasText: "Annual upgrade" });
  await expect(upgrade).toContainText("+€240");

  // The pulse counts the new events and sums the value ("New subscription"
  // has an amount but no currency, so it is not revenue).
  const pulse = page.getByRole("region", { name: "Pulse" });
  await expect(pulse).toContainText("Revenue");
  await expect(pulse).toContainText("€240", { timeout: 20_000 });

  await page
    .getByRole("searchbox", { name: "Search events" })
    .fill("subscription");
  await expect(rows.filter({ hasText: "New user signed up" })).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(rows.filter({ hasText: "New subscription" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search events" }).fill("");
  await expect(rows.filter({ hasText: "New user signed up" })).toBeVisible({
    timeout: 15_000,
  });

  // Details unfold under the event, fully scrolled into view.
  await upgrade.getByRole("button", { name: /Annual upgrade/u }).click();
  const metadata = upgrade.getByRole("region", { name: "Metadata" });
  await expect(metadata).toContainText("Invoice URL");
  await expect(metadata).toContainText("example.com/invoices/42");
  await expect(metadata).toContainText("Last 4");
  await expect(metadata).toContainText("2s");
  await expect(
    upgrade.getByRole("button", { name: "Delete “Annual upgrade”" })
  ).toBeInViewport();

  // The channel in the details filters the feed; the chip clears it.
  await upgrade.getByRole("link", { name: /#payments/u }).click();
  await expect(rows.filter({ hasText: "New user signed up" })).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(rows.filter({ hasText: "New subscription" })).toBeVisible();
  await page.getByRole("button", { name: /Show all channels/u }).click();
  await expect(rows.filter({ hasText: "New user signed up" })).toBeVisible({
    timeout: 15_000,
  });

  const payment = rows.filter({ hasText: "New subscription" });
  await payment.getByRole("button", { name: /New subscription/u }).click();
  await expect(payment).toContainText(/amount/iu);
  await expect(payment).toContainText("49");

  const signup = rows.filter({ hasText: "New user signed up" });
  await signup.getByRole("button", { name: /New user signed up/u }).click();
  await page
    .getByRole("button", { name: "Delete “New user signed up”" })
    .click();
  await page.getByRole("button", { name: "Delete event" }).click();
  await expect(signup).toHaveCount(0, { timeout: 15_000 });
});

test("events feed on a phone: long events stay on screen and read in full", async ({}, testInfo) => {
  const title =
    "Enterprise renewal escalated to the customer success leadership team for review before the quarter closes";
  const description =
    "Northwind Traders asked for a custom invoice schedule, see https://billing.example.com/accounts/northwind-traders-international/invoices/2026-10 or write to procurement-team@northwind-traders-international.example.com";
  const channelName = "customer-success-escalations-and-enterprise-renewals";
  await page.setViewportSize({ height: 844, width: 390 });
  try {
    expect(
      await statusOf(
        sendEvent(page.request, starterKey, {
          channelName,
          description,
          actions: [{ id: "approve", label: "Approve", style: "primary" }],
          icon: "🧯",
          metadata: {
            amount: 128_450,
            currency: "EUR",
            plan: "enterprise-annual-with-premium-support-and-dedicated-success-manager",
          },
          notify: true,
          title,
          userId:
            "procurement-team@northwind-traders-international.example.com",
        })
      )
    ).toBe(201);
    const row = page
      .getByTestId("event-row")
      .filter({ hasText: "Enterprise renewal" });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await snap(testInfo, "long-event-390-closed");

    // Nothing in the row shows past the screen's right edge (text a parent
    // cuts off with an ellipsis isn't shown), and the page never scrolls
    // sideways.
    const offScreen = () =>
      row.evaluate((article) =>
        [...article.querySelectorAll<HTMLElement>("*")]
          .filter((el) => {
            let { right } = el.getBoundingClientRect();
            for (
              let parent = el.parentElement;
              parent && parent !== article.parentElement;
              parent = parent.parentElement
            ) {
              if (getComputedStyle(parent).overflowX !== "visible") {
                right = Math.min(right, parent.getBoundingClientRect().right);
              }
            }
            return right > window.innerWidth;
          })
          .map((el) => el.textContent?.slice(0, 40) ?? el.tagName)
      );
    const pageScrollsSideways = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
    expect.soft(await offScreen()).toEqual([]);
    expect.soft(await pageScrollsSideways()).toBe(false);
    // Short on screen, in full for screen readers.
    await expect(row.getByText(/^Waiting/u).first()).toBeInViewport();
    await expect(
      row.getByRole("button", { name: /Waiting for an answer/u }).first()
    ).toBeVisible();

    // Opened, the title and description read in full: nothing cut off with
    // an ellipsis (wide blocks that scroll on their own aside).
    await row
      .getByRole("button", { name: /Enterprise renewal/u })
      .first()
      .click();
    await expect(row.getByRole("region", { name: "Metadata" })).toBeVisible();
    await expect(
      row.getByRole("button", { name: /Delete “Enterprise renewal/u })
    ).toBeInViewport();
    await snap(testInfo, "long-event-390-open");
    await expect(row.getByText(title, { exact: true })).toBeVisible();
    await expect(row).toContainText(
      "billing.example.com/accounts/northwind-traders-international/invoices/2026-10"
    );
    const clipped = await row.evaluate((article) =>
      [...article.querySelectorAll<HTMLElement>("*")]
        .filter(
          (el) =>
            ["clip", "hidden"].includes(getComputedStyle(el).overflowX) &&
            // Screen-reader-only text is clipped to 1px on purpose.
            el.clientWidth > 1 &&
            el.scrollWidth > el.clientWidth + 1
        )
        .map((el) => el.textContent?.slice(0, 40) ?? el.tagName)
    );
    expect.soft(clipped).toEqual([]);
    expect.soft(await offScreen()).toEqual([]);
    expect.soft(await pageScrollsSideways()).toBe(false);

    // On a wider screen a closed row keeps the description and the channel
    // on one line: the channel keeps a fair share of it (at most 45%), and
    // the time stays inside the row.
    await page.setViewportSize({ height: 720, width: 1280 });
    await row
      .getByRole("button", { name: /Enterprise renewal/u })
      .first()
      .click();
    await expect(row.getByRole("region", { name: "Metadata" })).toHaveCount(0);
    const boxOf = async (text: string) => {
      const box = await row.getByText(text).first().boundingBox();
      return box ?? { height: 0, width: 0, x: 0, y: -1 };
    };
    const descriptionBox = await boxOf("Northwind Traders asked");
    const channelBox = await boxOf(`#${channelName}`);
    const timeBox = (await row.locator("time").boundingBox()) ?? channelBox;
    const rowBox = (await row.boundingBox()) ?? channelBox;
    expect(descriptionBox.y).toBeGreaterThan(0);
    expect(Math.abs(descriptionBox.y - channelBox.y)).toBeLessThan(2);
    expect(channelBox.width).toBeGreaterThan(rowBox.width * 0.3);
    expect(timeBox.x + timeBox.width).toBeLessThanOrEqual(
      rowBox.x + rowBox.width
    );
  } finally {
    await page.setViewportSize({ height: 720, width: 1280 });
  }
});

test("API keys: create, rotate, revoke", async () => {
  await openSettings("api-keys");
  await page.getByRole("textbox", { name: "Key name" }).fill("CI deploys");
  await page.getByRole("button", { name: "Create API key" }).click();
  const secret = page.getByTestId("one-time-secret");
  await expect(secret).toContainText("emitkit_");
  const created = await secretText(page);
  expect(
    await statusOf(
      sendEvent(page.request, created, {
        channelName: "deploys",
        title: "Deploy via new key",
      })
    )
  ).toBe(201);

  // Owners can reveal the key again later.
  await page
    .getByTestId("one-time-secret")
    .getByRole("button", { name: "Done" })
    .click();
  await expect(page.getByTestId("one-time-secret")).toHaveCount(0);
  await page.getByRole("button", { name: "Reveal CI deploys" }).click();
  await expect(page.getByTestId("one-time-secret")).toContainText(created);
  const firstId = await keyId("CI deploys");
  expect(await revealStatus(firstId)).toBe(200);

  await page.getByRole("button", { name: "Rotate CI deploys" }).click();
  await page.getByRole("button", { name: "Rotate key" }).click();
  await expect(page.getByTestId("one-time-secret")).not.toContainText(created);
  const rotated = await secretText(page);
  expect(rotated).toMatch(/^emitkit_/u);
  expect(
    await statusOf(
      sendEvent(page.request, created, {
        channelName: "deploys",
        title: "old key",
      })
    )
  ).toBe(401);
  expect(
    await statusOf(
      sendEvent(page.request, rotated, {
        channelName: "deploys",
        title: "Deploy via rotated key",
      })
    )
  ).toBe(201);
  // The old key's sealed copy went with it.
  expect(await revealStatus(firstId)).toBe(404);
  const rotatedId = await keyId("CI deploys");

  await page.getByRole("button", { name: "Revoke CI deploys" }).click();
  await page.getByRole("button", { name: "Revoke key" }).click();
  await expect(
    page.getByTestId("api-key-row").filter({ hasText: "CI deploys" })
  ).toHaveCount(0);
  expect(
    await statusOf(
      sendEvent(page.request, rotated, {
        channelName: "deploys",
        title: "revoked",
      })
    )
  ).toBe(401);
  expect(await revealStatus(rotatedId)).toBe(404);
});

test("settings: a modal over the current page; old addresses redirect", async () => {
  // The settings page's old address opens the modal over the feed.
  await page.goto(`${target.app}${orgPath}/settings?section=members`);
  await expect(page).toHaveURL(
    new RegExp(`${orgPath}\\?settings=members$`, "u")
  );
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible();

  // Opened from Projects, it stays on Projects: switching sections and
  // closing only change the `settings` param.
  await page.goto(`${target.app}${orgPath}/projects`);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(settings).toBeVisible();
  await settings.getByRole("link", { name: "API keys" }).click();
  await expect(page).toHaveURL(
    new RegExp(`${orgPath}/projects\\?settings=api-keys$`, "u")
  );
  await settings.getByRole("button", { name: /close/iu }).click();
  await expect(settings).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${orgPath}/projects$`, "u"));
  await expect(
    page.getByRole("heading", { level: 1, name: "Projects" })
  ).toBeVisible();
});

test("members: invite and cancel", async () => {
  await openSettings("members");
  const invitee = testEmail("invitee");
  await page.getByRole("textbox", { name: "Email" }).fill(invitee);
  await page
    .getByRole("combobox", { name: "Role" })
    .selectOption({ label: "Admin" }, { force: true });
  await page.getByRole("button", { name: "Send invitation" }).click();
  const pending = page
    .getByRole("list", { name: "Pending invitations" })
    .or(page.getByLabel("Pending invitations"));
  await expect(pending).toContainText(invitee);
  const cancel = page.getByRole("button", {
    name: `Cancel invitation for ${invitee}`,
  });
  await cancel.click();
  await expect(cancel).toHaveCount(0, { timeout: 15_000 });
});

test("members: an unverified invitee is asked to verify before accepting", async ({
  browser,
}) => {
  await openSettings("members");
  const invitee = testEmail("joiner");
  await page.getByRole("textbox", { name: "Email" }).fill(invitee);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(invitee).first()).toBeVisible();

  const organizationId = await page.evaluate(async () => {
    const response = await fetch("/api/auth/get-session", {
      credentials: "include",
    });
    const body: { session: { activeOrganizationId: string } } =
      await response.json();
    return body.session.activeOrganizationId;
  });
  const invitations = await page.request.get(
    `${target.app}/api/auth/organization/list-invitations?organizationId=${organizationId}`,
    { headers: { origin: target.origin } }
  );
  const pendingList: { id: string; email: string; status: string }[] =
    await invitations.json();
  const invitation = pendingList.find(
    (candidate) => candidate.email === invitee && candidate.status === "pending"
  );
  expect(invitation).toBeDefined();

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  try {
    await guest.goto(`${target.app}/auth/sign-in`);
    const signUp = await guest.request.post(
      `${target.app}/api/auth/sign-up/email`,
      {
        data: { email: invitee, name: "E2E Joiner", password: TEST_PASSWORD },
        headers: { origin: target.origin },
      }
    );
    expect(signUp.ok()).toBe(true);
    await guest.goto(`${target.app}/accept-invitation/${invitation?.id ?? ""}`);
    // Invitations require a verified address; the email link completes the
    // join (verified by hand against the inbox, see the report notes).
    await expect(guest.getByText("Verify your email first")).toBeVisible();
    await guest
      .getByRole("button", { name: "Send verification email" })
      .click();
    await expect(
      guest.getByRole("button", { name: "Check your inbox" })
    ).toBeVisible();
    // Joining through an invitation doesn't make a workspace of your own.
    const joinerOrganizations = await guest.request.get(
      `${target.app}/api/auth/organization/list`,
      { headers: { origin: target.origin } }
    );
    expect(await joinerOrganizations.json()).toEqual([]);
  } finally {
    await guest.request.post(`${target.app}/api/auth/delete-user`, {
      data: { password: TEST_PASSWORD },
      headers: { origin: target.origin },
    });
    await guestContext.close();
  }
});

test("organization switcher keeps workspaces apart", async () => {
  await page.goto(`${target.app}${orgPath}`);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Create organization" }).click();
  const dialog = page.getByRole("dialog", { name: "Create organization" });
  await dialog
    .getByRole("textbox", { name: "Organization name" })
    .fill("E2E Second Co");
  await dialog.getByRole("button", { name: "Create organization" }).click();
  await expect(page).toHaveURL(/\/e2e-second-co/u, { timeout: 20_000 });
  await expect(page.getByTestId("event-row")).toHaveCount(0);

  await page.getByRole("button", { name: "Account menu" }).click();
  await page
    .getByRole("list", { name: "Switch organization" })
    // The first workspace was made at sign-up, named after its owner.
    .getByRole("button", { name: "E2E's workspace" })
    .click();
  await expect(page).toHaveURL(new RegExp(`${orgPath}$`, "u"), {
    timeout: 20_000,
  });
  await expect(
    page.getByTestId("event-row").filter({ hasText: "New subscription" })
  ).toBeVisible();
});
