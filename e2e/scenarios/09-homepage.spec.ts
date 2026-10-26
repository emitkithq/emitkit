import { target } from "@e2e/support/targets";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * The marketing homepage (emitkit.com). Ways it can break, each checked below:
 *
 * - The prerender drops content: the served HTML lacks the headline, the hero
 *   photo or the FAQ structured data, so crawlers and no-JS readers see
 *   an empty shell (built bundles only; `vite dev` serves the bare shell).
 * - The page grows heavy: halftone patterns or images inlined into the HTML.
 * - An image is missing or never loads (hero photo, photography, lazy
 *   images below the fold, pattern files).
 * - Hydration fails or logs errors, leaving tabs and the FAQ inert: the
 *   hero's dashboard tabs, the code sample's tabs and the FAQ are all used.
 * - The hero's dashboard demo never replaces its skeleton (it only renders
 *   on the server), or a tab shows the wrong view.
 * - The demo's chunk fails to load (a deploy replaced it, the network
 *   dropped) and takes the whole page down instead of keeping the skeleton.
 * - Calls to action point at the wrong host: sign-up must go to the app host
 *   the Worker announces, not a hard-coded production URL.
 * - In-page navigation breaks: header anchors with no matching section.
 * - Motion hides content: reveal animations that leave sections transparent
 *   without JavaScript, or a notification that never appears for readers who
 *   ask for reduced motion.
 * - The layout overflows sideways on a phone.
 */
const HEADLINE = "Stay in the loop with your product.";
const SECTION_IDS = ["how-it-works", "developers", "pricing", "faq"] as const;
const MAX_HTML_BYTES = 160_000;

const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  return errors;
};

/** Scrolls to the bottom in steps so every lazy image starts loading. */
const scrollThrough = async (page: Page) => {
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 600) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(120);
  }
};

test.skip(
  !target.hasSite,
  "no marketing site on this deployment (E2E_NO_SITE=1)"
);

