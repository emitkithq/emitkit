import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { ApiSession } from "@e2e/support/api-session";
import { target } from "@e2e/support/targets";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

/**
 * Screenshots of every dashboard screen and state, for visual review. Not a
 * scenario: it asserts only what it needs to reach each state. Run it
 * against `pnpm dev` with the seeded database:
 *
 *   CAPTURE_OUT=<dir> pnpm exec playwright test --config e2e/capture/playwright.config.ts
 *
 * Writes `<dir>/<theme>/<width>/<screen>.png` for light and dark at 1440
 * and 390 px, and `<dir>/console-errors.txt`. Signs in with "Continue in
 * local dev" (dev@example.com, the seeded EmitKit workspace) and signs up one
 * throwaway user for the no-workspace, invitation, empty and long-content
 * states. The throwaway user, its workspace, the invitation and the dev
 * session are removed at the end.
 */
type Theme = "dark" | "light";
type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

const OUT = process.env.CAPTURE_OUT ?? "test-results/capture";
const THEMES = (process.env.CAPTURE_THEMES ?? "light,dark").split(
  ","
) as Theme[];
const WIDTHS = [
  { height: 900, name: "1440", width: 1440 },
  { height: 844, name: "390", width: 390 },
] as const;
type Width = (typeof WIDTHS)[number];

const LONG = {
  channel: "customer-success-escalations-and-enterprise-renewals",
  description:
    "Every product surface of the Northwind platform, from the storefront and the partner portal to the billing engine, reports here so on-call can see the whole business in one place.",
  // Slug under 49 characters: the build before this polish failed longer
  // ones (D1 LIKE limit), and before/after should show the same data.
  project: "Northwind Traders International Commerce",
  url: "https://checkout.northwind-traders-international.example.com/store",
};

const consoleErrors: string[] = [];
const state: {
  devState?: StorageState;
  guest?: ApiSession;
  guestState?: StorageState;
  invitationId?: string;
  workspace?: Awaited<ReturnType<ApiSession["bootstrap"]>>;
} = {};

const openContext = async (
  browser: Browser,
  theme: Theme,
  width: Width,
  storageState?: StorageState
) => {
  const context = await browser.newContext({
    colorScheme: theme,
    storageState,
    viewport: { height: width.height, width: width.width },
  });
  await context.addInitScript((value) => {
    window.localStorage.setItem("emitkit:theme", value);
    // No install banner in the shots.
    window.localStorage.setItem(
      "emitkit:install-prompt-dismissed",
      String(Date.now())
    );
  }, theme);
  return context;
};

/** Strips query strings (Parsew logo URLs carry a publishable token). */
const withoutQuery = (url: string) => url.split("?")[0] ?? url;

const watch = (page: Page, label: string) => {
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(`[${label}] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(`[${label}] pageerror: ${error.message}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      consoleErrors.push(
        `[${label}] ${response.status()} ${withoutQuery(response.url())}`
      );
    }
  });
};

const settle = async (page: Page) => {
  await page.waitForLoadState("networkidle").catch(() => null);
  // Fonts, brand icons and entry transitions.
  await page.waitForTimeout(700);
};

const shoot = async (
  page: Page,
  dir: string,
  name: string,
  { fullPage = true }: { fullPage?: boolean } = {}
) => {
  await settle(page);
  await page.screenshot({ fullPage, path: path.join(dir, `${name}.png`) });
};

const serverError = {
  body: JSON.stringify({
    json: {
      code: "INTERNAL_SERVER_ERROR",
      defined: false,
      message: "Internal server error",
      status: 500,
    },
  }),
  contentType: "application/json",
  status: 500,
};

/** Opens a list row's "…" menu (this build's projects and channels). */
const openRowMenu = async (page: Page, label: string) => {
  const trigger = page.getByRole("button", { name: `Actions for ${label}` });
  if ((await trigger.count()) === 0) {
    return false;
  }
  await trigger.click();
  return true;
};

/** Replaces API key secrets on the page, so no screenshot carries one. */
const hideSecrets = (page: Page) =>
  page.evaluate(() => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.textContent?.includes("emitkit_")) {
        node.textContent = node.textContent.replaceAll(
          /emitkit_[A-Za-z0-9_-]+/gu,
          "emitkit_••••••••••••"
        );
      }
    }
  });

