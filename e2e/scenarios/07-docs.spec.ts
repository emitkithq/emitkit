import { target } from "@e2e/support/targets";
import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

/**
 * The docs site (docs/, a separate Blume/Astro build) served by the Worker
 * at `<site>/docs`. Ways it can break, each checked below:
 *
 * - `/docs` or a nested page isn't served, or gets the marketing site's page.
 * - Links, scripts or styles point at the site root instead of `/docs/…`, so
 *   navigation lands on the marketing 404 and pages render unstyled.
 * - The API reference isn't generated from the published `openapi.json`.
 * - Search, sitemap and agent files (`llms.txt`, `.md` pages) are missing or
 *   served without `charset=utf-8`.
 * - Unknown docs pages get the marketing 404; old paths don't redirect.
 * - Content still describes EmitKit v2 (`ek_` keys) instead of production.
 * - The Self-hosting section (docs/content/self-hosting) is missing from the
 *   navigation, a page of it isn't built, Mintlify-era self-hosting paths
 *   still send self-hosters to the customer guide, or internal notes
 *   (docs/internal) leak into the published site.
 */
test.skip(
  !target.hasSite,
  "no marketing site on this deployment (E2E_NO_SITE=1)"
);

const docs = `${target.site}/docs`;

// `vite dev` serves the site's unrendered shell and no docs; a local build
// (see e2e/README.md) serves both.
test.beforeAll(async ({ request }) => {
  const home = await request.get(`${target.site}/`, {
    headers: { accept: "text/html" },
  });
  const body = await home.text();
  test.skip(
    body.includes("<!--ssr-outlet-->"),
    "`vite dev` doesn't bundle the docs; run against a build"
  );
});

const html = async (request: APIRequestContext, path: string) => {
  const response = await request.get(`${docs}${path}`, {
    headers: { accept: "text/html" },
  });
  return { body: await response.text(), status: response.status() };
};

