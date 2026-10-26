import { target, TEST_PASSWORD, testEmail } from "@e2e/support/targets";
import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

/**
 * The rest of Settings and the PWA chrome through the real UI: profile,
 * password change, organization rename and re-slug, the install prompt and
 * the "new version" notice, then deleting an organization and the account.
 *
 * Failure modes this guards against: a deleted organization's API keys still
 * authenticating, and an account deletion leaving behind an organization
 * whose keys keep accepting events.
 */
test.describe.configure({ mode: "serial" });

const email = testEmail("account");
const NEW_PASSWORD = `${TEST_PASSWORD}-rotated`;

interface Workspace {
  organizationId: string;
  organizationSlug: string;
  apiKey: { secret: string };
}

let page: Page;
let orgPath = "";
let firstKey = "";

const signInStatus = async (request: APIRequestContext, password: string) => {
  const response = await request.post(`${target.app}/api/auth/sign-in/email`, {
    data: { email, password },
    headers: { origin: target.origin },
  });
  return response.status();
};

const bootstrap = async (organizationName: string) => {
  const response = await page.request.post(
    `${target.app}/rpc/gettingStarted/bootstrap`,
    {
      data: { json: { organizationName, projectName: "Web" } },
      headers: { origin: target.origin },
    }
  );
  expect(response.ok(), `bootstrap → ${response.status()}`).toBe(true);
  const body: { json: Workspace } = await response.json();
  return body.json;
};

const eventStatus = async (request: APIRequestContext, key: string) => {
  const response = await request.post(`${target.api}/v1/events`, {
    data: { channelName: "account", title: "Key check" },
    headers: { authorization: `Bearer ${key}` },
  });
  return response.status();
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
      data: { email, name: "E2E Account", password: TEST_PASSWORD },
      headers: { origin: target.origin },
    }
  );
  expect(signUp.ok()).toBe(true);
  const workspace = await bootstrap("E2E Account Co");
  orgPath = `/${workspace.organizationSlug}`;
  firstKey = workspace.apiKey.secret;
});

test.afterAll(async () => {
  // The last test deletes everything; this only cleans up after a failure.
  for (const password of [TEST_PASSWORD, NEW_PASSWORD]) {
    if ((await signInStatus(page.request, password)) !== 200) {
      continue;
    }
    const organizations = await page.request.get(
      `${target.app}/api/auth/organization/list`,
      { headers: { origin: target.origin } }
    );
    const list: { id: string }[] = await organizations.json();
    for (const organization of list) {
      await page.request.post(`${target.app}/api/auth/organization/delete`, {
        data: { organizationId: organization.id },
        headers: { origin: target.origin },
      });
    }
    await page.request.post(`${target.app}/api/auth/delete-user`, {
      data: { password },
      headers: { origin: target.origin },
    });
  }
  await page.close();
});

test("profile: rename yourself", async () => {
  await openSettings("account");
  const name = page.getByRole("textbox", { name: "Name" });
  await expect(name).toHaveValue("E2E Account");
  await name.fill("E2E Renamed");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue(
    "E2E Renamed"
  );
  // Settings is a modal over the feed: Escape closes it and drops the param.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${orgPath}$`, "u"));
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(
    page.getByRole("dialog", { name: "Account menu" })
  ).toContainText("E2E Renamed");
  await page.keyboard.press("Escape");
});

test("password: change it, then only the new one signs in", async ({
  playwright,
}) => {
  await openSettings("account");
  await page
    .getByRole("textbox", { name: "Current password" })
    .fill(TEST_PASSWORD);
  await page.getByRole("textbox", { name: "New password" }).fill(NEW_PASSWORD);
  const changed = page.waitForResponse((response) =>
    response.url().includes("/api/auth/change-password")
  );
  await page.getByRole("button", { name: "Update password" }).click();
  const response = await changed;
  expect(response.status()).toBe(200);

  const fresh = await playwright.request.newContext();
  try {
    expect(await signInStatus(fresh, TEST_PASSWORD)).toBe(401);
    expect(await signInStatus(fresh, NEW_PASSWORD)).toBe(200);
  } finally {
    await fresh.dispose();
  }
});