/** The Channels screen, when this build has one. */
const hasChannelsScreen = async (page: Page, org: string) => {
  await page.goto(`${target.app}/${org}/channels`);
  const heading = page.getByRole("heading", { level: 1, name: "Channels" });
  const found = await heading
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  await settle(page);
  return found;
};

const shootSignedOut = async (browser: Browser, theme: Theme, width: Width) => {
  const dir = path.join(OUT, theme, width.name);
  const context = await openContext(browser, theme, width);
  const page = await context.newPage();
  watch(page, `${theme}/${width.name}`);
  await page.goto(`${target.app}/auth/sign-in`);
  await shoot(page, dir, "auth-sign-in");
  await page.getByRole("textbox", { name: "Email" }).fill("dev@example.com");
  await page
    .getByRole("textbox", { name: "Password" })
    .fill("not-the-password-1");
  await page.getByRole("button", { exact: true, name: "Sign In" }).click();
  await page.waitForTimeout(1200);
  await shoot(page, dir, "auth-sign-in-wrong-password");
  await page.goto(`${target.app}/auth/sign-up`);
  await shoot(page, dir, "auth-sign-up");
  await page.goto(`${target.app}/auth/forgot-password`);
  await shoot(page, dir, "auth-forgot-password");
  await context.close();
};

const shootWorkspace = async (browser: Browser, theme: Theme, width: Width) => {
  const dir = path.join(OUT, theme, width.name);
  const context = await openContext(browser, theme, width, state.devState);
  const page = await context.newPage();
  watch(page, `${theme}/${width.name}`);

  // Feed.
  await page.goto(`${target.app}/emitkit`);
  await expect(page.getByTestId("event-row").first()).toBeVisible();
  await shoot(page, dir, "feed", { fullPage: false });
  await page
    .getByTestId("event-row")
    .first()
    .getByRole("button")
    .first()
    .click();
  await shoot(page, dir, "feed-event-details", { fullPage: false });
  await page.goto(`${target.app}/emitkit?search=zzzz-nothing-matches`);
  await shoot(page, dir, "feed-no-results", { fullPage: false });

  await page.route("**/rpc/events/**", async (route) => {
    await sleep(5000);
    await route.continue().catch(() => null);
  });
  await page.goto(`${target.app}/emitkit`);
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(dir, "feed-loading.png") });
  await page.unroute("**/rpc/events/**");
  await page.route("**/rpc/events/**", (route) => route.fulfill(serverError));
  await page.goto(`${target.app}/emitkit`);
  await expect(page.getByText("Events unavailable")).toBeVisible({
    timeout: 20_000,
  });
  await shoot(page, dir, "feed-error", { fullPage: false });
  await page.unroute("**/rpc/events/**");

  // Menus.
  await page.goto(`${target.app}/emitkit`);
  await settle(page);
  await page.getByRole("button", { name: "Account menu" }).click();
  await shoot(page, dir, "user-menu", { fullPage: false });
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+k");
  await shoot(page, dir, "command-palette", { fullPage: false });
  await page.keyboard.press("Escape");

  // Projects.
  await page.goto(`${target.app}/emitkit/projects`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await shoot(page, dir, "projects");
  await page
    .getByRole("button", { name: /Create project/u })
    .first()
    .click();
  await shoot(page, dir, "project-dialog-create", { fullPage: false });
  await page.keyboard.press("Escape");
  if (await openRowMenu(page, "Cal.com")) {
    await shoot(page, dir, "projects-row-menu", { fullPage: false });
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await shoot(page, dir, "project-dialog-edit", { fullPage: false });
    await page.keyboard.press("Escape");
    await openRowMenu(page, "Cal.com");
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await shoot(page, dir, "project-confirm-delete", { fullPage: false });
    await page.getByRole("button", { name: "Cancel" }).click();
  }
  await page.route("**/rpc/projects/list", (route) =>
    route.fulfill(serverError)
  );
  await page.goto(`${target.app}/emitkit/projects`);
  await expect(page.getByText("Projects unavailable")).toBeVisible({
    timeout: 20_000,
  });
  await shoot(page, dir, "projects-error", { fullPage: false });
  await page.unroute("**/rpc/projects/list");

  // Channels.
  if (await hasChannelsScreen(page, "emitkit")) {
    await shoot(page, dir, "channels");
    await page
      .getByRole("button", { name: /Create channel/u })
      .first()
      .click();
    await shoot(page, dir, "channel-dialog-create", { fullPage: false });
    await page.keyboard.press("Escape");
    await openRowMenu(page, "#bookings");
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await shoot(page, dir, "channel-dialog-edit", { fullPage: false });
    await page.keyboard.press("Escape");
    await openRowMenu(page, "#bookings");
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await shoot(page, dir, "channel-confirm-delete", { fullPage: false });
    await page.getByRole("button", { name: "Cancel" }).click();
  }

  // Settings.
  for (const section of [
    "members",
    "organization",
    "api-keys",
    "notifications",
    "account",
  ]) {
    await page.goto(`${target.app}/emitkit?settings=${section}`);
    await expect(page.getByRole("dialog")).toBeVisible();
    await shoot(page, dir, `settings-${section}`, { fullPage: false });
  }

  await page.goto(`${target.app}/emitkit/does-not-exist`);
  await shoot(page, dir, "not-found", { fullPage: false });
  await context.close();

  // The throwaway user, before it has a workspace.
  const guestContext = await openContext(
    browser,
    theme,
    width,
    state.guestState
  );
  const guestPage = await guestContext.newPage();
  watch(guestPage, `${theme}/${width.name}`);
  await guestPage.goto(
    `${target.app}/accept-invitation/${state.invitationId ?? "missing"}`
  );
  await shoot(guestPage, dir, "accept-invitation");
  await guestPage.goto(`${target.app}/accept-invitation/inv_missing`);
  await shoot(guestPage, dir, "accept-invitation-missing");
  await guestContext.close();
};

