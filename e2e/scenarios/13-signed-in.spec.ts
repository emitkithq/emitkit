import { ApiSession, postAuth } from "@e2e/support/api-session";
import { target, TEST_PASSWORD } from "@e2e/support/targets";
import { request as newRequest, expect, test } from "@playwright/test";
import type {
  APIRequestContext,
  APIResponse,
  BrowserContext,
  Page,
} from "@playwright/test";

/**
 * Visitors who are already signed in. Ways it can break, each checked below:
 *
 * - Sign-in and sign-up render the form to someone signed in, instead of
 *   sending them where they were going.
 * - `redirectTo` is ignored, or trusted when it points off-site.
 * - Re-authentication (`reauthenticate=true`, sent by sensitive account
 *   actions to a signed-in user) gets bounced away from the form.
 * - Sign-out lands on sign-in and is bounced back into the app by a stale
 *   session cache.
 * - A failed session check makes sign-in unreachable.
 * - The `emitkit_signed_in` hint cookie is missing, HttpOnly (the site's
 *   script can't read it), scoped to the wrong domain, outlives the session,
 *   or never reaches sessions that started before it existed.
 * - The site header shows Sign in first and swaps to Dashboard later (a
 *   flash), or moves anything when it does.
 * - The site keeps offering Dashboard after sign-out.
 *
 * The hint depends on the host layout, so the site half runs in one of three
 * modes (`hintMode`):
 *
 * - `real`: the app host is a subdomain of the site host (production,
 *   `app.emitkit.localhost` under `emitkit.localhost`): the whole cross-host
 *   flow runs.
 * - `injected`: the site is bare `localhost` (`pnpm dev`). Chrome rejects
 *   `Domain=localhost`, so the hint's `Set-Cookie` headers are checked over
 *   HTTP and the site gets the cookie injected.
 * - `none`: the app host is not under the site host (staging:
 *   `staging-app.emitkit.com` beside `staging.emitkit.com`), or there is no
 *   site (`E2E_NO_SITE=1`, checked in 16-no-site). No hint is sent, and a
 *   site keeps showing Sign in.
 */
test.describe.configure({ mode: "serial" });

const HINT = "emitkit_signed_in";
const SESSION_COOKIE = /^(?:__Secure-)?emitkit\.session_token=/u;
const siteHost = new URL(target.site).hostname;
const appHost = new URL(target.app).hostname;

const hintModeFor = () => {
  if (!(target.hasSite && appHost.endsWith(`.${siteHost}`))) {
    return "none";
  }
  return siteHost === "localhost" ? "injected" : "real";
};
const hintMode = hintModeFor();
// `vite dev` serves the entry module (`./main.tsx` from `/`); builds a
// hashed chunk.
const siteScript = /\/(?:(?:www\/)?main\.tsx|assets\/www-[\w-]+\.js)(?:\?|$)/u;

let context: BrowserContext;
let page: Page;
let session: ApiSession;
let organizationId = "";
let orgPath = "";

const setCookies = (response: APIResponse) =>
  response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => header.value);

const hintCookie = (response: APIResponse) =>
  setCookies(response).find((cookie) => cookie.startsWith(`${HINT}=`));

const attribute = (cookie: string, name: string) =>
  cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith(`${name.toLowerCase()}=`))
    ?.split("=")[1];

/** A cookie jar of its own, so each call sends exactly the cookies given. */
const bare = async (
  path: string,
  { cookie, method = "GET" }: { cookie?: string; method?: "GET" | "POST" }
) => {
  const client = await newRequest.newContext();
  const headers: Record<string, string> = { origin: target.origin };
  if (cookie) {
    headers.cookie = cookie;
  }
  const response =
    method === "POST"
      ? await client.post(`${target.app}${path}`, { data: {}, headers })
      : await client.get(`${target.app}${path}`, { headers });
  const result = {
    hint: hintCookie(response),
    ok: response.ok(),
    session: setCookies(response).find((value) => SESSION_COOKIE.test(value)),
  };
  await client.dispose();
  return result;
};

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext();
  page = await context.newPage();
  session = await ApiSession.signUp(page.request, "signed-in");
  const workspace = await session.bootstrap("Signed In Co", "Signed In App");
  ({ organizationId } = workspace);
  orgPath = `/${workspace.organizationSlug}`;
  if (hintMode === "injected") {
    await context.addCookies([{ name: HINT, url: target.site, value: "1" }]);
  }
});

const signInWith = (client: APIRequestContext) =>
  postAuth(client, "/api/auth/sign-in/email", {
    email: session.email,
    password: TEST_PASSWORD,
  });