test("docs home and a guide render with their assets", async ({
  page,
}, testInfo) => {
  const failed: string[] = [];
  page.on("response", (response) => {
    if (response.url().startsWith(docs) && response.status() >= 400) {
      failed.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.goto(docs);
  await expect(page).toHaveTitle(/EmitKit Docs/u);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "EmitKit documentation"
  );
  await page
    .getByRole("main")
    .getByRole("link", { name: /Get started/u })
    .first()
    .click();
  await expect(page).toHaveURL(`${docs}/getting-started`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Getting started"
  );
  // Astro's client router cross-fades pages; capture after it settles.
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().length))
    .toBe(0);
  await testInfo.attach("getting-started", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  expect(failed, "docs requests that failed").toEqual([]);
});

test("links and assets stay under /docs", async ({ request }) => {
  for (const path of [
    "",
    "/getting-started",
    "/sdk",
    "/sdk/questions",
    "/cli",
    "/self-hosting/deployment",
    "/reference",
  ]) {
    const { body, status } = await html(request, path);
    expect(status, path || "/").toBe(200);
    const rootRelative = [
      ...body.matchAll(/(?:href|src)="(?<url>\/[^"/][^"]*)"/gu),
    ].map((match) => match.groups?.url ?? "");
    expect(rootRelative.length, `${path || "/"} has links`).toBeGreaterThan(0);
    expect(
      rootRelative.filter(
        // The page-view script, added when operator telemetry is on (src/worker/assets.ts).
        (url) => !(url.startsWith("/docs") || url === "/www/ek.js")
      ),
      `${path || "/"} links outside /docs`
    ).toEqual([]);
  }
});

test("API reference covers every operation in the published contract", async ({
  request,
}) => {
  const published = await request.get(`${target.api}/openapi.json`);
  const spec: {
    paths: Record<
      string,
      Record<string, { operationId?: string; tags?: string[] }>
    >;
  } = await published.json();
  const operations = Object.entries(spec.paths).flatMap(([path, methods]) =>
    Object.values(methods)
      .filter((operation) => operation.operationId)
      .map((operation) => ({ operation, path }))
  );
  expect(operations.length).toBeGreaterThan(0);
  for (const { operation, path } of operations) {
    const tag = (operation.tags?.[0] ?? "").toLowerCase();
    const slug = (operation.operationId ?? "")
      .replaceAll(/(?<lower>[a-z])(?<upper>[A-Z])/gu, "$<lower>-$<upper>")
      .toLowerCase();
    const page = await html(request, `/reference/${tag}/${slug}`);
    expect(page.status, `${operation.operationId} reference page`).toBe(200);
    expect(page.body).toContain(path);
  }
});

test("search, sitemap and agent files", async ({ request }) => {
  const sitemap = await request.get(`${docs}/sitemap.xml`);
  expect(sitemap.status()).toBe(200);
  // Canonical URLs use the production site, wherever the build is served.
  expect(await sitemap.text()).toMatch(
    /<loc>https:\/\/[^<]+\/docs\/getting-started<\/loc>/u
  );
  const robots = await request.get(`${target.site}/robots.txt`);
  expect(await robots.text()).toMatch(
    /^Sitemap: https:\/\/\S+\/docs\/sitemap\.xml$/mu
  );

  for (const [path, type] of [
    ["/llms.txt", "text/plain"],
    ["/getting-started.md", "text/markdown"],
  ] as const) {
    const response = await request.get(`${docs}${path}`);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toBe(
      `${type}; charset=utf-8`
    );
  }
  const search = await request.get(`${docs}/blume-search.json`);
  expect(search.status()).toBe(200);
  expect(JSON.stringify(await search.json())).toContain("getting-started");
});

test("unknown pages get the docs 404, old paths redirect", async ({
  page,
  request,
}) => {
  const missing = await html(request, "/no-such-page");
  expect(missing.status).toBe(404);
  expect(missing.body).toContain("EmitKit Docs");

  await page.goto(`${docs}/quickstart`);
  await expect(page).toHaveURL(`${docs}/getting-started`);
  // The SDK section's old first pages land on its index.
  await page.goto(`${docs}/sdk/typescript`);
  await expect(page).toHaveURL(`${docs}/sdk`);
});

test("content describes production, and the site links to it", async ({
  page,
  request,
}) => {
  const full = await request.get(`${docs}/llms-full.txt`);
  const text = await full.text();
  expect(text).toContain("emitkit_");
  expect(text, "v2 key prefix").not.toMatch(/\bek_[A-Za-z]/u);
  expect(text).not.toContain("does not currently dispatch");

  await page.goto(target.site);
  await page
    .getByRole("banner")
    .getByRole("link", { exact: true, name: "Docs" })
    .click();
  await expect(page).toHaveURL(`${docs}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "EmitKit documentation"
  );
});

test("the old docs host redirects into /docs (production only)", async ({
  page,
  request,
}) => {
  test.skip(
    target.name !== "production",
    "docs.<domain> is only attached in production"
  );
  const oldHost = `https://docs.${new URL(target.site).host}`;
  for (const [from, to] of [
    ["/", `${docs}`],
    ["/sdk/typescript?ref=old", `${docs}/sdk/typescript?ref=old`],
  ] as const) {
    const response = await request.get(`${oldHost}${from}`, {
      maxRedirects: 0,
    });
    expect(response.status(), from).toBe(301);
    expect(response.headers().location, from).toBe(to);
  }
  // A Mintlify-era path lands on its new page through the docs redirects.
  await page.goto(`${oldHost}/api-reference/events/create-event`);
  await expect(page).toHaveURL(`${docs}/reference/events/create-event`);
});

test("self-hosters find the operator docs", async ({ page, request }) => {
  await page.goto(docs);
  await page
    .getByRole("navigation")
    .getByRole("link", { exact: true, name: "Self-hosting" })
    .first()
    .click();
  await expect(page).toHaveURL(`${docs}/self-hosting`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Self-hosting"
  );

  for (const [path, heading] of [
    ["/self-hosting/configuration", "Configuration"],
    ["/self-hosting/deployment", "Deployment"],
    ["/self-hosting/recovery", "Recovery"],
    ["/self-hosting/architecture", "Architecture"],
    ["/self-hosting/development", "Development"],
  ] as const) {
    const { body, status } = await html(request, path);
    expect(status, path).toBe(200);
    expect(body, path).toContain(`<h1`);
    expect(body, path).toContain(heading);
  }

  // Mintlify-era self-hosting paths land in the section, not the customer guide.
  await page.goto(`${docs}/self-hosting/troubleshooting`);
  await expect(page).toHaveURL(`${docs}/self-hosting/recovery`);
  await page.goto(`${docs}/self-hosting/installation`);
  await expect(page).toHaveURL(`${docs}/self-hosting`);

  const fullResponse = await request.get(`${docs}/llms-full.txt`);
  const full = await fullResponse.text();
  expect(full).toContain("alchemy-state-store");
  expect(full, "internal migration notes").not.toContain("Neon");
});
