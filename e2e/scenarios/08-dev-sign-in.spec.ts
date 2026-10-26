import { target } from "@e2e/support/targets";
import { expect, test } from "@playwright/test";

/**
 * "Continue in local dev": one click on the sign-in page signs in as
 * `dev@example.com` under `pnpm dev`. Ways it can break, each checked below:
 *
 * - The button is missing locally, or the click doesn't leave `/auth/*`
 *   (the session cache still says "signed out" and bounces back to sign-in).
 * - A build or deployment serves the button or the endpoint (it must be dead
 *   code outside `vite dev`: 404, no button).
 *
 * The local half never deletes the dev user: it is the developer's account.
 */
const BUTTON = { name: "Continue in local dev" };

test.describe("local dev", () => {
  test.skip(target.name !== "local", "only `pnpm dev` serves dev sign-in");

  test("one click signs in and lands in the app", async ({ page }) => {
    await page.goto(`${target.app}/auth/sign-in`);
    await page.getByRole("button", BUTTON).click();

    // `/` resolves to the dev user's workspace, or getting-started.
    await expect(page).toHaveURL(
      (url) => url.pathname !== "/" && !url.pathname.startsWith("/auth/")
    );
    const session = await page.request.get(
      `${target.app}/api/auth/get-session`
    );
    const body: { user: { email: string } } = await session.json();
    expect(body.user.email).toBe("dev@example.com");
  });
});

test.describe("deployed", () => {
  test.skip(target.name === "local", "`pnpm dev` serves dev sign-in");

  test("no button and no endpoint", async ({ page }) => {
    const response = await page.request.post(
      `${target.app}/api/auth/dev/sign-in`,
      { data: {}, headers: { origin: target.origin } }
    );
    expect(response.status()).toBe(404);
    expect(response.headers()["set-cookie"]).toBeUndefined();

    await page.goto(`${target.app}/auth/sign-in`);
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
    await expect(page.getByRole("button", BUTTON)).toHaveCount(0);
  });
});
