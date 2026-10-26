import { ApiSession } from "@e2e/support/api-session";
import { attachHttpLog, recordResponse } from "@e2e/support/http-log";
import { target } from "@e2e/support/targets";
import { expect, request as playwrightRequest, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

/**
 * Reads and scopes (docs/content/api/index.mdx): what
 * the CLI, MCP and SDK 3 build on.
 *
 * Ways it could fail, each covered below:
 * - `GET /v1/events` shows another project's or organization's events, or
 *   a page repeats or skips events, or a filter is ignored;
 * - a bad filter is accepted, or rejected without saying which one;
 * - `GET /v1/channels` lists channels of other projects;
 * - `GET /v1/me` names the wrong organization or project, or its scopes;
 * - a read-only key can send events or identify users, over REST or MCP;
 * - MCP offers a read-only key tools it can't use, or answers a bad key
 *   inside a 200 instead of an HTTP 401 (clients start auth on a 401);
 * - rotating a read-only key makes it a full one;
 * - identify refuses `userId`, or accepts `userId` and `user_id` that differ;
 * - the dashboard can't create a read-only key, or doesn't say which is.
 */
test.describe.configure({ mode: "serial" });

let context: APIRequestContext;
let outsiderContext: APIRequestContext;
let session: ApiSession;
let outsider: ApiSession;
let organizationId: string;
let outsiderOrganizationId: string;
let apiKey: string;
let otherProjectKey: string;
let outsiderKey: string;
let readKey: string;
let readKeyId: string;

interface Page {
  events: { id: string; title: string; channelName: string; answer: unknown }[];
  nextCursor: string | null;
}

const call = async (
  method: "GET" | "POST" | "DELETE",
  path: string,
  options: { body?: unknown; key?: string } = {}
) => {
  const url = `${target.api}${path}`;
  const response = await context.fetch(url, {
    data: options.body,
    headers: {
      ...(options.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...(options.key === undefined
        ? {}
        : { authorization: `Bearer ${options.key}` }),
    },
    method,
  });
  return recordResponse(method, url, options.body ?? null, response);
};

const read = async <T>(path: string, key = apiKey) => {
  const response = await call("GET", path, { key });
  return {
    body: (await response.json()) as { data: T; code?: string },
    status: response.status(),
  };
};

const send = async (body: Record<string, unknown>, key = apiKey) => {
  const response = await call("POST", "/v1/events", { body, key });
  expect(response.status(), JSON.stringify(body)).toBe(201);
  const json: { data: { id: string } } = await response.json();
  return json.data.id;
};

const mcp = async (key: string, method: string, params?: unknown) => {
  const response = await call("POST", "/mcp", {
    body: { id: 1, jsonrpc: "2.0", method, params },
    key,
  });
  return { body: await response.json(), status: response.status() };
};

test.afterEach(async ({}, testInfo) => {
  await attachHttpLog(testInfo);
});

test.beforeAll(async () => {
  context = await playwrightRequest.newContext();
  session = await ApiSession.signUp(context, "reads");
  const workspace = await session.bootstrap("E2E Reads Co", "Storefront");
  ({ organizationId } = workspace);
  apiKey = workspace.apiKey.secret;
  const other = await session.rpc<{ id: string }>("projects/create", {
    name: "Back office",
  });
  const otherKey = await session.rpc<{ secret: string }>("apiKeys/create", {
    name: "back office",
    projectId: other.id,
  });
  otherProjectKey = otherKey.secret;
  const readOnly = await session.rpc<{
    apiKey: { id: string; access: string };
    secret: string;
  }>("apiKeys/create", {
    access: "read",
    name: "dashboard reader",
    projectId: workspace.project.id,
  });
  expect(readOnly.apiKey.access).toBe("read");
  readKey = readOnly.secret;
  readKeyId = readOnly.apiKey.id;
  outsiderContext = await playwrightRequest.newContext();
  outsider = await ApiSession.signUp(outsiderContext, "reads-outsider");
  const outsiderWorkspace = await outsider.bootstrap(
    "E2E Reads Outsider",
    "Elsewhere"
  );
  outsiderOrganizationId = outsiderWorkspace.organizationId;
  outsiderKey = outsiderWorkspace.apiKey.secret;
});

test.afterAll(async () => {
  await session.destroy(organizationId);
  await outsider.destroy(outsiderOrganizationId);
  await context.dispose();
  await outsiderContext.dispose();
});

test("GET /v1/me names the organization, project and scopes", async () => {
  const me = await read<unknown>("/v1/me");
  expect(me.status).toBe(200);
  expect(me.body.data).toEqual({
    organization: { id: organizationId, name: "E2E Reads Co" },
    project: { id: expect.any(String), name: "Storefront" },
    scopes: ["events:write", "events:read", "identities:write"],
    via: "api_key",
  });
  const readOnly = await read<{ scopes: string[] }>("/v1/me", readKey);
  expect(readOnly.body.data.scopes).toEqual(["events:read"]);
});

test("GET /v1/events: newest first, paged by before, filtered by channel and time", async () => {
  const titles = ["Order #1", "Order #2", "Order #3"];
  for (const title of titles) {
    await send({ channelName: "orders", title });
  }
  const question = await send({
    actions: [{ id: "ship", label: "Ship" }],
    channelName: "deploys",
    title: "Ship it?",
  });
  await send(
    { channelName: "back-office", title: "Elsewhere" },
    otherProjectKey
  );
  await send({ channelName: "orders", title: "Outsider order" }, outsiderKey);

  const all = await read<Page>("/v1/events");
  expect(all.status).toBe(200);
  expect(all.body.data.events.map((event) => event.title)).toEqual([
    "Ship it?",
    "Order #3",
    "Order #2",
    "Order #1",
  ]);
  const [asked] = all.body.data.events;
  expect(asked?.id).toBe(question);
  expect(asked?.answer).toMatchObject({ status: "pending" });
  expect(all.body.data.nextCursor).toBeNull();

  const first = await read<Page>("/v1/events?limit=2");
  expect(first.body.data.events.map((event) => event.title)).toEqual([
    "Ship it?",
    "Order #3",
  ]);
  expect(first.body.data.nextCursor).toEqual(expect.any(String));
  const second = await read<Page>(
    `/v1/events?limit=2&before=${encodeURIComponent(first.body.data.nextCursor ?? "")}`
  );
  expect(second.body.data.events.map((event) => event.title)).toEqual([
    "Order #2",
    "Order #1",
  ]);

  // One by one, the pages add up to the whole list, in order.
  const walked: string[] = [];
  let cursor: string | null = "";
  while (cursor !== null) {
    const query: string = cursor
      ? `?limit=1&before=${encodeURIComponent(cursor)}`
      : "?limit=1";
    const step = await read<Page>(`/v1/events${query}`);
    walked.push(...step.body.data.events.map((event) => event.title));
    cursor = step.body.data.nextCursor;
  }
  expect(walked).toEqual(all.body.data.events.map((event) => event.title));

  // since is inclusive: an event's own createdAt finds it.
  const oldest = all.body.data.events.at(-1) as unknown as {
    createdAt: string;
    title: string;
  };
  const fromOldest = await read<Page>(
    `/v1/events?since=${encodeURIComponent(oldest.createdAt)}`
  );
  expect(fromOldest.body.data.events.map((event) => event.title)).toContain(
    oldest.title
  );

  // The channel is named the way createEvent names it.
  const capitalized = await read<Page>("/v1/events?channel=Orders");
  expect(capitalized.body.data.events).toHaveLength(3);

  const orders = await read<Page>("/v1/events?channel=orders");
  expect(orders.body.data.events.map((event) => event.channelName)).toEqual([
    "orders",
    "orders",
    "orders",
  ]);
  const none = await read<Page>("/v1/events?channel=nothing-here");
  expect(none.body.data).toEqual({ events: [], nextCursor: null });
  const future = await read<Page>(
    `/v1/events?since=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`
  );
  expect(future.body.data.events).toEqual([]);

  // Other projects and organizations see only their own.
  const otherProject = await read<Page>("/v1/events", otherProjectKey);
  expect(otherProject.body.data.events.map((event) => event.title)).toEqual([
    "Elsewhere",
  ]);
  const otherOrganization = await read<Page>("/v1/events", outsiderKey);
  expect(
    otherOrganization.body.data.events.map((event) => event.title)
  ).toEqual(["Outsider order"]);
});

test("a bad filter says which one", async () => {
  for (const [query, path] of [
    ["limit=0", "limit"],
    ["limit=abc", "limit"],
    ["limit=101", "limit"],
    ["before=yesterday", "before"],
    ["before=2026-09-26T10:00:00z", "before"],
    ["since=soon", "since"],
    ["since=0", "since"],
    ["since=2026-09-26T10:00:00", "since"],
    ["cursor=abc", "cursor"],
    ["channelId=channel_1", "channelId"],
  ] as const) {
    const response = await read<unknown>(`/v1/events?${query}`);
    expect(response.status, query).toBe(400);
    const body = response.body as unknown as {
      code: string;
      details: { path: string[] }[];
    };
    expect(body.code).toBe("validation_error");
    expect(body.details.map((detail) => detail.path.join("."))).toContain(path);
  }
});

test("events in a deleted channel leave the list, and paging still works", async () => {
  const [project] = await session.rpc<{ id: string }[]>("projects/list", {});
  const channels = await session.rpc<{ id: string; name: string }[]>(
    "channels/list",
    { projectId: project?.id }
  );
  const noise = await send({ channelName: "noise", title: "Noise 1" });
  await send({ channelName: "noise", title: "Noise 2" });
  expect(noise).toEqual(expect.any(String));
  const after = await session.rpc<{ id: string; name: string }[]>(
    "channels/list",
    { projectId: project?.id }
  );
  const created = after.find(
    (channel) => !channels.some((known) => known.id === channel.id)
  );
  await session.rpc("channels/remove", { id: created?.id });
  // The two newest rows are in the deleted channel: the first page still fills.
  const page = await read<Page>("/v1/events?limit=2");
  expect(page.body.data.events.map((event) => event.channelName)).not.toContain(
    "noise"
  );
  expect(page.body.data.events).toHaveLength(2);
  expect(page.body.data.nextCursor).toEqual(expect.any(String));
});

test("GET /v1/channels lists the project's channels only", async () => {
  const channels = await read<{ channels: { name: string; id: string }[] }>(
    "/v1/channels"
  );
  expect(channels.status).toBe(200);
  expect(channels.body.data.channels.map((channel) => channel.name)).toEqual([
    "deploys",
    "orders",
  ]);
  const other = await read<{ channels: { name: string }[] }>(
    "/v1/channels",
    otherProjectKey
  );
  expect(other.body.data.channels.map((channel) => channel.name)).toEqual([
    "back-office",
  ]);
});

test("a read-only key reads, and can't send or identify", async () => {
  const events = await read<Page>("/v1/events", readKey);
  expect(events.status).toBe(200);
  const channels = await read<unknown>("/v1/channels", readKey);
  expect(channels.status).toBe(200);

  const sent = await call("POST", "/v1/events", {
    body: { channelName: "orders", title: "Not allowed" },
    key: readKey,
  });
  expect(sent.status()).toBe(403);
  expect(await sent.json()).toMatchObject({
    code: "forbidden",
    message: expect.stringContaining("events:write"),
  });
  const identified = await call("POST", "/v1/identify", {
    body: { userId: "cus_1" },
    key: readKey,
  });
  expect(identified.status()).toBe(403);
  const removed = await call("DELETE", "/v1/identities/cus_1", {
    key: readKey,
  });
  expect(removed.status()).toBe(403);

  // MCP offers it the read tools only.
  const tools = await mcp(readKey, "tools/list");
  expect(
    (tools.body.result.tools as { name: string }[])
      .map((tool) => tool.name)
      .toSorted()
  ).toEqual(["getEvent", "listChannels", "listEvents"]);
  const refused = await mcp(readKey, "tools/call", {
    arguments: { channelName: "orders", title: "Not allowed" },
    name: "createEvent",
  });
  // Called anyway, it answers like REST: 403 naming the scope.
  expect(refused.body.result).toMatchObject({
    isError: true,
    structuredContent: {
      code: "forbidden",
      message: expect.stringContaining("events:write"),
    },
  });
  const listed = await mcp(readKey, "tools/call", {
    arguments: { channel: "orders", limit: 1 },
    name: "listEvents",
  });
  expect(listed.body.result.isError).toBe(false);
  expect(listed.body.result.structuredContent.data.events).toHaveLength(1);

  // Rotating keeps it read-only.
  const rotated = await session.rpc<{
    apiKey: { access: string };
    secret: string;
  }>("apiKeys/rotate", { id: readKeyId });
  expect(rotated.apiKey.access).toBe("read");
  const rotatedMe = await read<{ scopes: string[] }>("/v1/me", rotated.secret);
  expect(rotatedMe.body.data.scopes).toEqual(["events:read"]);
  readKey = rotated.secret;
});

test("MCP listEvents takes exactly the REST query parameters", async () => {
  const tools = await mcp(apiKey, "tools/list");
  const listEvents = (
    tools.body.result.tools as {
      name: string;
      inputSchema: { properties: Record<string, Record<string, unknown>> };
    }[]
  ).find((tool) => tool.name === "listEvents");
  const document = await call("GET", "/openapi.json");
  const openapi = await document.json();
  const parameters: {
    name: string;
    description: string;
    schema: Record<string, unknown>;
  }[] = openapi.paths["/v1/events"].get.parameters;
  expect(
    Object.keys(listEvents?.inputSchema.properties ?? {}).toSorted()
  ).toEqual(parameters.map((parameter) => parameter.name).toSorted());
  for (const { description, name, schema } of parameters) {
    expect(listEvents?.inputSchema.properties[name], name).toEqual({
      ...schema,
      description,
    });
  }
});

test("MCP answers a bad key with HTTP 401, before any method", async () => {
  for (const method of ["initialize", "tools/list", "tools/call"]) {
    const response = await mcp("emitkit_notarealkey000", method);
    expect(response.status, method).toBe(401);
    expect(response.body).toMatchObject({ code: "unauthorized" });
  }
});

test("identify takes userId (user_id still works; both must agree)", async () => {
  const withUserId = await call("POST", "/v1/identify", {
    body: { properties: { plan: "pro" }, userId: "cus_reads_1" },
    key: apiKey,
  });
  expect(withUserId.status()).toBe(200);
  expect(await withUserId.json()).toMatchObject({
    data: { userId: "cus_reads_1" },
  });
  const withOldName = await call("POST", "/v1/identify", {
    body: { user_id: "cus_reads_2" },
    key: apiKey,
  });
  expect(withOldName.status()).toBe(200);
  const same = await call("POST", "/v1/identify", {
    body: { userId: "cus_reads_3", user_id: "cus_reads_3" },
    key: apiKey,
  });
  expect(same.status()).toBe(200);

  for (const [body, path] of [
    [{ userId: "a", user_id: "b" }, "user_id"],
    [{ properties: {} }, "userId"],
  ] as const) {
    const response = await call("POST", "/v1/identify", { body, key: apiKey });
    expect(response.status(), JSON.stringify(body)).toBe(400);
    const json: { details: { path: string[] }[] } = await response.json();
    expect(json.details.map((detail) => detail.path.join("."))).toContain(path);
  }
});

test("the dashboard creates a read-only key and says so", async ({
  browser,
}) => {
  const billing = await session.rpc<{ state: string }>("billing/status", {});
  test.skip(
    billing.state === "required",
    "the paywall covers the dashboard of an organization without a plan"
  );
  const signedIn = await browser.newContext({
    storageState: await context.storageState(),
  });
  const page = await signedIn.newPage();
  await page.goto(`${target.app}/`);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("link", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("link", { name: "API keys" }).click();

  await settings.getByLabel("Key name").fill("Read-only reporter");
  await settings
    .getByRole("combobox", { name: "Access" })
    .selectOption({ label: "Read-only" }, { force: true });
  await expect(settings).toContainText("Read-only keys read events");
  await settings.getByRole("button", { name: "Create API key" }).click();
  const row = settings
    .getByRole("listitem")
    .filter({ hasText: "Read-only reporter" });
  await expect(row.getByText("Read-only", { exact: true })).toBeVisible();
  // The new key's secret is on screen: dismiss it before the screenshot.
  await settings.getByRole("button", { name: "Done" }).first().click();
  const file = test.info().outputPath("read-only-key.png");
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: file });
  await test.info().attach("read-only-key", {
    contentType: "image/png",
    path: file,
  });
  await signedIn.close();
});
