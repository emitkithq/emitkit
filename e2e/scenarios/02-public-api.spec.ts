import { setTimeout as sleep } from "node:timers/promises";

import { ApiSession } from "@e2e/support/api-session";
import { attachHttpLog, recordResponse } from "@e2e/support/http-log";
import { target } from "@e2e/support/targets";
import { EmitKit, EmitKitError } from "@emitkit/js";
import { expect, request as playwrightRequest, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

/**
 * The public API contract (openapi/openapi.json) exercised through the
 * published SDK (`@emitkit/js`), raw HTTP and MCP.
 */
test.describe.configure({ mode: "serial" });

let context: APIRequestContext;
let session: ApiSession;
let organizationId: string;
let apiKey: string;

const post = async (
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
) =>
  recordResponse(
    "POST",
    `${target.api}${path}`,
    body,
    await context.post(`${target.api}${path}`, {
      data: body,
      headers: { "content-type": "application/json", ...headers },
    })
  );

test.afterEach(async ({}, testInfo) => {
  await attachHttpLog(testInfo);
});

test.beforeAll(async () => {
  context = await playwrightRequest.newContext();
  session = await ApiSession.signUp(context, "api");
  const workspace = await session.bootstrap("E2E API Co", "E2E API Project");
  ({ organizationId } = workspace);
  apiKey = workspace.apiKey.secret;
  expect(apiKey).toMatch(/^emitkit_[A-Za-z]{12}$/u);
});

test.afterAll(async () => {
  await session.destroy(organizationId);
  await context.dispose();
});

test("SDK creates events with rate-limit info and request ids", async () => {
  const client = new EmitKit(apiKey, { baseUrl: target.api });
  const event = await client.events.create({
    channelName: "Payments",
    description: "User upgraded to Pro",
    icon: "💰",
    metadata: { amount: 49, plan: "pro" },
    tags: ["billing", "pro"],
    title: "Payment received",
    userId: "cus_e2e_1",
  });
  const response = client.lastResponse;
  expect(event.id).toMatch(/^event_/u);
  expect(event.channelName).toBe("payments");
  expect(response?.rateLimit?.limit).toBe(100);
  expect(response?.rateLimit?.remaining).toBeLessThan(100);
  expect(response?.requestId).toMatch(/^[0-9a-f-]{36}$/u);
  expect(response?.replayed).toBe(false);
});

test("SDK idempotency replays the first response", async () => {
  const client = new EmitKit(apiKey, { baseUrl: target.api });
  const input = { channelName: "deploys", title: "Deploy finished" };
  const first = await client.events.create(input, {
    idempotencyKey: "e2e-deploy-1",
  });
  const replay = await client.events.create(input, {
    idempotencyKey: "e2e-deploy-1",
  });
  expect(client.lastResponse?.replayed).toBe(true);
  expect(replay.id).toBe(first.id);

  const conflict = await post(
    "/v1/events",
    { channelName: "deploys", title: "Something else" },
    {
      authorization: `Bearer ${apiKey}`,
      "idempotency-key": "e2e-deploy-1",
    }
  );
  expect(conflict.status()).toBe(409);
  expect(await conflict.json()).toMatchObject({
    error: "Idempotency conflict",
    success: false,
  });
});

test("SDK identify merges properties and claims aliases", async () => {
  const client = new EmitKit(apiKey, { baseUrl: target.api });
  const first = await client.identify({
    aliases: ["anon_e2e"],
    properties: { email: "user@example.com" },
    userId: "cus_e2e_1",
  });
  expect(first.aliases.created).toEqual(["anon_e2e"]);
  const second = await client.identify({
    properties: { plan: "pro" },
    userId: "cus_e2e_1",
  });
  expect(second.properties).toMatchObject({
    email: "user@example.com",
    plan: "pro",
  });
});

test("SDK surfaces validation errors", async () => {
  const client = new EmitKit(apiKey, { baseUrl: target.api });
  const failure = client.events.create({ channelName: "", title: "" });
  await expect(failure).rejects.toBeInstanceOf(EmitKitError);
  await expect(failure).rejects.toMatchObject({
    code: "validation_error",
    status: 400,
  });
});

test("raw HTTP error contract", async () => {
  const missing = await post("/v1/events", { channelName: "a", title: "b" });
  expect(missing.status()).toBe(401);
  expect(await missing.json()).toEqual({
    code: "unauthorized",
    error: "Unauthorized",
    message: "Invalid or missing authentication credentials",
    requestId: missing.headers()["x-request-id"],
    success: false,
  });
  expect(missing.headers()["www-authenticate"]).toContain("Bearer");

  const wrong = await post(
    "/v1/events",
    { channelName: "a", title: "b" },
    { authorization: "Bearer emitkit_notARealKeyX" }
  );
  expect(wrong.status()).toBe(401);

  const conflicting = await post(
    "/v1/events",
    { channelName: "a", title: "b" },
    {
      authorization: `Bearer ${apiKey}`,
      "x-api-key": "emitkit_somethingElse",
    }
  );
  expect(conflicting.status()).toBe(401);

  const viaHeader = await post(
    "/api/v1/events",
    { channelName: "signups", notify: false, title: "New user" },
    { "x-api-key": apiKey }
  );
  expect(viaHeader.status()).toBe(201);
  expect(viaHeader.headers()["x-ratelimit-limit"]).toBe("100");

  const invalid = await post(
    "/v1/events",
    { title: "no channel" },
    { authorization: `Bearer ${apiKey}` }
  );
  expect(invalid.status()).toBe(400);
  const invalidBody = (await invalid.json()) as {
    error: string;
    details: { path: (string | number)[] }[];
  };
  expect(invalidBody.error).toBe("Validation error");
  expect(invalidBody.details.map((detail) => detail.path.join("."))).toContain(
    "channelName"
  );

  const huge = await post(
    "/v1/events",
    {
      channelName: "big",
      metadata: { blob: "x".repeat(20_000) },
      title: "Too big",
    },
    {
      authorization: `Bearer ${apiKey}`,
    }
  );
  expect(huge.status()).toBe(413);
  expect(await huge.json()).toMatchObject({
    error: "Payload too large",
    success: false,
  });
});

/**
 * Transport details any change to the HTTP layer must keep: route aliases on
 * both hosts, the JSON 404 for unknown routes and methods, strict paths,
 * X-Request-ID matching the body's requestId, percent-encoded and long path
 * parameters, and the 1 MiB body limit applying before authentication.
 */
test("routing contract", async () => {
  const send = async (
    method: string,
    url: string,
    options: { data?: unknown; headers?: Record<string, string> } = {}
  ) =>
    recordResponse(
      method,
      url,
      options.data ?? null,
      await context.fetch(url, { method, ...options })
    );
  const auth = { authorization: `Bearer ${apiKey}` };
  const expectNotFound = async (method: string, path: string) => {
    const response = await send(method, `${target.api}${path}`, {
      headers: auth,
    });
    expect(response.status(), `${method} ${path}`).toBe(404);
    expect(await response.json()).toEqual({
      code: "not_found",
      error: "Not found",
      requestId: response.headers()["x-request-id"],
      success: false,
    });
  };

  const health = await send("GET", `${target.api}/`);
  expect(health.status()).toBe(200);
  expect(health.headers()["x-request-id"]).toMatch(/^[\da-f-]{36}$/u);

  await expectNotFound("GET", "/nope");
  await expectNotFound("PUT", "/v1/events");
  await expectNotFound("OPTIONS", "/v1/events");
  await expectNotFound("POST", "/v1/events/");
  await expectNotFound("POST", "/V1/EVENTS");
  await expectNotFound("GET", "/api/v1/nope");

  const onAppHost = await send("POST", `${target.app}/api/v1/events`, {
    data: { channelName: "aliases", notify: false, title: "Via app host" },
    headers: auth,
  });
  expect(onAppHost.status()).toBe(201);

  const userId = `e2e user/${"ü".repeat(150)}`;
  const identified = await send("POST", `${target.api}/api/v1/identify`, {
    data: { user_id: userId },
    headers: auth,
  });
  expect(identified.status()).toBe(200);
  const erased = await send(
    "DELETE",
    `${target.api}/api/v1/identities/${encodeURIComponent(userId)}`,
    { headers: auth }
  );
  expect(erased.status()).toBe(200);
  expect(await erased.json()).toMatchObject({
    data: { status: "erased", userId },
    requestId: erased.headers()["x-request-id"],
    success: true,
  });

  const oversized = await recordResponse(
    "POST",
    `${target.api}/v1/events`,
    { blob: "x repeated 1 MiB + 1 times" },
    await context.post(`${target.api}/v1/events`, {
      data: { blob: "x".repeat(1024 * 1024 + 1) },
    })
  );
  expect(oversized.status()).toBe(413);
  expect(await oversized.json()).toMatchObject({
    error: "Payload too large",
    message: "Request body exceeds the 1 MiB limit",
    success: false,
  });
});

test("identity erasure", async () => {
  const erased = await context.delete(`${target.api}/v1/identities/cus_e2e_1`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  expect(erased.status()).toBe(200);
  expect(await erased.json()).toMatchObject({
    data: { aliasesDeleted: 1, status: "erased", userId: "cus_e2e_1" },
    success: true,
  });
  const again = await context.delete(`${target.api}/v1/identities/cus_e2e_1`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  expect(again.status()).toBe(404);
});

test("events are visible in the dashboard immediately", async () => {
  const page = await session.rpc<{
    events: {
      title: string;
      channelName: string;
      metadata: Record<string, unknown>;
      userId: string | null;
    }[];
  }>("events/list", { limit: 20 });
  const payment = page.events.find(
    (event) => event.title === "Payment received"
  );
  expect(payment?.channelName).toBe("payments");
  expect(payment?.metadata).toEqual({ amount: 49, plan: "pro" });
  expect(payment?.userId, "erased identity is detached").toBeNull();
  const pulse = await session.rpc<{
    events: { current: number };
    points: { events: number }[];
    value: null | { currency: string };
  }>("events/pulse", { range: "24h" });
  expect(pulse.events.current).toBeGreaterThanOrEqual(3);
  expect(pulse.points).toHaveLength(24);
  // `amount` without `currency` is metadata, not the event's value.
  expect(pulse.value).toBeNull();
});

test("MCP: initialize, list tools, create an event", async () => {
  const rpc = (id: number, method: string, params?: unknown) =>
    post(
      "/mcp",
      { id, jsonrpc: "2.0", method, params },
      { authorization: `Bearer ${apiKey}` }
    );

  const unauthenticated = await post("/mcp", {
    id: 1,
    jsonrpc: "2.0",
    method: "initialize",
  });
  expect(unauthenticated.status()).toBe(401);

  const init = await rpc(1, "initialize", {
    capabilities: {},
    clientInfo: { name: "e2e", version: "1" },
    protocolVersion: "2025-06-18",
  });
  expect(await init.json()).toMatchObject({
    result: { protocolVersion: "2025-06-18", serverInfo: { name: "emitkit" } },
  });

  const toolsResponse = await rpc(2, "tools/list");
  const tools: { result: { tools: { name: string }[] } } =
    await toolsResponse.json();
  expect(tools.result.tools.map((tool) => tool.name).toSorted()).toEqual([
    "cancelEvent",
    "createEvent",
    "deleteIdentity",
    "getEvent",
    "identifyUser",
    "listChannels",
    "listEvents",
  ]);

  const callResponse = await rpc(3, "tools/call", {
    arguments: { channelName: "mcp", title: "From an agent" },
    name: "createEvent",
  });
  const call: {
    result: { isError: boolean; structuredContent: { success: boolean } };
  } = await callResponse.json();
  expect(call.result.isError).toBe(false);
  expect(call.result.structuredContent.success).toBe(true);
});

test("MCP transport: methods, notifications, every tool, shared request id", async () => {
  const auth = { authorization: `Bearer ${apiKey}` };
  const get = await recordResponse(
    "GET",
    `${target.api}/mcp`,
    null,
    await context.get(`${target.api}/mcp`, { headers: auth })
  );
  expect(get.status()).toBe(405);
  expect(get.headers().allow).toBe("POST");
  expect(await get.json()).toEqual({
    code: "method_not_allowed",
    error: "Use POST for MCP requests",
    requestId: get.headers()["x-request-id"],
    success: false,
  });

  const notification = await post(
    "/mcp",
    { jsonrpc: "2.0", method: "notifications/initialized" },
    auth
  );
  expect(notification.status()).toBe(202);
  expect(await notification.text()).toBe("");

  const garbage = await post("/mcp", { not: "json-rpc" }, auth);
  expect(await garbage.json()).toMatchObject({
    error: { code: -32_700 },
    id: null,
    jsonrpc: "2.0",
  });

  interface ToolResult {
    result: {
      isError: boolean;
      structuredContent: {
        data?: Record<string, unknown>;
        requestId?: string;
      };
    };
  }
  const call = async (id: number, name: string, args: unknown) => {
    const response = await post(
      "/mcp",
      {
        id,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: args, name },
      },
      auth
    );
    const body: ToolResult = await response.json();
    return { body, requestId: response.headers()["x-request-id"] };
  };

  const identified = await call(1, "identifyUser", {
    properties: { plan: "pro" },
    user_id: "mcp/user 1",
  });
  expect(identified.body.result.isError).toBe(false);
  expect(identified.body.result.structuredContent).toMatchObject({
    data: { properties: { plan: "pro" }, userId: "mcp/user 1" },
    requestId: identified.requestId,
  });

  const deleted = await call(2, "deleteIdentity", { user_id: "mcp/user 1" });
  expect(deleted.body.result.isError).toBe(false);
  expect(deleted.body.result.structuredContent.data).toMatchObject({
    status: "erased",
    userId: "mcp/user 1",
  });

  const missing = await call(3, "deleteIdentity", { user_id: "mcp/user 1" });
  expect(missing.body.result.isError).toBe(true);

  const unknown = await post(
    "/mcp",
    {
      id: 4,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { arguments: {}, name: "dropTables" },
    },
    auth
  );
  expect(await unknown.json()).toMatchObject({ error: { code: -32_602 } });
});

test("rate limit: the 101st request in a minute gets 429 with Retry-After", async () => {
  const [project] = await session.rpc<{ id: string }[]>("projects/list", {});
  const created = await session.rpc<{ secret: string }>("apiKeys/create", {
    name: "rate-limit probe",
    projectId: project?.id,
  });
  const headers = { authorization: `Bearer ${created.secret}` };
  const statuses: number[] = [];
  for (let batch = 0; batch < 11; batch += 1) {
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        post(
          "/v1/events",
          { channelName: "load", notify: false, title: "burst" },
          headers
        )
      )
    );
    statuses.push(...responses.map((response) => response.status()));
  }
  expect(
    statuses.filter((status) => status === 201).length
  ).toBeLessThanOrEqual(100);
  const limited = await post(
    "/v1/events",
    { channelName: "load", title: "one more" },
    headers
  );
  expect(limited.status()).toBe(429);
  expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
  expect(limited.headers()["x-ratelimit-remaining"]).toBe("0");
  expect(await limited.json()).toMatchObject({
    error: "Rate limit exceeded",
    success: false,
  });
});

/**
 * The window is fixed: it starts with a key's first request and lasts 60 s.
 * Unpatched, Better Auth only reset the count after 60 idle seconds, so a
 * steady client (an agent polling an answer) was blocked after 100
 * requests. Here a request halfway through keeps the key busy: with a
 * sliding window the batch after the minute would still count as the
 * first window.
 */
test("rate limit: a steady client gets a fresh window every minute", async () => {
  test.setTimeout(120_000);
  const [project] = await session.rpc<{ id: string }[]>("projects/list", {});
  const created = await session.rpc<{ secret: string }>("apiKeys/create", {
    name: "steady probe",
    projectId: project?.id,
  });
  const headers = { authorization: `Bearer ${created.secret}` };
  const send = () =>
    post(
      "/v1/events",
      { channelName: "load", notify: false, title: "steady" },
      headers
    );
  const statuses = async (count: number) => {
    const responses = await Promise.all(Array.from({ length: count }, send));
    return responses.map((response) => response.status());
  };
  expect(await statuses(90)).not.toContain(429);
  await sleep(30_000);
  expect(await statuses(1)).toEqual([201]);
  await sleep(31_000);
  const nextWindow = await statuses(20);
  expect(nextWindow.filter((status) => status === 201)).toHaveLength(20);
});
