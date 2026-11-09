import { execFileSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import type { IncomingHttpHeaders, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import { ApiSession } from "@e2e/support/api-session";
import { attachHttpLog, recordResponse } from "@e2e/support/http-log";
import { target } from "@e2e/support/targets";
import { expect, request as playwrightRequest, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

/**
 * MCP Events (protocol 2026-07-28, webhook delivery). Ways it can break, each
 * checked below:
 *
 * - Modern requests are served like legacy ones: no `server/discover`, no
 *   `events` capability, header/body mismatches accepted, unknown versions
 *   answered instead of rejected with the supported list.
 * - `events/list` drifts from what `events/subscribe` accepts, answers without
 *   a valid credential, or session-era clients (`initialize`) can't find or
 *   use MCP Events.
 * - Unsafe callbacks are stored: plain http, private or loopback addresses
 *   (also as IPv6 that carries IPv4, like 6to4 and Teredo, or in decimal and
 *   hex), local names written with a trailing dot, credentials in the URL, or
 *   a malformed `whsec_` secret.
 * - A callback starts receiving data without proving it wants it: the
 *   challenge isn't sent, isn't signed, or a wrong echo is accepted (a
 *   receiver that reflects any request body proves nothing).
 * - A verification is trusted for ever, so a callback whose domain changed
 *   hands keeps receiving events.
 * - A receiver's huge reply is read whole into the Worker's memory.
 * - `events/list` offers an event to a credential that can't subscribe to it.
 * - A redirect is followed, handing the handshake or an event to another URL.
 * - The subscribe result carries fields the spec doesn't define.
 * - Subscribing twice creates two subscriptions (duplicate deliveries), or a
 *   refresh changes the id.
 * - Signatures don't verify with an independent Standard Webhooks
 *   implementation, `webhook-id` differs from `eventId`, or the subscription
 *   id header is missing.
 * - Filters leak: events from another channel are delivered.
 * - `notify: false` events are skipped (they only opt out of push).
 * - Feedback loop: an agent that reacts to an event by creating one gets
 *   its own event back.
 * - Secret rotation drops deliveries signed for the old secret.
 * - A failed delivery is lost, or its retry changes the event id or reuses a
 *   stale timestamp and signature.
 * - Unsubscribe, a revoked API key, or a `410 Gone` from the receiver leave
 *   delivery running.
 * - One key subscribes without bound.
 *
 * Delivery needs a callback the Worker can reach. Locally that is a receiver
 * in this process on `http://localhost`, which only `vite dev` accepts. Against
 * a build (production, or `pnpm preview`) the same URL must be refused, and
 * the delivery tests skip.
 */
test.describe.configure({ mode: "serial" });

const MODERN = "2026-07-28";
/** `vite dev` serves the site's unrendered shell; builds prerender it. */
let isDevServer = false;

let context: APIRequestContext;
let session: ApiSession;
let organizationId: string;
let projectId: string;
/** The agent's key: it subscribes. */
let agentKey: string;
/** The app's key: it creates the events the agent hears about. */
let appKey: string;
let receiver: Receiver;

// ---------------------------------------------------------------------------
// A Standard Webhooks receiver, verified with node:crypto (independent of the
// Worker's crypto.subtle signer).

interface Delivery {
  readonly path: string;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
  readonly json: Record<string, unknown>;
}

/**
 * `fail-once` answers 500 to the first event it gets, then 2xx; `redirect`
 * sends everything to `/redirected`; `reflect` answers with the request body;
 * `bare-echo` answers with the challenge alone; `huge` streams an endless reply.
 */
type Behaviour =
  | "echo"
  | "wrong-echo"
  | "reflect"
  | "bare-echo"
  | "huge"
  | "fail"
  | "fail-once"
  | "gone"
  | "redirect";

interface Receiver {
  readonly origin: string;
  readonly deliveries: Delivery[];
  behaviour: Map<string, Behaviour>;
  close: () => Promise<void>;
}

/** How much the `huge` receiver offers: far more than the Worker should read. */
const HUGE_REPLY_BYTES = 256 * 1024 * 1024;
/** The Worker reads 4 KB; the rest of this allows for socket buffers. */
const HUGE_REPLY_WRITE_LIMIT = 8 * 1024 * 1024;
let hugeBytesWritten = 0;

const writeHugeReply = (res: ServerResponse) => {
  const chunk = Buffer.alloc(64 * 1024, "x");
  res.writeHead(200, { "content-type": "application/json" });
  const write = () => {
    while (!res.destroyed && hugeBytesWritten < HUGE_REPLY_BYTES) {
      hugeBytesWritten += chunk.length;
      if (!res.write(chunk)) {
        res.once("drain", write);
        return;
      }
    }
    res.end();
  };
  write();
};

const startReceiver = async (): Promise<Receiver> => {
  const deliveries: Delivery[] = [];
  const behaviour = new Map<string, Behaviour>();
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf-8");
      const json = JSON.parse(body || "{}") as Record<string, unknown>;
      const path = req.url ?? "/";
      deliveries.push({ body, headers: req.headers, json, path });
      const mode = behaviour.get(path) ?? "echo";
      if (mode === "fail-once" && json.type === undefined) {
        behaviour.set(path, "echo");
        res.writeHead(500).end("try again");
        return;
      }
      if (mode === "fail") {
        res.writeHead(500).end("nope");
        return;
      }
      if (mode === "gone") {
        res.writeHead(410).end();
        return;
      }
      if (mode === "redirect") {
        res.writeHead(307, { location: "/redirected" }).end();
        return;
      }
      if (mode === "reflect") {
        res.writeHead(200, { "content-type": "application/json" }).end(body);
        return;
      }
      if (mode === "bare-echo") {
        res.writeHead(200).end(String(json.challenge));
        return;
      }
      if (mode === "huge") {
        writeHugeReply(res);
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        json.type === "verification"
          ? JSON.stringify({
              challenge: mode === "wrong-echo" ? "not-it" : json.challenge,
            })
          : "{}"
      );
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return {
    behaviour,
    close: async () => {
      server.close();
      await once(server, "close");
    },
    deliveries,
    origin: `http://localhost:${port}`,
  };
};

const newSecret = () => `whsec_${randomBytes(32).toString("base64")}`;

/** Every `v1,` signature in the header that verifies with `secret`. */
const validSignatures = (delivery: Delivery, secret: string) => {
  const id = String(delivery.headers["webhook-id"]);
  const timestamp = String(delivery.headers["webhook-timestamp"]);
  const expected = createHmac(
    "sha256",
    Buffer.from(secret.slice("whsec_".length), "base64")
  )
    .update(`${id}.${timestamp}.${delivery.body}`)
    .digest("base64");
  return String(delivery.headers["webhook-signature"] ?? "")
    .split(" ")
    .filter((signature) => signature === `v1,${expected}`);
};

const deliveriesTo = (path: string) =>
  receiver.deliveries.filter(
    (delivery) => delivery.path === path && delivery.json.type === undefined
  );

const waitForDelivery = async (path: string, eventId: string) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const found = deliveriesTo(path).find(
      (delivery) => delivery.json.eventId === eventId
    );
    if (found) {
      return found;
    }
    await sleep(500);
  }
  throw new Error(`no delivery of ${eventId} to ${path}`);
};

/** Queue batches settle within a few seconds locally. */
const settle = () => sleep(6000);

/** State no public call can arrange (an old handshake, a narrowed key); local D1 only. */
const d1 = (sql: string) =>
  execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", "DB", "--local", "--command", sql],
    { stdio: "pipe" }
  );