/** A screenshot of the top of the page, attached for the report. */
const shoot = async (name: string) => {
  const file = test.info().outputPath(`${name}.png`);
  await page.screenshot({
    clip: { height: 200, width: 1280, x: 0, y: 0 },
    path: file,
  });
  await test.info().attach(name, { contentType: "image/png", path: file });
};

/** Signs the browser back in as the scenario's user. */
const signInAgain = async () => {
  const response = await signInWith(page.request);
  expect(response.ok()).toBe(true);
};

test.afterAll(async () => {
  await signInAgain();
  await session.destroy(organizationId);
  await context.close();
});

test("sign-in and sign-up send a signed-in visitor on", async () => {
  const events = page.getByRole("heading", { level: 1, name: "Events" });
  for (const path of ["sign-in", "sign-up", "email-otp", "forgot-password"]) {
    await page.goto(`${target.app}/auth/${path}`);
    await expect(events).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(orgPath);
  }

  const channels = encodeURIComponent(`${orgPath}/channels`);
  await page.goto(`${target.app}/auth/sign-in?redirectTo=${channels}`);
  await expect(page).toHaveURL(`${target.app}${orgPath}/channels`);

  for (const unsafe of [
    "https://evil.example/steal",
    "//evil.example/steal",
    "/auth/sign-in",
  ]) {
    await page.goto(
      `${target.app}/auth/sign-in?redirectTo=${encodeURIComponent(unsafe)}`
    );
    await expect(events).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(orgPath);
  }

  // Replaced, not pushed: Back doesn't return to the sign-in address.
  await page.goto(`${target.app}${orgPath}/projects`);
  await page.goto(`${target.app}/auth/sign-in`);
  await expect(events).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(`${target.app}${orgPath}/projects`);
});