/** Runs `shots` for every theme and width with the throwaway user. */
const forEachView = async (
  browser: Browser,
  shots: (page: Page, dir: string) => Promise<void>
) => {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      const dir = path.join(OUT, theme, width.name);
      const context = await openContext(
        browser,
        theme,
        width,
        state.guestState
      );
      const page = await context.newPage();
      watch(page, `${theme}/${width.name}`);
      await shots(page, dir);
      await context.close();
    }
  }
};

const shootView = async (browser: Browser, theme: Theme, width: Width) => {
  mkdirSync(path.join(OUT, theme, width.name), { recursive: true });
  await shootSignedOut(browser, theme, width);
  await shootWorkspace(browser, theme, width);
};

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${target.app}/auth/sign-in`);
  await page.getByRole("button", { name: "Continue in local dev" }).click();
  await expect(page).toHaveURL(
    (url) => url.pathname !== "/" && !url.pathname.startsWith("/auth/")
  );
  state.devState = await context.storageState();

  // A throwaway user with no workspace, invited to the seeded workspace.
  const guestContext = await browser.newContext();
  state.guest = await ApiSession.signUp(guestContext.request, "capture");
  state.guestState = await guestContext.storageState();
  const listed = await context.request.get(
    `${target.app}/api/auth/organization/list`
  );
  const organizations: { id: string; slug: string }[] = await listed.json();
  const workspace = organizations.find(
    (organization) => organization.slug === "emitkit"
  );
  const invite = await context.request.post(
    `${target.app}/api/auth/organization/invite-member`,
    {
      data: {
        email: state.guest.email,
        organizationId: workspace?.id,
        role: "member",
      },
      headers: { origin: target.origin },
    }
  );
  const invitation: { id: string } = await invite.json();
  state.invitationId = invitation.id;
  await context.close();
});

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: state.devState });
  if (state.invitationId) {
    await context.request.post(
      `${target.app}/api/auth/organization/cancel-invitation`,
      {
        data: { invitationId: state.invitationId },
        headers: { origin: target.origin },
      }
    );
  }
  await context.request.post(`${target.app}/api/auth/sign-out`, {
    data: {},
    headers: { origin: target.origin },
  });
  await context.close();
  await state.guest?.destroy(state.workspace?.organizationId);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    path.join(OUT, "console-errors.txt"),
    consoleErrors.length > 0 ? `${consoleErrors.join("\n")}\n` : "none\n"
  );
});

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test(`${theme} ${width.name}`, ({ browser }) =>
      shootView(browser, theme, width));
  }
}

test("empty, long-content and deleted states", async ({ browser }) => {
  const { guest } = state;
  if (!guest) {
    throw new Error("the throwaway user was not created");
  }
  const workspace = await guest.bootstrap("Empty Co", "Empty App");
  state.workspace = workspace;
  const org = workspace.organizationSlug;

  await forEachView(browser, async (page, dir) => {
    await page.goto(`${target.app}/${org}`);
    await shoot(page, dir, "feed-empty", { fullPage: false });
    await page.goto(`${target.app}/${org}/projects`);
    await shoot(page, dir, "projects-one");
    if (await hasChannelsScreen(page, org)) {
      await shoot(page, dir, "channels-empty");
    }
  });

  // Long names, descriptions, URLs and event text.
  await sleep(10_000);
  const project = await guest.rpc<{ id: string }>("projects/create", {
    description: LONG.description,
    name: LONG.project,
    url: LONG.url,
  });
  await guest.rpc("channels/create", {
    description: LONG.description,
    icon: "🧯",
    name: LONG.channel,
    projectId: project.id,
  });
  const key = await guest.rpc<{ secret: string }>("apiKeys/create", {
    name: "Capture",
    projectId: project.id,
  });
  const sent = await fetch(`${target.api}/v1/events`, {
    body: JSON.stringify({
      channelName: LONG.channel,
      description: `${LONG.description} See ${LONG.url} or write to escalations@northwind-traders-international.example.com.`,
      icon: "🧯",
      metadata: {
        account: "Northwind Traders International Commerce Platform, EMEA",
        amount: 128_450,
        currency: "EUR",
        plan: "enterprise-annual-with-premium-support-and-dedicated-success-manager",
      },
      title:
        "Enterprise renewal escalated to the customer success leadership team for review",
      userId: "procurement-team@northwind-traders-international.example.com",
    }),
    headers: {
      authorization: `Bearer ${key.secret}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  expect(sent.status).toBe(201);

  await forEachView(browser, async (page, dir) => {
    await page.goto(`${target.app}/${org}`);
    await expect(page.getByTestId("event-row").first()).toBeVisible();
    await page
      .getByTestId("event-row")
      .first()
      .getByRole("button")
      .first()
      .click();
    await shoot(page, dir, "feed-long");
    await page.goto(`${target.app}/${org}/projects`);
    await shoot(page, dir, "projects-long");
    if (await hasChannelsScreen(page, org)) {
      await shoot(page, dir, "channels-long");
    }
  });

  // Every project deleted: the empty and deleted states. After a pause:
  // this many page loads from one address meet Better Auth's rate limit
  // (100 requests per 10 seconds), which real use doesn't.
  await sleep(10_000);
  await guest.rpc("projects/remove", { id: workspace.project.id });
  await guest.rpc("projects/remove", { id: project.id });
  await forEachView(browser, async (page, dir) => {
    await page.goto(`${target.app}/${org}/projects`);
    await shoot(page, dir, "projects-empty");
    const deletedTab = page.getByRole("radio", { name: /Deleted/u });
    if ((await deletedTab.count()) > 0) {
      await deletedTab.click();
      await shoot(page, dir, "projects-deleted");
    }
    if (await hasChannelsScreen(page, org)) {
      await shoot(page, dir, "channels-no-projects");
    }
  });
});