// ---------------------------------------------------------------------------
// Modern MCP requests.

interface RpcBody {
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: Record<string, unknown> };
}

const modern = async (
  key: string,
  method: string,
  params: Record<string, unknown> = {},
  headers: Record<string, string> = {}
) => {
  const body = {
    id: 1,
    jsonrpc: "2.0",
    method,
    params: {
      ...params,
      _meta: {
        "io.modelcontextprotocol/clientCapabilities": {},
        "io.modelcontextprotocol/clientInfo": { name: "e2e", version: "1" },
        "io.modelcontextprotocol/protocolVersion": MODERN,
      },
    },
  };
  const url = `${target.api}/mcp`;
  const response = await recordResponse(
    "POST",
    url,
    body,
    await context.post(url, {
      data: body,
      headers: {
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "mcp-method": method,
        "mcp-protocol-version": MODERN,
        ...(method === "tools/call" ? { "mcp-name": String(params.name) } : {}),
        ...headers,
      },
    })
  );
  return {
    body: (await response.json()) as RpcBody,
    status: response.status(),
  };
};

const subscribe = (
  key: string,
  path: string,
  secret: string,
  args: Record<string, unknown> = {},
  extra: Record<string, unknown> = {}
) =>
  modern(key, "events/subscribe", {
    arguments: args,
    cursor: null,
    delivery: { mode: "webhook", secret, url: `${receiver.origin}${path}` },
    name: "event.created",
    ...extra,
  });

