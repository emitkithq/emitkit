import { target } from "@e2e/support/targets";
import { expect, test } from "@playwright/test";

test.describe("hostname routing", () => {
  test("marketing site serves prerendered pages", async ({ request }) => {
    test.skip(
      !target.hasSite,
      "no marketing site on this deployment (E2E_NO_SITE=1)"
    );
    for (const path of ["/", "/privacy", "/terms"]) {
      const response = await request.get(`${target.site}${path}`, {
        headers: { accept: "text/html" },
      });
      expect(response.status(), path).toBe(200);
      const html = await response.text();
      test.skip(
        html.includes("<!--ssr-outlet-->"),
        "`vite dev` serves the unrendered shell; run against a build"
      );
      expect(html, `${path} is prerendered`).toMatch(/<h1[^>]*>[^<]+/u);
      expect(html).toContain('<link rel="canonical"');
    }
    const missing = await request.get(`${target.site}/definitely-not-a-page`, {
      headers: { accept: "text/html" },
    });
    expect(missing.status()).toBe(404);
  });

  test("site assets and SEO files", async ({ request }) => {
    test.skip(
      !target.hasSite,
      "no marketing site on this deployment (E2E_NO_SITE=1)"
    );
    for (const [path, type] of [
      ["/robots.txt", "text/plain"],
      ["/sitemap.xml", "xml"],
      ["/og-image.jpg", "image/jpeg"],
    ] as const) {
      const response = await request.get(`${target.site}${path}`);
      expect(response.status(), path).toBe(200);
      expect(response.headers()["content-type"], path).toContain(type);
    }
  });

  test("www redirects to the apex (production only)", async ({ request }) => {
    test.skip(
      target.name !== "production" || !target.hasSite,
      "www is only attached in production, with the site"
    );
    const response = await request.get("https://www.emitkit.com/privacy?x=1", {
      maxRedirects: 0,
    });
    expect([301, 308]).toContain(response.status());
    expect(response.headers().location).toBe("https://emitkit.com/privacy?x=1");
  });

  test("app host serves the PWA shell, manifest and service worker", async ({
    request,
  }) => {
    const shell = await request.get(`${target.app}/some/client/route`, {
      headers: { accept: "text/html" },
    });
    expect(shell.status()).toBe(200);
    expect(await shell.text()).toContain('rel="manifest"');

    const manifest = await request.get(`${target.app}/manifest.webmanifest`);
    expect(manifest.status()).toBe(200);
    const body = (await manifest.json()) as {
      name: string;
      start_url: string;
      display: string;
      icons: unknown[];
    };
    expect(body.start_url).toBe("/");
    expect(body.display).toBe("standalone");
    expect(body.icons.length).toBeGreaterThanOrEqual(2);

    const worker = await request.get(`${target.app}/service-worker.js`);
    expect(worker.status()).toBe(200);
    expect(worker.headers()["content-type"]).toContain("javascript");
    expect(await worker.text()).toContain("push");
  });

  test("api host serves health and the OpenAPI document", async ({
    request,
  }) => {
    const health = await request.get(`${target.api}/health`);
    expect(await health.json()).toMatchObject({ status: "ok" });

    for (const path of ["/openapi.json", "/api/openapi.json"]) {
      const spec = await request.get(`${target.api}${path}`);
      expect(spec.status(), path).toBe(200);
      const document = (await spec.json()) as {
        openapi: string;
        paths: Record<string, unknown>;
      };
      expect(document.openapi).toBe("3.1.0");
      expect(Object.keys(document.paths).toSorted()).toEqual([
        "/v1/channels",
        "/v1/events",
        "/v1/events/{id}",
        "/v1/events/{id}/cancel",
        "/v1/identify",
        "/v1/identities/{user_id}",
        "/v1/me",
      ]);
    }

    const unknown = await request.get(`${target.api}/v2/nothing`);
    expect(unknown.status()).toBe(404);
  });
});