test("getting started, step 2: the starter key", async ({ browser }) => {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      // Better Auth allows three sign-ups per 10 seconds from one address.
      await sleep(12_000);
      const dir = path.join(OUT, theme, width.name);
      const context = await openContext(browser, theme, width);
      const newcomer = await ApiSession.signUp(
        context.request,
        `capture-${theme}-${width.name}`
      );
      const page = await context.newPage();
      watch(page, `${theme}/${width.name}`);
      // A new user lands in a workspace made for them, with the setup guide.
      await page.goto(`${target.app}/`);
      const guide = page.getByRole("dialog", { name: "Setup guide" });
      await expect(guide).toBeVisible();
      await settle(page);
      await hideSecrets(page);
      await page.screenshot({ path: path.join(dir, "setup-guide.png") });
      await guide.getByRole("button", { name: "Set up your phone" }).click();
      await expect(
        page.getByRole("dialog", { name: "Get EmitKit on your phone" })
      ).toBeVisible();
      await settle(page);
      await hideSecrets(page);
      await page.screenshot({ path: path.join(dir, "phone-setup.png") });
      const listed = await context.request.get(
        `${target.app}/api/auth/organization/list`
      );
      const organizations: { id: string }[] = await listed.json();
      await newcomer.destroy(organizations[0]?.id);
      await context.close();
    }
  }
});