/** A session-era request: no mirrored headers, no `_meta`, errors in a 200. */
const sessionEra = async (
  key: string,
  method: string,
  params: Record<string, unknown> = {}
) => {
  const url = `${target.api}/mcp`;
  const body = { id: 1, jsonrpc: "2.0", method, params };
  const response = await recordResponse(
    "POST",
    url,
    body,
    await context.post(url, {
      data: body,
      headers: { authorization: `Bearer ${key}` },
    })
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as RpcBody;
};

const createEvent = async (key: string, body: Record<string, unknown>) => {
  const url = `${target.api}/v1/events`;
  const response = await recordResponse(
    "POST",
    url,
    body,
    await context.post(url, {
      data: body,
      headers: { authorization: `Bearer ${key}` },
    })
  );
  expect(response.status()).toBe(201);
  const created: { data: { id: string } } = await response.json();
  return created.data.id;
};

/** `events/subscribe` for `event.created` with an overridable body. */
const attempt = (
  url: string,
  overrides: Record<string, unknown> = {},
  key = agentKey
) =>
  modern(key, "events/subscribe", {
    arguments: {},
    delivery: { mode: "webhook", secret: newSecret(), url },
    name: "event.created",
    ...overrides,
  });

test.beforeAll(async () => {
  context = await playwrightRequest.newContext();
  receiver = await startReceiver();
  const site = await context.get(`${target.site}/`, {
    headers: { accept: "text/html" },
  });
  const html = await site.text();
  isDevServer = html.includes("<!--ssr-outlet-->");
  session = await ApiSession.signUp(context, "mcp-events");
  const workspace = await session.bootstrap("E2E Events Co", "E2E Events");
  ({ organizationId } = workspace);
  projectId = workspace.project.id;
  agentKey = workspace.apiKey.secret;
  const app = await session.rpc<{ secret: string }>("apiKeys/create", {
    name: "App backend",
    projectId,
  });
  appKey = app.secret;
});

test.afterEach(async ({}, testInfo) => {
  await attachHttpLog(testInfo);
  if (receiver.deliveries.length > 0) {
    await testInfo.attach("webhook-deliveries", {
      body: JSON.stringify(receiver.deliveries, null, 2),
      contentType: "application/json",
    });
  }
});

test.afterAll(async () => {
  await session.destroy(organizationId);
  await context.dispose();
  await receiver.close();
});

test("server/discover advertises tools and events on 2026-07-28", async () => {
  const { body, status } = await modern(agentKey, "server/discover");
  expect(status).toBe(200);
  expect(body.result).toMatchObject({
    _meta: { "io.modelcontextprotocol/serverInfo": { name: "emitkit" } },
    capabilities: { events: {}, tools: {} },
    resultType: "complete",
  });
  expect(body.result?.supportedVersions).toContain(MODERN);
  expect(body.result?.supportedVersions).toContain("2025-06-18");

  const tools = await modern(agentKey, "tools/list");
  expect(tools.body.result).toMatchObject({ resultType: "complete" });
});

test("modern requests are validated against their headers", async () => {
  const noMethod = await modern(
    agentKey,
    "tools/list",
    {},
    { "mcp-method": "" }
  );
  expect(noMethod.status).toBe(400);
  expect(noMethod.body.error?.code).toBe(-32_020);

  const wrongMethod = await modern(
    agentKey,
    "tools/list",
    {},
    { "mcp-method": "events/list" }
  );
  expect(wrongMethod.status).toBe(400);
  expect(wrongMethod.body.error?.code).toBe(-32_020);

  const wrongName = await modern(
    agentKey,
    "tools/call",
    { arguments: {}, name: "createEvent" },
    { "mcp-name": "deleteIdentity" }
  );
  expect(wrongName.status).toBe(400);
  expect(wrongName.body.error?.code).toBe(-32_020);

  const mismatched = await modern(
    agentKey,
    "tools/list",
    {},
    { "mcp-protocol-version": "2025-06-18" }
  );
  expect(mismatched.status).toBe(400);
  expect(mismatched.body.error?.code).toBe(-32_020);

  const future = await context.post(`${target.api}/mcp`, {
    data: {
      id: 9,
      jsonrpc: "2.0",
      method: "tools/list",
      params: {
        _meta: {
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/protocolVersion": "2099-01-01",
        },
      },
    },
    headers: {
      authorization: `Bearer ${agentKey}`,
      "mcp-method": "tools/list",
      "mcp-protocol-version": "2099-01-01",
    },
  });
  expect(future.status()).toBe(400);
  expect(await future.json()).toMatchObject({
    error: {
      code: -32_022,
      data: {
        requested: "2099-01-01",
        supported: expect.arrayContaining([MODERN]),
      },
    },
    id: 9,
  });

  const unknown = await modern(agentKey, "prompts/list");
  expect(unknown.status).toBe(404);
  expect(unknown.body.error?.code).toBe(-32_601);
});

test("events/list describes event.created for webhook delivery", async () => {
  const { body } = await modern(agentKey, "events/list");
  const events = body.result?.events as {
    name: string;
    delivery: string[];
    inputSchema: { properties: Record<string, unknown> };
    payloadSchema: { properties: Record<string, unknown> };
  }[];
  expect(events.map((event) => event.name)).toEqual(["event.created"]);
  const [created] = events;
  expect(created?.delivery).toEqual(["webhook"]);
  expect(Object.keys(created?.inputSchema.properties ?? {}).toSorted()).toEqual(
    ["channel", "tags", "userId"]
  );
  expect(created?.payloadSchema.properties).toHaveProperty("title");
  expect(created?.payloadSchema.properties).toHaveProperty("channel");
});

test("events/list offers nothing to a key that can't read events", async () => {
  test.skip(!isDevServer, "narrows a key in the local D1");
  const name = `Write only ${Date.now()}`;
  const writeOnly = await session.rpc<{ secret: string }>("apiKeys/create", {
    name,
    projectId,
  });
  d1(
    `update apikey set metadata = json_set(metadata, '$.scopes', json('["events:write"]')) where name = '${name}'`
  );
  const { body } = await modern(writeOnly.secret, "events/list");
  expect(body.result?.events).toEqual([]);
});

test("unsafe or malformed subscriptions are refused", async () => {
  for (const url of [
    "http://example.com/hook",
    "https://10.0.0.8/hook",
    "https://127.0.0.1/hook",
    "https://[::1]/hook",
    "https://169.254.169.254/latest",
    "https://printer.local/hook",
    // Loopback in other spellings: decimal, hex, IPv4-mapped, 6to4, Teredo.
    "https://2130706433/hook",
    "https://0x7f.1/hook",
    "https://[::ffff:127.0.0.1]/hook",
    "https://[2002:7f00:1::]/hook",
    "https://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/hook",
    // Local names with a trailing dot are the same names.
    "https://localhost./hook",
    "https://printer.local./hook",
    "https://metadata.google.internal./hook",
    "https://user:pass@example.com/hook",
    "not a url",
  ]) {
    const refused = await attempt(url);
    expect(refused.body.error?.code, url).toBe(-32_602);
  }
  if (!isDevServer) {
    const loopback = await attempt(`${receiver.origin}/hook`);
    expect(loopback.body.error?.code, "http://localhost in a build").toBe(
      -32_602
    );
  }

  const badSecret = await attempt("https://example.com/hook", {
    delivery: {
      mode: "webhook",
      secret: `whsec_${randomBytes(8).toString("base64")}`,
      url: "https://example.com/hook",
    },
  });
  expect(badSecret.body.error?.code).toBe(-32_602);

  const unknownEvent = await attempt("https://example.com/hook", {
    name: "order.shipped",
  });
  expect(unknownEvent.body.error).toMatchObject({
    code: -32_011,
    data: { kind: "event" },
  });

  const poll = await attempt("https://example.com/hook", {
    delivery: { mode: "poll" },
  });
  expect(poll.body.error).toMatchObject({ code: -32_014 });

  const badArguments = await attempt("https://example.com/hook", {
    arguments: { channel: 5, surprise: true },
  });
  expect(badArguments.body.error?.code).toBe(-32_602);

  // A bad credential is refused before any method runs, with the OAuth
  // challenge, like every other MCP request.
  const wrongKey = await attempt(
    "https://example.com/hook",
    {},
    "emitkit_notARealKeyX"
  );
  expect(wrongKey.status).toBe(401);
  const listing = await modern("emitkit_notARealKeyX", "events/list");
  expect(listing.status).toBe(401);
});

test("session-era clients find MCP Events through initialize", async () => {
  const initialized = await sessionEra(agentKey, "initialize", {
    capabilities: {},
    clientInfo: { name: "e2e", version: "1" },
    protocolVersion: "2025-03-26",
  });
  expect(initialized.result?.capabilities).toMatchObject({
    events: {},
    tools: {},
  });
  const listing = await sessionEra(agentKey, "events/list");
  const events = listing.result?.events as { name: string }[];
  expect(events.map((event) => event.name)).toEqual(["event.created"]);
  expect(listing.result).not.toHaveProperty("resultType");
});

test.describe("delivery", () => {
  test.beforeEach(() => {
    test.skip(
      !isDevServer,
      "needs a callback the Worker can reach (`vite dev` only)"
    );
  });

  const secret = newSecret();
  let subscriptionId: string;

  test("subscribe verifies the callback once and is idempotent", async () => {
    const first = await subscribe(agentKey, "/payments", secret, {
      channel: "Payments",
    });
    expect(first.body.error).toBeUndefined();
    expect(first.body.result).toMatchObject({
      cursor: null,
      resultType: "complete",
      truncated: false,
    });
    // Exactly the spec's fields.
    expect(Object.keys(first.body.result ?? {}).toSorted()).toEqual([
      "cursor",
      "id",
      "refreshBefore",
      "resultType",
      "truncated",
    ]);
    subscriptionId = String(first.body.result?.id);
    expect(subscriptionId).toMatch(/^sub_[0-9a-f]{32}$/u);
    const refreshBefore = Date.parse(String(first.body.result?.refreshBefore));
    expect(refreshBefore).toBeGreaterThan(Date.now() + 60_000);

    const verifications = receiver.deliveries.filter(
      (delivery) => delivery.path === "/payments"
    );
    expect(verifications).toHaveLength(1);
    const [verification] = verifications;
    expect(verification?.json.type).toBe("verification");
    expect(String(verification?.headers["webhook-id"])).toMatch(
      /^msg_verification_/u
    );
    expect(verification?.headers["x-mcp-subscription-id"]).toBe(subscriptionId);
    expect(validSignatures(verification as Delivery, secret)).toHaveLength(1);

    const again = await subscribe(
      agentKey,
      "/payments",
      secret,
      { channel: "Payments" },
      { ttlMs: 120_000 }
    );
    expect(again.body.result?.id).toBe(subscriptionId);
    const granted = Date.parse(String(again.body.result?.refreshBefore));
    expect(granted).toBeLessThanOrEqual(Date.now() + 125_000);
    expect(
      receiver.deliveries.filter((delivery) => delivery.path === "/payments")
    ).toHaveLength(1);
  });

  test("a session-era client subscribes and gets deliveries", async () => {
    const eraSecret = newSecret();
    const delivery = {
      mode: "webhook",
      secret: eraSecret,
      url: `${receiver.origin}/session-era`,
    };
    const subscribed = await sessionEra(agentKey, "events/subscribe", {
      arguments: { channel: "session-era" },
      cursor: null,
      delivery,
      name: "event.created",
    });
    expect(subscribed.error).toBeUndefined();
    expect(subscribed.result?.id).toMatch(/^sub_[0-9a-f]{32}$/u);

    const eventId = await createEvent(appKey, {
      channelName: "session-era",
      title: "Heard over initialize",
    });
    const received = await waitForDelivery("/session-era", eventId);
    expect(validSignatures(received, eraSecret)).toHaveLength(1);

    const unknown = await sessionEra(agentKey, "events/subscribe", {
      arguments: {},
      delivery,
      name: "not.an.event",
    });
    expect(unknown.error?.code).toBe(-32_011);

    const removed = await sessionEra(agentKey, "events/unsubscribe", {
      arguments: { channel: "session-era" },
      delivery: { url: delivery.url },
      name: "event.created",
    });
    expect(removed.error).toBeUndefined();
    expect(removed.result).toEqual({});
  });

  test("redirects are never followed", async () => {
    receiver.behaviour.set("/moved", "redirect");
    const refused = await subscribe(agentKey, "/moved", newSecret());
    expect(refused.body.error).toMatchObject({
      code: -32_015,
      data: { reason: "challenge_failed" },
    });

    // A subscribed callback that starts redirecting doesn't get events
    // delivered elsewhere either.
    const hopSecret = newSecret();
    const hops = await subscribe(agentKey, "/hops", hopSecret, {
      channel: "hops",
    });
    expect(hops.body.error).toBeUndefined();
    receiver.behaviour.set("/hops", "redirect");
    const eventId = await createEvent(appKey, {
      channelName: "hops",
      title: "Redirected?",
    });
    await expect
      .poll(
        () =>
          receiver.deliveries.filter(
            (delivery) =>
              delivery.path === "/hops" && delivery.json.eventId === eventId
          ).length,
        { timeout: 20_000 }
      )
      .toBeGreaterThan(0);
    await sleep(2000);
    expect(
      receiver.deliveries.filter((delivery) => delivery.path === "/redirected")
    ).toHaveLength(0);
    await modern(agentKey, "events/unsubscribe", {
      arguments: { channel: "hops" },
      delivery: { url: `${receiver.origin}/hops` },
      name: "event.created",
    });
  });

  test("a callback that doesn't echo the challenge is refused", async () => {
    receiver.behaviour.set("/wrong-echo", "wrong-echo");
    const wrong = await subscribe(agentKey, "/wrong-echo", newSecret());
    expect(wrong.body.error).toMatchObject({
      code: -32_015,
      data: { reason: "challenge_failed" },
    });
    receiver.behaviour.set("/failing", "fail");
    const failing = await subscribe(agentKey, "/failing", newSecret());
    expect(failing.body.error).toMatchObject({
      code: -32_015,
      data: { reason: "http_5xx" },
    });
    // Reflecting the request proves nothing, and only the documented reply counts.
    for (const mode of ["reflect", "bare-echo"] as const) {
      receiver.behaviour.set(`/${mode}`, mode);
      const refused = await subscribe(agentKey, `/${mode}`, newSecret());
      expect(refused.body.error, mode).toMatchObject({
        code: -32_015,
        data: { reason: "challenge_failed" },
      });
    }
  });

  test("a receiver's huge reply is not read whole", async () => {
    hugeBytesWritten = 0;
    receiver.behaviour.set("/huge", "huge");
    const refused = await subscribe(agentKey, "/huge", newSecret());
    expect(refused.body.error).toMatchObject({
      code: -32_015,
      data: { reason: "challenge_failed" },
    });
    expect(hugeBytesWritten).toBeLessThan(HUGE_REPLY_WRITE_LIMIT);
  });

  test("a verification is only trusted for a bounded time", async () => {
    const path = "/stale";
    const url = `${receiver.origin}${path}`;
    const staleSecret = newSecret();
    const verifications = () =>
      receiver.deliveries.filter(
        (delivery) =>
          delivery.path === path && delivery.json.type === "verification"
      ).length;
    const age = () =>
      d1(
        `update mcp_subscription set verified_at = '2020-01-01T00:00:00.000Z' where url = '${url}'`
      );

    await subscribe(agentKey, path, staleSecret, { channel: "stale" });
    await subscribe(agentKey, path, staleSecret, { channel: "stale-two" });
    expect(verifications(), "a recent handshake is reused").toBe(1);

    age();
    await subscribe(agentKey, path, staleSecret, { channel: "stale-three" });
    expect(verifications(), "a new filter after it went stale").toBe(2);

    age();
    await subscribe(agentKey, path, staleSecret, { channel: "stale" });
    expect(verifications(), "a refresh after it went stale").toBe(3);

    age();
    receiver.behaviour.set(path, "wrong-echo");
    const refused = await subscribe(agentKey, path, staleSecret, {
      channel: "stale",
    });
    expect(refused.body.error).toMatchObject({
      code: -32_015,
      data: { reason: "challenge_failed" },
    });
  });

  test("a matching event arrives signed; others don't", async () => {
    const eventId = await createEvent(appKey, {
      channelName: "payments",
      description: "Pro plan",
      icon: "💰",
      metadata: { amount: 49, currency: "EUR" },
      notify: false,
      tags: ["billing"],
      title: "Payment received",
      userId: "cus_events_1",
    });
    const otherId = await createEvent(appKey, {
      channelName: "signups",
      title: "New signup",
    });
    const delivery = await waitForDelivery("/payments", eventId);
    expect(delivery.headers["content-type"]).toContain("application/json");
    expect(delivery.headers["webhook-id"]).toBe(eventId);
    expect(delivery.headers["x-mcp-subscription-id"]).toBe(subscriptionId);
    expect(validSignatures(delivery, secret)).toHaveLength(1);
    const age =
      Date.now() / 1000 - Number(delivery.headers["webhook-timestamp"]);
    expect(Math.abs(age)).toBeLessThan(300);
    expect(delivery.json).toMatchObject({
      cursor: null,
      data: {
        channel: "payments",
        description: "Pro plan",
        icon: "💰",
        id: eventId,
        metadata: { amount: 49, currency: "EUR" },
        tags: ["billing"],
        title: "Payment received",
        userId: "cus_events_1",
      },
      eventId,
      name: "event.created",
    });
    expect(String(delivery.json.timestamp)).toMatch(/Z$/u);
    expect(String((delivery.json.data as { url: string }).url)).toContain(
      target.app
    );

    await settle();
    expect(
      deliveriesTo("/payments").filter((d) => d.json.eventId === otherId)
    ).toHaveLength(0);
  });

  test("events the agent creates itself are not sent back to it", async () => {
    const tool = await modern(agentKey, "tools/call", {
      arguments: { channelName: "payments", title: "Refund issued" },
      name: "createEvent",
    });
    const created = tool.body.result?.structuredContent as {
      data: { id: string };
    };
    expect(created.data.id).toMatch(/^event_/u);
    await settle();
    expect(
      deliveriesTo("/payments").filter(
        (d) => d.json.eventId === created.data.id
      )
    ).toHaveLength(0);
  });

  test("a rotated secret signs with both keys", async () => {
    const rotated = newSecret();
    const refreshed = await subscribe(agentKey, "/payments", rotated, {
      channel: "Payments",
    });
    expect(refreshed.body.result?.id).toBe(subscriptionId);
    const eventId = await createEvent(appKey, {
      channelName: "payments",
      title: "Payment received again",
    });
    const delivery = await waitForDelivery("/payments", eventId);
    expect(validSignatures(delivery, rotated)).toHaveLength(1);
    expect(validSignatures(delivery, secret)).toHaveLength(1);
  });

  test("a failed delivery is retried with the same id, freshly signed", async () => {
    const retrySecret = newSecret();
    await subscribe(agentKey, "/flaky", retrySecret, { channel: "flaky" });
    receiver.behaviour.set("/flaky", "fail-once");
    const eventId = await createEvent(appKey, {
      channelName: "flaky",
      title: "Worth retrying",
    });
    let attempts: Delivery[] = [];
    for (let wait = 0; wait < 120 && attempts.length < 2; wait += 1) {
      await sleep(500);
      attempts = deliveriesTo("/flaky").filter(
        (d) => d.json.eventId === eventId
      );
    }
    expect(attempts, "first attempt (500) and its retry").toHaveLength(2);
    const [first, retry] = attempts as [Delivery, Delivery];
    expect(retry.headers["webhook-id"]).toBe(first.headers["webhook-id"]);
    expect(retry.body).toBe(first.body);
    expect(Number(retry.headers["webhook-timestamp"])).toBeGreaterThan(
      Number(first.headers["webhook-timestamp"])
    );
    expect(retry.headers["webhook-signature"]).not.toBe(
      first.headers["webhook-signature"]
    );
    expect(validSignatures(retry, retrySecret)).toHaveLength(1);
    test.info().annotations.push({
      description: `${Number(retry.headers["webhook-timestamp"]) - Number(first.headers["webhook-timestamp"])} s`,
      type: "retry delay",
    });
  });

  test("unsubscribe stops delivery and is idempotent", async () => {
    const params = {
      arguments: { channel: "Payments" },
      delivery: { mode: "webhook", url: `${receiver.origin}/payments` },
      name: "event.created",
    };
    const first = await modern(agentKey, "events/unsubscribe", params);
    expect(first.body.result).toEqual({ resultType: "complete" });
    const second = await modern(agentKey, "events/unsubscribe", params);
    expect(second.body.result).toEqual({ resultType: "complete" });

    const eventId = await createEvent(appKey, {
      channelName: "payments",
      title: "After unsubscribe",
    });
    await settle();
    expect(
      deliveriesTo("/payments").filter((d) => d.json.eventId === eventId)
    ).toHaveLength(0);
  });

  test("a revoked key stops delivery", async () => {
    const temporary = await session.rpc<{
      apiKey: { id: string };
      secret: string;
    }>("apiKeys/create", {
      name: "Temporary agent",
      projectId,
    });
    const subscribed = await subscribe(
      temporary.secret,
      "/revoked",
      newSecret()
    );
    expect(subscribed.body.error).toBeUndefined();
    await session.rpc("apiKeys/revoke", { id: temporary.apiKey.id });

    const eventId = await createEvent(appKey, {
      channelName: "deploys",
      title: "Deploy finished",
    });
    await settle();
    expect(
      deliveriesTo("/revoked").filter((d) => d.json.eventId === eventId)
    ).toHaveLength(0);
  });

  test("410 Gone removes the subscription", async () => {
    const goneSecret = newSecret();
    await subscribe(agentKey, "/gone", goneSecret, { channel: "gone" });
    receiver.behaviour.set("/gone", "gone");
    const eventId = await createEvent(appKey, {
      channelName: "gone",
      title: "Anyone there?",
    });
    await waitForDelivery("/gone", eventId);
    await settle();
    const deliveredTwice = deliveriesTo("/gone").filter(
      (d) => d.json.eventId === eventId
    );
    expect(deliveredTwice, "410 is not retried").toHaveLength(1);

    // With the subscription gone, subscribing again needs a new verification.
    receiver.behaviour.set("/gone", "echo");
    const before = receiver.deliveries.filter(
      (d) => d.path === "/gone" && d.json.type === "verification"
    ).length;
    await subscribe(agentKey, "/gone", goneSecret, { channel: "gone" });
    expect(
      receiver.deliveries.filter(
        (d) => d.path === "/gone" && d.json.type === "verification"
      )
    ).toHaveLength(before + 1);
  });

  test("one key can hold 25 subscriptions", async () => {
    const quota = await session.rpc<{ secret: string }>("apiKeys/create", {
      name: "Quota agent",
      projectId,
    });
    for (let index = 0; index < 25; index += 1) {
      const ok = await subscribe(quota.secret, "/quota", newSecret(), {
        channel: `channel-${index}`,
      });
      expect(ok.body.error, `subscription ${index}`).toBeUndefined();
    }
    const over = await subscribe(quota.secret, "/quota", newSecret(), {
      channel: "one-too-many",
    });
    expect(over.body.error).toMatchObject({
      code: -32_013,
      data: { limit: "subscriptions" },
    });
  });
});
