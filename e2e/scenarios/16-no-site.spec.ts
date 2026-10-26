import { ApiSession } from "@e2e/support/api-session";
import { target } from "@e2e/support/targets";
import { expect, test } from "@playwright/test";

/**
 * A deployment without a marketing site (`EMITKIT_SITE_HOST` unset, the
 * self-hosting default; locally `EMITKIT_SITE=off pnpm dev`). Run it with
 * `E2E_NO_SITE=1`; it skips otherwise. Ways it can break, each checked below:
 *
 * - A host that isn't the app's or the API's (the bare domain, `www.`, any
 *   other name pointed at the Worker) still serves the marketing bundle, redirects to a site that
 *   doesn't exist, or fails, instead of showing the app.
 * - The dashboard still announces a site (`emitkit:site-url`), so its docs
 *   links point at a host that doesn't exist.
 * - The API's health document links docs on the missing site.
 * - Emails load their wordmark from the missing site.
 * - Better Auth refuses the app's own origin once the site origin is gone,
 *   or the signed-in hint cookie is set for a site that doesn't exist.
 */
test.describe.configure({ mode: "serial" });

test.skip(target.hasSite, "needs a deployment without a site (E2E_NO_SITE=1)");

const HINT = "emitkit_signed_in";

/**
 * The site's host and, on `pnpm dev` (where every name reaches the Worker),
 * `www.localhost` and an unrelated `*.localhost` name. A deployment only routes the
 * hostnames attached to it, so a remote target checks `site` alone.
 */
const otherHosts = () => {
  const site = new URL(target.site);
  if (site.hostname !== "localhost") {
    return [site.origin];
  }
  const other = ["www.localhost", "elsewhere.localhost"].map((hostname) => {
    const url = new URL(site);
    url.hostname = hostname;
    return url.origin;
  });
  return [site.origin, ...other];
};

test("every host other than the API serves the app", async ({ request }) => {
  for (const origin of otherHosts()) {
    const response = await request.get(`${origin}/`, {
      headers: { accept: "text/html" },
      maxRedirects: 0,
    });
    expect(response.status(), origin).toBe(200);
    const html = await response.text();
    expect(html, origin).toContain('rel="manifest"');
    expect(html, origin).toContain('name="emitkit:app-url"');
    expect(html, origin).not.toContain('name="emitkit:site-url"');
  }
});

test("the dashboard announces no site", async ({ request }) => {
  const response = await request.get(`${target.app}/`, {
    headers: { accept: "text/html" },
  });
  const html = await response.text();
  expect(html).toContain('name="emitkit:app-url"');
  expect(html).not.toContain('name="emitkit:site-url"');
});

test("the API links the public docs", async ({ request }) => {
  const health = await request.get(`${target.api}/health`);
  expect(await health.json()).toMatchObject({
    docs: "https://emitkit.com/docs",
    status: "ok",
  });
});

test("the email wordmark is served from the app host", async ({ request }) => {
  const response = await request.get(`${target.app}/email-wordmark.png`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
});

test("sign-up works and sets no site hint", async ({ request }) => {
  const session = await ApiSession.signUp(request, "no-site");
  try {
    const response = await request.get(`${target.app}/api/auth/get-session`, {
      headers: { origin: target.origin },
    });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { user?: { email: string } };
    expect(body.user?.email).toBe(session.email);
    const hints = response
      .headersArray()
      .filter(
        (header) =>
          header.name.toLowerCase() === "set-cookie" &&
          header.value.startsWith(`${HINT}=`)
      );
    expect(hints).toEqual([]);
    const cookies = await request.storageState();
    expect(cookies.cookies.map((cookie) => cookie.name)).not.toContain(HINT);
  } finally {
    await session.destroy();
  }
});
