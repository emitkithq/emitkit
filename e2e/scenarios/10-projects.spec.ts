import { ApiSession } from "@e2e/support/api-session";
import { target } from "@e2e/support/targets";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Projects: the list, create, edit, delete and restore, and the empty state.
 * Ways it can break, each checked below:
 *
 * - A new or edited project doesn't show until a reload (stale query).
 * - A long name fails to save (D1 rejects LIKE patterns over 50 bytes; the
 *   unique-slug lookup used one).
 * - Delete has no confirmation, or the deleted project can't be found again
 *   (the Deleted list and Restore).
 * - With no projects the page is blank instead of offering to create one.
 */
test.describe.configure({ mode: "serial" });

const LONG_NAME = "Northwind Traders International Commerce Platform EMEA";

let page: Page;
let session: ApiSession;
let organizationId = "";
let orgPath = "";

const row = (name: string) =>
  page.getByRole("list", { name: "Projects" }).getByRole("listitem").filter({
    hasText: name,
  });

const rowAction = async (name: string, action: string) => {
  await page.getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: action }).click();
};

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  session = await ApiSession.signUp(page.request, "projects");
  const workspace = await session.bootstrap("Projects Co", "Starter App");
  ({ organizationId } = workspace);
  orgPath = `/${workspace.organizationSlug}`;
});

test.afterAll(async () => {
  await session.destroy(organizationId);
  await page.close();
});

test("the list shows each project with its channels and first-event state", async () => {
  await page.goto(`${target.app}${orgPath}/projects`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Projects" })
  ).toBeVisible();
  await expect(page).toHaveTitle(/Projects/u);
  const starter = row("Starter App");
  await expect(starter).toBeVisible();
  await expect(starter).toContainText("No events yet");
  await expect(starter).toContainText(/\d+ channels?/u);
});

test("create a project with a long name, a website and a description", async () => {
  await page.getByRole("button", { name: "Create project" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create project" });
  await dialog.getByRole("textbox", { name: "Project name" }).fill(LONG_NAME);
  await dialog
    .getByRole("textbox", { name: "Website URL" })
    .fill("northwind.example.com");
  await dialog
    .getByRole("textbox", { name: "Description" })
    .fill("The storefront and partner portal");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`Created ${LONG_NAME}`)).toBeVisible();
  await expect(row(LONG_NAME)).toContainText("northwind.example.com");
});

test("edit a project from its row menu", async () => {
  await rowAction(LONG_NAME, "Edit");
  const dialog = page.getByRole("dialog", { name: "Edit project" });
  await expect(
    dialog.getByRole("textbox", { name: "Description" })
  ).toHaveValue("The storefront and partner portal");
  await dialog.getByRole("textbox", { name: "Project name" }).fill("Northwind");
  await dialog.getByRole("button", { name: "Save project" }).click();
  await expect(dialog).toBeHidden();
  await expect(row("Northwind")).toBeVisible();
  await expect(row(LONG_NAME)).toHaveCount(0);
});

test("delete asks first, then the project waits under Deleted until restored", async () => {
  await rowAction("Northwind", "Delete");
  const confirm = page.getByRole("alertdialog", {
    name: "Delete this project?",
  });
  await expect(confirm).toContainText("Northwind");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(row("Northwind")).toBeVisible();

  await rowAction("Northwind", "Delete");
  await page.getByRole("button", { name: "Delete project" }).click();
  await expect(row("Northwind")).toHaveCount(0);

  await page.getByRole("radio", { name: /Deleted/u }).click();
  const deleted = page
    .getByRole("list", { name: "Deleted projects" })
    .getByRole("listitem")
    .filter({ hasText: "Northwind" });
  await expect(deleted).toContainText(/Deleted \d/u);
  await page.getByRole("button", { name: "Restore Northwind" }).click();
  await expect(page.getByText("Restored Northwind")).toBeVisible();
  // Nothing left under Deleted: the switch goes and the active list is back.
  await expect(page.getByRole("radio", { name: /Deleted/u })).toHaveCount(0);
  await expect(row("Northwind")).toBeVisible();
});

test("with no projects, the empty state offers to create one", async () => {
  const projects = await session.rpc<{ id: string }[]>("projects/list", {});
  for (const project of projects) {
    await session.rpc("projects/remove", { id: project.id });
  }
  await page.goto(`${target.app}${orgPath}/projects`);
  const empty = page.getByText("No projects yet");
  await expect(empty).toBeVisible();
  await page
    .locator(".empty-state")
    .getByRole("button", { name: "Create project" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Create project" })
  ).toBeVisible();
  await page.keyboard.press("Escape");
});
