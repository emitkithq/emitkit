import { attachHttpLog, recordResponse } from "@e2e/support/http-log";
import { target, TEST_PASSWORD, testEmail } from "@e2e/support/targets";
import { expect, test } from "@playwright/test";
import type { Browser, Page, TestInfo } from "@playwright/test";

/**
 * The paywall's brand and recipes (hosted: billing on and
 * CONTEXT_DEV_API_KEY set, both in .dev.vars locally). A new organization's
 * owner signs up with a work address; the paywall reads their domain from
 * Context.dev, gives the organization the brand's name and icon, and shows
 * the pushes that kind of business would get. The owner corrects it with a
 * website or by picking a kind of business. A mailbox address (gmail.com)
 * is never looked up.
 *
 * Locally the work address is on `E2E_BRAND_DOMAIN` (linear.app); mail
 * isn't delivered under `pnpm dev`. Other targets sign up with their usual
 * mailbox and only exercise the website lookup.
 */
test.describe.configure({ mode: "serial" });

const WORK_DOMAIN = process.env.E2E_BRAND_DOMAIN ?? "linear.app";
const WEBSITE = process.env.E2E_BRAND_WEBSITE ?? "shopify.com";

interface Account {
  page: Page;
  organizationId: string;
  orgSlug: string;
}

interface Brand {
  status: "found" | "none" | "off";
  domain: string | null;
  name: string | null;
  iconUrl: string | null;
  industry: string | null;
  segment: string | null;
  canLookup: boolean;
}

const accounts: Account[] = [];
/** Organizations created besides each account's first; deleted before it. */
const extraOrganizations: { page: Page; organizationId: string }[] = [];

const rpc = async <T>(page: Page, procedure: string, input: unknown = {}) => {
  const url = `${target.app}/rpc/${procedure}`;
  const raw = await page.request.post(url, {
    data: { json: input },
    headers: { origin: target.origin },
  });
  const response = await recordResponse("POST", url, input, raw);
  const body: { json: T } = await response.json();
  return { body: body.json, status: response.status() };
};

/** Signs up `email` and opens the workspace made for it. */
const signUp = async (browser: Browser, email: string): Promise<Account> => {
  const page = await browser.newPage();
  await page.goto(`${target.app}/auth/sign-in`);
  const response = await page.request.post(
    `${target.app}/api/auth/sign-up/email`,
    {
      data: { email, name: "E2E Brand", password: TEST_PASSWORD },
      headers: { origin: target.origin },
    }
  );
  expect(response.ok()).toBe(true);
  const { body } = await rpc<{
    organizationId: string;
    organizationSlug: string;
  }>(page, "gettingStarted/ensureWorkspace");
  await page.request.post(`${target.app}/api/auth/organization/set-active`, {
    data: { organizationId: body.organizationId },
    headers: { origin: target.origin },
  });
  const account = {
    orgSlug: body.organizationSlug,
    organizationId: body.organizationId,
    page,
  };
  accounts.push(account);
  return account;
};

/** Billing and brand lookups are both configured on this server. */
const hosted = async (page: Page) => {
  const billing = await rpc<{ state: string }>(page, "billing/status", {});
  return billing.body.state === "required";
};

const snap = async (page: Page, testInfo: TestInfo, name: string) => {
  await testInfo.attach(name, {
    body: await page.screenshot(),
    contentType: "image/png",
  });
};

const workEmail = (label: string) =>
  target.name === "local"
    ? `e2e-${label}-${Date.now().toString(36)}@${WORK_DOMAIN}`
    : testEmail(label);

test.afterEach(async ({}, testInfo) => {
  await attachHttpLog(testInfo);
});

test.afterAll(async () => {
  for (const { organizationId, page } of extraOrganizations) {
    await page.request.post(`${target.app}/api/auth/organization/delete`, {
      data: { organizationId },
      headers: { origin: target.origin },
    });
  }
  for (const { organizationId, page } of accounts) {
    await page.request.post(`${target.app}/api/auth/organization/delete`, {
      data: { organizationId },
      headers: { origin: target.origin },
    });
    await page.request.post(`${target.app}/api/auth/delete-user`, {
      data: { password: TEST_PASSWORD },
      headers: { origin: target.origin },
    });
    await page.close();
  }
});