test("re-authentication still shows the form", async () => {
  const back = encodeURIComponent(`${orgPath}?settings=account`);
  await page.goto(
    `${target.app}/auth/sign-in?reauthenticate=true&redirectTo=${back}`
  );
  await expect(page.getByRole("textbox", { name: "Password" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/auth/sign-in");
});

test("a failed session check leaves sign-in reachable", async ({ browser }) => {
  const offline = await browser.newPage();
  await offline.route("**/api/auth/get-session*", (route) => route.abort());
  await offline.goto(`${target.app}/auth/sign-in`);
  await expect(
    offline.getByRole("textbox", { name: "Password" })
  ).toBeVisible();
  await offline.close();
});

test("the hint cookie follows the session", async () => {
  test.skip(hintMode === "none", "this host layout gets no hint");
  const signIn = await newRequest.newContext();
  const response = await signInWith(signIn);
  expect(response.ok()).toBe(true);
  await signIn.dispose();

  const sessionCookie = setCookies(response).find((value) =>
    SESSION_COOKIE.test(value)
  );
  const hint = hintCookie(response);
  expect(sessionCookie).toBeDefined();
  expect(hint).toBeDefined();
  const hintValue = hint ?? "";
  expect(hintValue.startsWith(`${HINT}=1;`)).toBe(true);
  expect(attribute(hintValue, "Domain")?.replace(/^\./u, "")).toBe(siteHost);
  expect(attribute(hintValue, "Path")).toBe("/");
  expect(attribute(hintValue, "SameSite")).toBe("Lax");
  expect(attribute(hintValue, "Max-Age")).toBe(
    attribute(sessionCookie ?? "", "Max-Age")
  );
  expect(hintValue.toLowerCase()).not.toContain("httponly");
  expect(hintValue.includes("Secure")).toBe(target.app.startsWith("https:"));

  // The session cookie alone (a session from before the hint existed):
  // get-session adds the hint, and stops once the browser has it.
  const token = (sessionCookie ?? "").split(";")[0] ?? "";
  const backfill = await bare("/api/auth/get-session", { cookie: token });
  expect(backfill.hint?.startsWith(`${HINT}=1;`)).toBe(true);
  expect(attribute(backfill.hint ?? "", "Expires")).toBeDefined();
  const settled = await bare("/api/auth/get-session", {
    cookie: `${token}; ${HINT}=1`,
  });
  expect(settled.hint).toBeUndefined();

  // A hint without a session (expired, or revoked elsewhere) is cleared.
  const stale = await bare("/api/auth/get-session", { cookie: `${HINT}=1` });
  expect(attribute(stale.hint ?? "", "Max-Age")).toBe("0");
  expect(attribute(stale.hint ?? "", "Domain")?.replace(/^\./u, "")).toBe(
    siteHost
  );

  // Signing out clears the session cookie and the hint together.
  const signOut = await bare("/api/auth/sign-out", {
    cookie: `${token}; ${HINT}=1`,
    method: "POST",
  });
  expect(signOut.ok).toBe(true);
  expect(attribute(signOut.session ?? "", "Max-Age")).toBe("0");
  expect(attribute(signOut.hint ?? "", "Max-Age")).toBe("0");
});

const siteHeader = () => {
  const header = page.getByRole("banner");
  const link = (name: string) =>
    header.getByRole("link", { includeHidden: true, name });
  return {
    dashboard: link("Dashboard"),
    getStarted: link("Get started"),
    signIn: link("Sign in"),
  };
};

test("the first paint already shows Dashboard", async () => {
  test.skip(hintMode === "none", "this host layout gets no hint");
  const response = await page.request.get(target.site, {
    headers: { accept: "text/html" },
  });
  const html = await response.text();
  test.skip(
    html.includes("<!--ssr-outlet-->"),
    "`vite dev` serves the unrendered shell; run against a build"
  );
  const { dashboard, getStarted, signIn } = siteHeader();

  // With the site's script blocked, only the prerendered markup and the
  // inline <head> script and style decide what shows: the first paint.
  let blocked = 0;
  await page.route(siteScript, (route) => {
    blocked += 1;
    return route.abort();
  });
  await page.goto(target.site);
  expect(blocked).toBeGreaterThan(0);
  await expect(dashboard).toBeVisible();
  await expect(signIn).toBeHidden();
  await expect(getStarted).toBeHidden();
  await shoot("first-paint-signed-in-header");
  await page.unroute(siteScript);
});

test("the site header offers the dashboard, and nothing moves", async ({
  browser,
}) => {
  test.skip(hintMode === "none", "this host layout gets no hint");
  const { dashboard, signIn } = siteHeader();

  // Layout shifts inside the header, from the first paint through hydration.
  await page.addInitScript(() => {
    const shifts: number[] = [];
    (window as { headerShifts?: number[] }).headerShifts = shifts;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & {
        sources?: { node?: Node | null }[];
        value: number;
      })[]) {
        const banner = document.querySelector("header");
        if (
          (entry.sources ?? []).some(
            (source) => source.node && banner?.contains(source.node)
          )
        ) {
          shifts.push(entry.value);
        }
      }
    }).observe({ buffered: true, type: "layout-shift" });
  });
  await page.goto(target.site);
  await expect(dashboard).toBeVisible();
  await expect(dashboard).toHaveAttribute("href", `${target.app}/`);
  await expect(signIn).toBeHidden();
  await page.waitForTimeout(1500);
  await shoot("hydrated-signed-in-header");
  const headerShift = await page.evaluate(() => {
    const shifts = (window as { headerShifts?: number[] }).headerShifts ?? [];
    return shifts.reduce((total, value) => total + value, 0);
  });
  expect(headerShift).toBe(0);

  await dashboard.click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Events" })
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(orgPath);

  // Signed out: the default markup, Sign in and Get started.
  const visitor = await browser.newPage();
  await visitor.goto(target.site);
  const visitorHeader = visitor.getByRole("banner");
  await expect(
    visitorHeader.getByRole("link", { name: "Sign in" })
  ).toBeVisible();
  await expect(
    visitorHeader.getByRole("link", { name: "Get started" })
  ).toBeVisible();
  await expect(
    visitorHeader.getByRole("link", { includeHidden: true, name: "Dashboard" })
  ).toBeHidden();
  await visitor.close();
});

test("after sign-out the site offers Sign in again", async () => {
  test.skip(
    hintMode !== "real",
    "needs the app's real cookie; the clearing header is checked above"
  );
  await page.goto(`${target.app}/auth/sign-out`);
  await expect(page).toHaveURL(/\/auth\/sign-in/u);
  await page.goto(target.site);
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Sign in" })
  ).toBeVisible();
});

test("without a shared domain the site keeps Sign in", async () => {
  test.skip(hintMode !== "none", "this host layout gets the hint");
  test.skip(
    !target.hasSite,
    "no marketing site on this deployment (E2E_NO_SITE=1)"
  );
  const response = await signInWith(page.request);
  expect(response.ok()).toBe(true);
  expect(hintCookie(response)).toBeUndefined();
  await page.goto(target.site);
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(
    header.getByRole("link", { includeHidden: true, name: "Dashboard" })
  ).toBeHidden();
});

test("sign-out lands on sign-in and stays there", async () => {
  await signInAgain();
  await page.goto(`${target.app}${orgPath}`);
  await page.goto(`${target.app}/auth/sign-out`);
  await expect(page).toHaveURL(/\/auth\/sign-in/u);
  await expect(page.getByRole("textbox", { name: "Password" })).toBeVisible();
  // Nothing sends it back into the app a moment later.
  await page.waitForTimeout(1000);
  expect(new URL(page.url()).pathname).toBe("/auth/sign-in");
});
