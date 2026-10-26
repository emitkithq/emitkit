import { ApiSession } from "@e2e/support/api-session";
import { target } from "@e2e/support/targets";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * The colour theme: System, Light or Dark from the account menu, remembered
 * across reloads. Ways it can break, each checked below:
 *
 * - The stored choice loses to the OS (or the OS to the stored choice): the
 *   OS scheme is always set opposite to the choice being checked.
 * - A reload flashes or falls back (the choice must hold on the first paint,
 *   before the app's script runs).
 * - System doesn't follow the OS when it changes.
 * - Brand artwork keeps its light colours on dark (kit rule: white on dark).
 */
test.describe.configure({ mode: "serial" });

let page: Page;
let session: ApiSession;
let organizationId = "";
let orgPath = "";

const htmlTheme = () =>
  page.evaluate(() => document.documentElement.dataset.theme);

const choose = async (label: "Dark theme" | "Light theme" | "System theme") => {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("radio", { name: label }).click();
  await page.keyboard.press("Escape");
};

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  session = await ApiSession.signUp(page.request, "theme");
  const workspace = await session.bootstrap("Theme Co", "Theme App");
  ({ organizationId } = workspace);
  orgPath = `/${workspace.organizationSlug}`;
});

test.afterAll(async () => {
  await session.destroy(organizationId);
  await page.close();
});

test("System follows the OS, live", async () => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(`${target.app}${orgPath}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Events" })
  ).toBeAttached();
  expect(await htmlTheme()).toBe("light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(htmlTheme).toBe("dark");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#050606"
  );
});

test("Light holds against a dark OS, across reloads", async () => {
  await page.emulateMedia({ colorScheme: "dark" });
  await choose("Light theme");
  expect(await htmlTheme()).toBe("light");
  await page.reload();
  await expect.poll(htmlTheme).toBe("light");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#f4f4f2"
  );
});

test("Dark holds against a light OS, across reloads and pages", async () => {
  await page.emulateMedia({ colorScheme: "light" });
  await choose("Dark theme");
  expect(await htmlTheme()).toBe("dark");
  // With the app's script blocked, only index.html's inline script runs
  // (the document itself says light): the first paint is already dark.
  const appScript = /\/(?:app\/main\.tsx|assets\/app-[\w-]+\.js)/u;
  await page.route(appScript, (route) => route.abort());
  await page.reload();
  expect(await htmlTheme()).toBe("dark");
  await page.unroute(appScript);
  await page.reload();
  await expect.poll(htmlTheme).toBe("dark");
  await page.goto(`${target.app}${orgPath}/projects`);
  await expect.poll(htmlTheme).toBe("dark");
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByRole("radio", { name: "Dark theme" })).toBeChecked();
  await page.keyboard.press("Escape");
});

test("brand artwork turns white on dark", async ({ browser }) => {
  // Signed out, dark: the sign-in page's wordmark.
  const context = await browser.newContext({ colorScheme: "dark" });
  const signedOut = await context.newPage();
  await signedOut.goto(`${target.app}/auth/sign-in`);
  const fill = await signedOut
    .getByRole("link", { name: "EmitKit home" })
    .locator("svg")
    .evaluate((svg) => getComputedStyle(svg).fill);
  expect(fill).toBe("rgb(255, 255, 255)");
  await context.close();
});

test("back to System", async () => {
  await page.emulateMedia({ colorScheme: "light" });
  await choose("System theme");
  expect(await htmlTheme()).toBe("light");
  expect(
    await page.evaluate(() => localStorage.getItem("emitkit:theme"))
  ).toBeNull();
});
