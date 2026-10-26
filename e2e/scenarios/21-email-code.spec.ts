import { glob, readFile, stat } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

import { ApiSession, postAuth } from "@e2e/support/api-session";
import { target, TEST_PASSWORD, testEmail } from "@e2e/support/targets";
import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

/**
 * Passwordless sign-in with an emailed code, end to end. The local Worker's
 * `EMAIL` binding (Miniflare) writes every message it sends under
 * `web/.wrangler/tmp/email`, so the codes are read from there: this runs
 * against `pnpm dev` only. On staging and production the code goes to a real
 * inbox and is checked by hand (see e2e/README.md).
 *
 * Ways it can break, each checked below:
 *
 * - The email carries no code, or not one the server accepts.
 * - Signing in by code lands somewhere other than the page that asked for
 *   sign-in (a notification's deep link).
 * - Asking for a code again voids the one already in the inbox (someone who
 *   left the Home Screen app for Mail and came back to a reloaded page).
 * - Signing in by code leaves a verified account's password unusable.
 * - A new address can't create an account by code while sign-up is open, or
 *   the account isn't marked verified.
 * - Wrong codes are accepted, or can be tried without limit.
 */
// Code requests and sign-ins are rate limited (three a minute), so a test may
// wait out a window or two.
test.describe.configure({ mode: "serial", timeout: 300_000 });
test.skip(
  target.name !== "local",
  "Codes are read from the local Worker's sent mail"
);

const MAIL = "web/.wrangler/tmp/email/*/email-text/*.txt";
const CODE = /Your code: (?<value>\d{6})/u;
const VERIFY_LINK = /Verify email: (?<value>\S+)/u;

/** The first message the local Worker sent after `since` (epoch ms). */
const mailSince = async (since: number): Promise<string> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let first: { path: string; at: number } | null = null;
    for await (const path of glob(MAIL)) {
      const { mtimeMs } = await stat(path);
      if (mtimeMs >= since && (!first || mtimeMs < first.at)) {
        first = { at: mtimeMs, path };
      }
    }
    if (first) {
      return readFile(first.path, "utf-8");
    }
    await sleep(200);
  }
  throw new Error("No email was sent");
};

const match = (text: string, pattern: RegExp) => {
  const found = pattern.exec(text)?.groups?.value;
  if (!found) {
    throw new Error(`No ${pattern.source} in the email`);
  }
  return found;
};

/** Asks for a sign-in code over HTTP and returns the one emailed. */
const requestCode = async (request: APIRequestContext, email: string) => {
  const since = Date.now();
  const response = await postAuth(
    request,
    "/api/auth/email-otp/send-verification-otp",
    { email, type: "sign-in" }
  );
  expect(response.status()).toBe(200);
  return match(await mailSince(since), CODE);
};

/**
 * Fills the email step of the code form and returns the code it sent. Better
 * Auth allows three code requests a minute from one address, and scenarios
 * run back to back, so a 429 waits out its `X-Retry-After` once.
 */
const sendCodeFromForm = async (page: Page, email: string) => {
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  let since = Date.now();
  const send = async () => {
    const sent = page.waitForResponse((response) =>
      response.url().includes("/api/auth/email-otp/send-verification-otp")
    );
    await page.getByRole("button", { name: "Send code" }).click();
    return sent;
  };
  let response = await send();
  if (response.status() === 429) {
    const seconds = Number(response.headers()["x-retry-after"] ?? "60");
    await sleep((seconds + 1) * 1000);
    since = Date.now();
    response = await send();
  }
  expect(response.status()).toBe(200);
  await expect(page.getByText(`We sent a code to ${email}`)).toBeVisible();
  return match(await mailSince(since), CODE);
};

const enterCode = async (page: Page, code: string) => {
  await page.getByRole("textbox", { name: "Code" }).pressSequentially(code);
};

test("an existing account signs in by code and lands where it was going", async ({
  page,
  request,
}) => {
  const since = Date.now();
  const account = await ApiSession.signUp(request, "code-existing");
  const verify = await request.get(match(await mailSince(since), VERIFY_LINK), {
    maxRedirects: 0,
  });
  expect(verify.status()).toBeLessThan(400);
  const workspace = await account.bootstrap("E2E Code", "Code app");

  try {
    // A notification's deep link, opened signed out.
    const deepLink = `${target.app}/${workspace.organizationSlug}/channels`;
    await page.goto(deepLink);
    await expect(page).toHaveURL(/\/auth\/sign-in\?redirectTo=/u);
    await page.getByRole("link", { name: /email code/iu }).click();
    await expect(page).toHaveURL(/\/auth\/email-otp\?redirectTo=/u);

    const code = await sendCodeFromForm(page, account.email);
    // Asking again resends the code already on its way.
    expect(await requestCode(request, account.email)).toBe(code);

    await enterCode(page, code);
    await expect(page).toHaveURL(deepLink);
    await expect(
      page.getByRole("heading", { level: 1, name: "Channels" })
    ).toBeVisible();

    const password = await postAuth(request, "/api/auth/sign-in/email", {
      email: account.email,
      password: TEST_PASSWORD,
    });
    expect(password.status()).toBe(200);
  } finally {
    await account.destroy(workspace.organizationId);
  }
});

test("a new address creates a verified account by code", async ({ page }) => {
  const email = testEmail("code-new");
  await page.goto(`${target.app}/auth/email-otp`);
  const code = await sendCodeFromForm(page, email);
  await enterCode(page, code);
  await expect(page).not.toHaveURL(/\/auth\//u);

  const session = await page.request.get(`${target.app}/api/auth/get-session`);
  const body: { user: { email: string; emailVerified: boolean } } =
    await session.json();
  expect(body.user.email).toBe(email);
  expect(body.user.emailVerified).toBe(true);

  const headers = { origin: target.origin };
  const organizations = await page.request.get(
    `${target.app}/api/auth/organization/list`,
    { headers }
  );
  const list: { id: string }[] = await organizations.json();
  for (const organization of list) {
    await page.request.post(`${target.app}/api/auth/organization/delete`, {
      data: { organizationId: organization.id },
      headers,
    });
  }
  const deleted = await page.request.post(
    `${target.app}/api/auth/delete-user`,
    { data: {}, headers }
  );
  expect(deleted.ok()).toBe(true);
});

test("a code allows three tries, then a new one is needed", async ({
  request,
}) => {
  const email = testEmail("code-attempts");
  const code = await requestCode(request, email);
  const wrong = code === "000000" ? "111111" : "000000";
  const signIn = (otp: string) =>
    postAuth(request, "/api/auth/sign-in/email-otp", { email, otp });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rejected = await signIn(wrong);
    expect(rejected.status()).toBe(400);
  }
  const locked = await signIn(code);
  expect(locked.status()).toBe(403);
  expect(await locked.text()).toContain("TOO_MANY_ATTEMPTS");

  // No account was created, and asking again sends a fresh code.
  const session = await request.get(`${target.app}/api/auth/get-session`);
  expect(await session.json()).toBeNull();
  expect(await requestCode(request, email)).not.toBe(code);
});
