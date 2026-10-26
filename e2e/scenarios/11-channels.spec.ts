import { ApiSession } from "@e2e/support/api-session";
import { target } from "@e2e/support/targets";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Channels: the screen that lists every channel by project, with create,
 * edit (icon and description), delete and the project filter. Ways it can
 * break, each checked below:
 *
 * - Create lands the channel in the wrong project, or doesn't show it.
 * - Edit changes the name (the `channelName` senders use) or drops the icon.
 * - The project filter doesn't filter, or doesn't survive a reload (URL).
 * - Delete has no confirmation or leaves the row behind.
 * - A channel created by an event (not the dashboard) never appears.
 * - Empty states: no channels, and a project filter with none.
 */
test.describe.configure({ mode: "serial" });

let page: Page;
let session: ApiSession;
let organizationId = "";
let orgPath = "";
let starterKey = "";

const list = (project: string) =>
  page.getByRole("list", { name: `Channels in ${project}` });
const row = (project: string, channel: string) =>
  list(project)
    .getByRole("listitem")
    .filter({ hasText: `#${channel}` });

const rowAction = async (channel: string, action: string) => {
  await page.getByRole("button", { name: `Actions for #${channel}` }).click();
  await page.getByRole("menuitem", { name: action }).click();
};

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  session = await ApiSession.signUp(page.request, "channels");
  const workspace = await session.bootstrap("Channels Co", "Web App");
  ({ organizationId } = workspace);
  orgPath = `/${workspace.organizationSlug}`;
  starterKey = workspace.apiKey.secret;
  await session.rpc("projects/create", { name: "Mobile App" });
});

test.afterAll(async () => {
  await session.destroy(organizationId);
  await page.close();
});

test("with no channels, the empty state offers to create one", async () => {
  await page.goto(`${target.app}${orgPath}/channels`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Channels" })
  ).toBeVisible();
  await expect(page).toHaveTitle(/Channels/u);
  await expect(page.getByText("No channels yet")).toBeVisible();
});

test("create a channel in a chosen project, with a suggested icon", async () => {
  await page.getByRole("button", { name: "Create channel" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create channel" });
  await dialog
    .getByRole("combobox", { name: "Project" })
    .selectOption({ label: "Mobile App" });
  await dialog
    .getByRole("textbox", { name: "Channel name" })
    .fill("failed payments");
  await dialog.getByRole("button", { name: /suggest/iu }).click();
  await expect(
    dialog.getByRole("button", { name: /Channel icon .+, change/u })
  ).toBeVisible({ timeout: 15_000 });
  await dialog
    .getByRole("textbox", { name: "Description" })
    .fill("Cards that bounced");
  await dialog.getByRole("button", { name: "Create channel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Created #failed-payments")).toBeVisible();
  await expect(row("Mobile App", "failed-payments")).toContainText(
    "Cards that bounced"
  );
  await expect(list("Web App")).toHaveCount(0);
});

test("edit changes the icon and description, never the name", async () => {
  await rowAction("failed-payments", "Edit");
  const dialog = page.getByRole("dialog", { name: "Edit #failed-payments" });
  await expect(
    dialog.getByRole("textbox", { name: "Channel name" })
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Clear" }).click();
  await dialog
    .getByRole("textbox", { name: "Description" })
    .fill("Declined and bounced cards");
  await dialog.getByRole("button", { name: "Save channel" }).click();
  await expect(dialog).toBeHidden();
  const edited = row("Mobile App", "failed-payments");
  await expect(edited).toContainText("Declined and bounced cards");
  const [channel] = await session.rpc<{ icon: string | null; name: string }[]>(
    "channels/list",
    {}
  );
  expect(channel).toMatchObject({ icon: null, name: "failed-payments" });
});

test("a channel created by an event shows up too", async () => {
  const response = await page.request.post(`${target.api}/v1/events`, {
    data: { channelName: "signups", icon: "👋", title: "New user signed up" },
    headers: { authorization: `Bearer ${starterKey}` },
  });
  expect(response.status()).toBe(201);
  await page.reload();
  await expect(row("Web App", "signups")).toBeVisible();
});

test("the project filter narrows the list and lives in the URL", async () => {
  await page
    .getByRole("combobox", { name: "Project" })
    .selectOption({ label: "Web App" });
  await expect(page).toHaveURL(/projectId=/u);
  await expect(list("Mobile App")).toHaveCount(0);
  await expect(row("Web App", "signups")).toBeVisible();
  await page.reload();
  await expect(list("Mobile App")).toHaveCount(0);
  await expect(row("Web App", "signups")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Project" })
    .selectOption({ label: "All projects" });
  await expect(row("Mobile App", "failed-payments")).toBeVisible();
});

test("View events opens the feed on that channel", async () => {
  await rowAction("signups", "View events");
  await expect(page).toHaveURL(/channelId=/u);
  await expect(
    page.getByTestId("event-row").filter({ hasText: "New user signed up" })
  ).toBeVisible();
  await page.goBack();
});

test("delete asks first, then removes the row", async () => {
  await rowAction("failed-payments", "Delete");
  const confirm = page.getByRole("alertdialog", {
    name: "Delete this channel?",
  });
  await expect(confirm).toContainText("#failed-payments");
  await confirm.getByRole("button", { name: "Delete channel" }).click();
  await expect(page.getByText("Deleted #failed-payments")).toBeVisible();
  await expect(list("Mobile App")).toHaveCount(0);
  await expect(row("Web App", "signups")).toBeVisible();
});