test("organization: rename and re-slug", async () => {
  await openSettings("organization");
  const slug = `${orgPath.slice(1)}-renamed`;
  await page
    .getByRole("textbox", { name: "Organization name" })
    .fill("E2E Renamed Co");
  await page.getByRole("textbox", { name: "Slug" }).fill(slug);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Organization saved")).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`/${slug}\\?settings=organization$`, "u")
  );
  orgPath = `/${slug}`;

  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Organization name" })
  ).toHaveValue("E2E Renamed Co");
});

test("PWA: install prompt and new-version notice", async () => {
  await page.goto(`${target.app}${orgPath}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Events" })
  ).toBeVisible();

  // Chrome only fires beforeinstallprompt once its install criteria are
  // met, which a test profile never reaches; dispatch the same event.
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: () => {
        document.body.dataset.installPrompted = "yes";
        return Promise.resolve();
      },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);
  });
  const installCard = page.getByRole("complementary", {
    name: "Install EmitKit",
  });
  await expect(installCard).toBeVisible();
  await installCard.getByRole("button", { name: "Install app" }).click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-install-prompted",
    "yes"
  );
  await expect(installCard).toBeHidden();

  // A deploy changes the app shell's hashed entry script; serve one.
  const shell = await page.request.get(`${target.app}/`);
  test.skip(
    !/\/assets\/app-[\w-]+\.js/u.test(await shell.text()),
    "`vite dev` serves unhashed entry scripts; run against a build"
  );
  await page.route(`${target.app}/`, async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    await route.fulfill({
      body: html.replace(/\/assets\/app-[\w-]+\.js/u, "/assets/app-next.js"),
      response,
    });
  });
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange"))
  );
  await expect(
    page.getByText("A new version of EmitKit is available")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
  await page.unroute(`${target.app}/`);
});

test("deleting an organization revokes its API keys", async ({ request }) => {
  expect(await eventStatus(request, firstKey)).toBe(201);
  await openSettings("organization");
  await page.getByRole("button", { name: "Delete organization" }).click();
  const dialog = page.getByRole("alertdialog", {
    name: "Delete organization",
  });
  await expect(dialog).toContainText("E2E Renamed Co");
  await dialog.getByRole("button", { name: "Delete organization" }).click();
  // With no organization left, the front door makes a fresh workspace.
  await expect(page).toHaveURL(/\/[a-z0-9-]+\?guide=setup$/u);

  expect(await eventStatus(request, firstKey)).toBe(401);
});

test("deleting the account deletes the organizations it owns alone", async ({
  playwright,
  request,
}) => {
  const workspace = await bootstrap("E2E Account Two");
  orgPath = `/${workspace.organizationSlug}`;
  const key = workspace.apiKey.secret;
  expect(await eventStatus(request, key)).toBe(201);

  await openSettings("account");
  await page.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("alertdialog");
  const password = dialog.getByRole("textbox", { name: /password/iu });
  const confirm = dialog.getByRole("button", { name: /delete account/iu });

  // A wrong password must leave the account and its organizations intact.
  await password.fill("not-the-password-1");
  await confirm.click();
  await expect(page.getByText(/invalid password/iu)).toBeVisible();
  expect(await eventStatus(request, key)).toBe(201);

  await password.fill(NEW_PASSWORD);
  await confirm.click();
  await expect(page).toHaveURL(/\/auth\/sign-in/u);

  expect(await eventStatus(request, key)).toBe(401);
  const fresh = await playwright.request.newContext();
  try {
    expect(await signInStatus(fresh, NEW_PASSWORD)).toBe(401);
  } finally {
    await fresh.dispose();
  }
});