test.describe("homepage", () => {
  test("the served document is prerendered and light", async ({ request }) => {
    const response = await request.get(`${target.site}/`, {
      headers: { accept: "text/html" },
    });
    expect(response.status()).toBe(200);
    const html = await response.text();
    test.skip(
      html.includes("<!--ssr-outlet-->"),
      "`vite dev` serves the unrendered shell; run against a build"
    );

    expect(Buffer.byteLength(html), "document size").toBeLessThan(
      MAX_HTML_BYTES
    );
    expect(html).toContain(HEADLINE);
    expect(html).toMatch(/<picture[^>]*>[\s\S]*halo-2400\.avif/u);
    // The dashboard's tabs are in the document; the demo inside them is not,
    // because its times depend on the reader's clock.
    expect(html).toContain('aria-label="Views of the EmitKit dashboard"');
    expect(html).not.toContain('role="feed"');
    for (const id of SECTION_IDS) {
      expect(html, `#${id}`).toContain(`id="${id}"`);
    }
    const jsonLd = html.match(
      /<script type="application\/ld\+json">(?<data>[\s\S]*?)<\/script>/u
    )?.groups?.data;
    expect(jsonLd, "structured data").toBeDefined();
    const graph = JSON.parse(jsonLd ?? "{}") as {
      "@graph": { "@type": string; mainEntity?: { name: string }[] }[];
    };
    const faq = graph["@graph"].find((node) => node["@type"] === "FAQPage");
    expect(faq?.mainEntity?.length ?? 0).toBeGreaterThan(3);
  });

  test("renders, hydrates and loads every image", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`${target.site}/`);

    await expect(
      page.getByRole("heading", { level: 1, name: HEADLINE })
    ).toBeVisible();
    // The hero photo, decorative, so found by source.
    const hero = page.getByRole("region", { name: HEADLINE });
    const photo = hero.locator('img[src*="/images/halo-"]');
    await expect(photo).toBeVisible();
    await expect
      .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    // The dashboard demo replaces its skeleton with the real feed.
    await expect(
      hero.getByRole("feed", { name: "Events" }).getByRole("article").first()
    ).toBeVisible();

    // Sign-up goes to the app host this deployment announces.
    await expect(
      page.getByRole("link", { name: "Get started" }).first()
    ).toHaveAttribute("href", `${target.app}/auth/sign-up`);

    // Header anchors land on real sections.
    for (const id of SECTION_IDS) {
      await expect(page.locator(`#${id}`), `#${id}`).toHaveCount(1);
    }

    // The hero's dashboard tabs switch views: the errors view opens on the
    // failing checkout, filtered to #errors.
    const views = hero.getByRole("tablist", {
      name: "Views of the EmitKit dashboard",
    });
    // The agents view opens on a question the reader can answer.
    await views.getByRole("tab", { name: "Agents" }).click();
    await hero.getByRole("button", { name: "Approve refund" }).click();
    await expect(hero.getByText("You chose “Approve refund”")).toBeVisible();
    await views.getByRole("tab", { name: "Errors" }).click();
    const failure = hero.getByRole("article", { name: "Checkout is failing" });
    await expect(failure).toBeVisible();
    await expect(failure.getByText("Sent to subscribers")).toBeVisible();
    await expect(
      hero.getByRole("button", { name: /Show all channels \(now #errors\)/u })
    ).toBeVisible();

    // The code sample switches between cURL, TypeScript and MCP.
    const developers = page.locator("#developers");
    const tabs = developers.getByRole("tablist", {
      name: "Ways to send an event",
    });
    await tabs.getByRole("tab", { name: "TypeScript" }).click();
    await expect(developers.getByRole("tabpanel")).toContainText("@emitkit/js");
    await tabs.getByRole("tab", { name: "MCP" }).click();
    await expect(developers.getByRole("tabpanel")).toContainText("/mcp");

    // The FAQ opens.
    const question = page.getByRole("button", { name: "What is EmitKit?" });
    await question.click();
    await expect(question).toHaveAttribute("aria-expanded", "true");

    await scrollThrough(page);
    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.images]
            .filter((img) => !(img.complete && img.naturalWidth > 0))
            .map((img) => img.currentSrc || img.src)
        )
      )
      .toEqual([]);

    expect(errors).toEqual([]);
  });

  test("a demo that fails to load leaves the page standing", async ({
    page,
  }) => {
    await page.route("**/dashboard-demo*", (route) => route.abort());
    await page.goto(`${target.site}/`);

    const hero = page.getByRole("region", { name: HEADLINE });
    await expect(
      hero.getByRole("tablist", { name: "Views of the EmitKit dashboard" })
    ).toBeVisible();
    // Give the failed import time to settle, then check nothing unmounted.
    await page.waitForTimeout(1000);
    await expect(
      page.getByRole("heading", { level: 1, name: HEADLINE })
    ).toBeVisible();
    await expect(hero.getByRole("feed")).toHaveCount(0);
    await expect(page.locator("#pricing")).toBeVisible();
  });

  test("content never waits for JavaScript or motion", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${target.site}/`);
    const html = await page.content();
    test.skip(
      !html.includes(HEADLINE),
      "`vite dev` renders on the client; run against a build"
    );

    await scrollThrough(page);
    const hidden = await page.evaluate(() =>
      [...document.querySelectorAll("main h1, main h2, main h3, main p")]
        .filter((element) => {
          let node: Element | null = element;
          while (node) {
            if (Number(getComputedStyle(node).opacity) < 0.99) {
              return true;
            }
            node = node.parentElement;
          }
          return false;
        })
        .map((element) => element.textContent?.trim().slice(0, 60))
    );
    expect(hidden).toEqual([]);
    await expect(
      page.getByRole("link", { name: "Get started" }).first()
    ).toHaveAttribute("href", /\/auth\/sign-up$/u);
    await context.close();
  });

  test("reduced motion shows the push notification at once", async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(`${target.site}/`);
    const notification = page
      .getByRole("figure", { name: /push notification/iu })
      .first();
    await expect(notification).toBeVisible();
    await expect
      .poll(() =>
        notification.evaluate((element) => getComputedStyle(element).opacity)
      )
      .toBe("1");
    await context.close();
  });

  test("pricing: periods outside, Solo or Team inside the card", async ({
    page,
  }) => {
    await page.goto(`${target.site}/#pricing`);
    const pricing = page.locator("#pricing");
    const hosted = pricing.locator("[data-plan]").first();
    // Prices roll (NumberFlow), so they're read from `data-price`.
    const price = hosted.locator("[data-price]");
    // Lifetime, the launch offer, and Solo are selected first.
    await expect(hosted).toHaveAttribute("data-plan", "solo_lifetime");
    await expect(price).toHaveAttribute("data-price", "79");
    await hosted.locator('[data-size="team"]').click();
    await expect(hosted).toHaveAttribute("data-plan", "team_lifetime");
    await expect(price).toHaveAttribute("data-price", "499");
    await pricing.locator('[data-period="month"]').click();
    await expect(hosted).toHaveAttribute("data-plan", "team");
    await expect(price).toHaveAttribute("data-price", "39");
    await expect(hosted).toContainText("Start 14-day free trial");
    await hosted.locator('[data-size="solo"]').click();
    await expect(price).toHaveAttribute("data-price", "9");
    await pricing.locator('[data-period="year"]').click();
    await expect(price).toHaveAttribute("data-price", "90");
    await expect(pricing.locator('[data-plan="self-host"]')).toContainText(
      "$0"
    );
    await expect(
      pricing.getByRole("link", { name: "View on GitHub" })
    ).toHaveAttribute("href", /github\.com\/emitkithq\//u);
  });

  test("fits a phone without sideways scrolling", async ({ browser }) => {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { height: 844, width: 390 },
    });
    const page = await context.newPage();
    await page.goto(`${target.site}/`);
    await expect(
      page.getByRole("heading", { level: 1, name: HEADLINE })
    ).toBeVisible();
    await scrollThrough(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await context.close();
  });
});
