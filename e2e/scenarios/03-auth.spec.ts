import { target, TEST_PASSWORD, testEmail } from "@e2e/support/targets";
import { expect, test } from "@playwright/test";

/**
 * Authentication through the real UI (better-auth-ui on HeroUI): sign-up,
 * the signed-out redirect, sign-out, wrong and right passwords, signing in
 * from a deep link, and the
 * password-reset and sign-in code requests (their emails go to real inboxes
 * and are checked by hand, see e2e/README.md).
 */
test.describe.configure({ mode: "serial" });

const email = testEmail("auth");

test("signed-out visitors are sent to sign-in", async ({ page }) => {
  await page.goto(`${target.app}/`);
  await expect(page).toHaveURL(/\/auth\/sign-in/u);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Sign in"
  );
});

test("sign up, create a workspace, sign out, sign back in", async ({
  browser,
  page,
}) => {
  await page.goto(`${target.app}/auth/sign-up`);
  await page.getByRole("textbox", { name: "Name" }).fill("E2E Auth");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign Up" }).click();

  // New users land in a workspace made for them, with the setup guide open.
  await expect(page).toHaveURL(/\/[a-z0-9-]+\?guide=setup$/u);
  const guide = page.getByRole("dialog", { name: "Setup guide" });
  await expect(guide).toContainText("Welcome to EmitKit");
  await guide.getByRole("button", { name: "I'll finish later" }).click();
  await expect(guide).toBeHidden();
  await expect(
    page.getByRole("heading", { level: 1, name: "Events" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(
    page.getByRole("dialog", { name: "Account menu" })
  ).toContainText(email);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/auth\/sign-in/u);

  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page
    .getByRole("textbox", { name: "Password" })
    .fill("not-the-password-1");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText(/invalid email or password/iu)).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/sign-in/u);

  await page.getByRole("textbox", { name: "Password" }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Events" })
  ).toBeVisible();
  await expect(page).toHaveURL(/\/e2es-workspace-[a-z0-9]+$/u);

  // A notification's deep link opened signed out, in a fresh app load:
  // signing in returns to it (a stale "signed out" once bounced it forever).
  const deepLink = `${page.url()}/channels`;
  const fresh = await browser.newPage();
  await fresh.goto(deepLink);
  await expect(fresh).toHaveURL(/\/auth\/sign-in\?redirectTo=/u);
  await fresh.getByRole("textbox", { name: "Email" }).fill(email);
  await fresh.getByRole("textbox", { name: "Password" }).fill(TEST_PASSWORD);
  await fresh.getByRole("button", { name: "Sign In" }).click();
  await expect(
    fresh.getByRole("heading", { level: 1, name: "Channels" })
  ).toBeVisible();
  await expect(fresh).toHaveURL(deepLink);
  await fresh.close();
});

test("password reset and sign-in code requests are accepted", async ({
  page,
}) => {
  await page.goto(`${target.app}/auth/forgot-password`);
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  const reset = page.waitForResponse((response) =>
    response.url().includes("/api/auth/request-password-reset")
  );
  await page.getByRole("button", { name: "Send reset link" }).click();
  const resetResponse = await reset;
  expect(resetResponse.status()).toBe(200);

  await page.goto(`${target.app}/auth/email-otp`);
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  const code = page.waitForResponse((response) =>
    response.url().includes("/api/auth/email-otp/send-verification-otp")
  );
  await page.getByRole("button", { name: "Send code" }).click();
  const codeResponse = await code;
  expect(codeResponse.status()).toBe(200);
  await expect(page.getByText(`We sent a code to ${email}`)).toBeVisible();
});

test.afterAll(async ({ request }) => {
  const signIn = await request.post(`${target.app}/api/auth/sign-in/email`, {
    data: { email, password: TEST_PASSWORD },
    headers: { origin: target.origin },
  });
  if (!signIn.ok()) {
    return;
  }
  const organizations = await request.get(
    `${target.app}/api/auth/organization/list`,
    { headers: { origin: target.origin } }
  );
  const list: { id: string }[] = organizations.ok()
    ? await organizations.json()
    : [];
  for (const organization of list) {
    await request.post(`${target.app}/api/auth/organization/delete`, {
      data: { organizationId: organization.id },
      headers: { origin: target.origin },
    });
  }
  await request.post(`${target.app}/api/auth/delete-user`, {
    data: { password: TEST_PASSWORD },
    headers: { origin: target.origin },
  });
});