test("a work address brands the organization and picks its recipes", async ({
  browser,
}, testInfo) => {
  test.skip(target.name !== "local", "needs a work address that gets no mail");
  const { orgSlug, page } = await signUp(browser, workEmail("work"));
  test.skip(!(await hosted(page)), "billing is off on this server");

  await page.goto(`${target.app}/${orgSlug}`);
  const paywall = page.getByRole("dialog", { name: "Start your free trial" });
  await expect(paywall).toBeVisible();
  const brand = await rpc<Brand>(page, "workspace/brand");
  test.skip(brand.body.status === "off", "CONTEXT_DEV_API_KEY is unset");
  expect(brand.body).toMatchObject({
    canLookup: true,
    domain: WORK_DOMAIN,
    status: "found",
  });
  expect(brand.body.iconUrl).toMatch(/^https:\/\//u);

  // The brand, its kind of business, and the pushes it would get.
  await expect(paywall).toContainText(brand.body.name ?? WORK_DOMAIN);
  await expect(paywall).toContainText("actually wants.");
  await expect(
    paywall.locator(`[data-segment="${brand.body.segment}"]`)
  ).toBeVisible();
  const cards = paywall.getByRole("list", { name: "Example notifications" });
  await expect(cards.getByRole("figure")).toHaveCount(4);
  await expect(paywall).toContainText("Not a log drain");

  // The organization took the brand's name and icon (the slug stays).
  const header = page.locator("[data-app-header]");
  await expect(header).toContainText(brand.body.name ?? "");
  await expect(
    header.locator(`img[src="${brand.body.iconUrl}"]`)
  ).toBeVisible();
  const organization = await rpc<{
    organizationName: string;
    organizationSlug: string;
  }>(page, "workspace/current");
  expect(organization.body).toMatchObject({
    organizationName: brand.body.name,
    organizationSlug: orgSlug,
  });
  await snap(page, testInfo, "paywall-work-brand");

  // A second organization isn't branded from the owner's email domain.
  const created = await page.request.post(
    `${target.app}/api/auth/organization/create`,
    {
      data: { name: "Side project", slug: `side-project-${Date.now()}` },
      headers: { origin: target.origin },
    }
  );
  expect(created.ok()).toBe(true);
  const side: { id: string } = await created.json();
  extraOrganizations.push({ organizationId: side.id, page });
  await page.request.post(`${target.app}/api/auth/organization/set-active`, {
    data: { organizationId: side.id },
    headers: { origin: target.origin },
  });
  const sideBrand = await rpc<Brand>(page, "workspace/brand");
  expect(sideBrand.body).toMatchObject({
    canLookup: true,
    domain: null,
    iconUrl: null,
    status: "none",
  });
});

test("the owner corrects the brand with their website, or picks by hand", async ({
  browser,
}, testInfo) => {
  const { orgSlug, page } = await signUp(browser, workEmail("website"));
  test.skip(!(await hosted(page)), "billing is off on this server");
  await page.goto(`${target.app}/${orgSlug}`);
  const paywall = page.getByRole("dialog", { name: "Start your free trial" });
  await expect(paywall).toBeVisible();
  const before = await rpc<Brand>(page, "workspace/brand");
  test.skip(before.body.status === "off", "CONTEXT_DEV_API_KEY is unset");

  const chip = paywall.locator("[data-segment] button").first();
  await chip.click();
  const picker = page.getByRole("dialog", { name: "What do you build?" });
  await expect(picker).toBeVisible();

  // Not a website: refused before anything is looked up.
  await picker.getByLabel("Your website").fill("localhost");
  await picker.getByRole("button", { name: "Look up" }).click();
  await expect(picker.getByRole("alert")).toContainText(
    "Enter your website, like acme.com."
  );

  await picker.getByLabel("Your website").fill(`https://www.${WEBSITE}/`);
  await picker.getByRole("button", { name: "Look up" }).click();
  await expect(picker).toBeHidden({ timeout: 30_000 });
  const after = await rpc<Brand>(page, "workspace/brand");
  expect(after.body).toMatchObject({ domain: WEBSITE, status: "found" });
  await expect(paywall).toContainText(after.body.name ?? WEBSITE);
  await expect(
    paywall.locator(`[data-segment="${after.body.segment}"]`)
  ).toBeVisible();
  await expect(page.locator("[data-app-header]")).toContainText(
    after.body.name ?? ""
  );
  await snap(page, testInfo, "paywall-website-brand");

  // Picking a kind of business by hand changes the recipes.
  await paywall.locator("[data-segment] button").first().click();
  await picker.getByRole("button", { name: "Fintech" }).click();
  await expect(paywall.locator('[data-segment="fintech"]')).toBeVisible();
  await expect(paywall).toContainText("The pings a fintech actually wants.");
  await expect(paywall).toContainText("Chargeback received");
  await snap(page, testInfo, "paywall-picked-fintech");
});

test("a mailbox address is never looked up", async ({ browser }, testInfo) => {
  const email =
    target.name === "local"
      ? `e2e-mailbox-${Date.now().toString(36)}@gmail.com`
      : testEmail("mailbox");
  test.skip(
    !email.endsWith("@gmail.com"),
    "needs a gmail.com address that gets no mail"
  );
  const { orgSlug, page } = await signUp(browser, email);
  test.skip(!(await hosted(page)), "billing is off on this server");
  const brand = await rpc<Brand>(page, "workspace/brand");
  expect(brand.body).toMatchObject({ domain: null, iconUrl: null, name: null });
  expect(["none", "off"]).toContain(brand.body.status);

  await page.goto(`${target.app}/${orgSlug}`);
  const paywall = page.getByRole("dialog", { name: "Start your free trial" });
  await expect(paywall).toContainText("The pings a SaaS actually wants.");
  await expect(paywall.locator('[data-segment="saas"]')).toBeVisible();
  await expect(
    paywall.getByRole("button", { name: "What do you build?" })
  ).toBeVisible();
  // The organization keeps its default name and has no avatar image.
  await expect(page.locator("[data-app-header]")).toContainText(
    "E2E's workspace"
  );
  await snap(page, testInfo, "paywall-mailbox");
});
