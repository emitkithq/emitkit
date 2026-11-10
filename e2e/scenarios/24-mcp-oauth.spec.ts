import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import { glob, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import { ApiSession } from "@e2e/support/api-session";
import { attachHttpLog, recordResponse } from "@e2e/support/http-log";
import { target, TEST_PASSWORD, testEmail } from "@e2e/support/targets";
import { expect, request as playwrightRequest, test } from "@playwright/test";
import type { APIRequestContext, Browser, Page } from "@playwright/test";

/**
 * OAuth 2.1 for the MCP server, the way ChatGPT and Claude connect: discovery,
 * dynamic client registration, authorization code with PKCE, a consent screen
 * on its own page, audience-bound tokens and revocation. Ways it can break,
 * each checked below:
 *
 * - Discovery is incomplete: no protected-resource metadata on the API host,
 *   the authorization server's metadata isn't where the issuer says, or it
 *   lacks S256, a registration endpoint or public clients (ChatGPT refuses
 *   such servers).
 * - An unauthenticated MCP request gets a 401 without the `resource_metadata`
 *   challenge, so a client can't start the flow.
 * - The login handoff drops the flow: signing in with a password or an
 *   emailed code, or signing up from the sign-in page, lands in the
 *   dashboard instead of back in the flow.
 * - The consent screen renders inside the app shell, offers projects the user
 *   may not connect (members have read-only access to keys), or hides where the
 *   user will be sent back to.
 * - The token isn't bound to the chosen project: events land elsewhere, or a
 *   token for another resource is accepted.
 * - Refresh loses the project.
 * - Revoking in Settings leaves a live token working until it expires.
 * - A user demoted to member keeps access.
 * - A deleted project makes the client loop: re-authorizing must ask for a
 *   project again.
 * - Clients on the session-era protocol (`initialize`) or that leave out
 *   `resource` or `scope` get tokens `/mcp` refuses, and loop.
 * - The consent screen can be framed by another site (clickjacking).
 * - Idempotent `createEvent` retries over OAuth create two events.
 * - A grant gets fewer tools than a full API key (it acts like one), or its
 *   MCP Events subscription hears the events it created itself (a loop).
 * - The API-key path changes (checked by 02 and 23, which must still pass).
 *
 * The flow runs against the local dev server and any build; the member check
 * demotes the owner through the local D1 database, so it only runs locally.
 */
test.describe.configure({ mode: "serial" });

const MODERN = "2026-07-28";
const isLocal = target.name === "local";
/** `vite dev` serves the site's unrendered shell; only it accepts localhost callbacks. */
let isDevServer = false;

/** The dashboard user's context (session cookie). */
let context: APIRequestContext;
/** The MCP client's context: no cookies, like ChatGPT's servers. */
let client: APIRequestContext;
let session: ApiSession;
let organizationId: string;
let organizationSlug: string;
let projectId: string;
let secondProjectId: string;
let callback: {
  server: Server;
  url: string;
  hits: URL[];
  /** MCP Events POSTed to `/events` (the same local server). */
  events: Record<string, unknown>[];
};
let appKey: string;
let discovery: {
  resource: string;
  resourceMetadataUrl: string;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
};
let clientId: string;
let tokens: { access: string; refresh: string };

const base64Url = (bytes: Buffer) => bytes.toString("base64url");

const pkce = () => {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  return { challenge, verifier };
};

const getJson = async (url: string) => {
  const response = await recordResponse(
    "GET",
    url,
    null,
    await client.get(url)
  );
  expect(response.status(), url).toBe(200);
  return (await response.json()) as Record<string, unknown>;
};

const mcp = async (accessToken: string, method: string, params = {}) => {
  const body = {
    id: 1,
    jsonrpc: "2.0",
    method,
    params: {
      ...params,
      _meta: {
        "io.modelcontextprotocol/clientCapabilities": {},
        "io.modelcontextprotocol/protocolVersion": MODERN,
      },
    },
  };
  const url = `${target.api}/mcp`;
  const response = await recordResponse(
    "POST",
    url,
    body,
    await client.post(url, {
      data: body,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "mcp-method": method,
        "mcp-protocol-version": MODERN,
        ...(method === "tools/call"
          ? { "mcp-name": String((params as { name: string }).name) }
          : {}),
      },
    })
  );
  const text = await response.text();
  return {
    body: (text ? JSON.parse(text) : {}) as {
      result?: Record<string, unknown>;
      error?: { code: number };
    },
    challenge: response.headers()["www-authenticate"] ?? "",
    status: response.status(),
  };
};

const statusOf = async (accessToken: string) => {
  const response = await mcp(accessToken, "tools/list");
  return response.status;
};

const tokenRequest = async (form: Record<string, string>) => {
  const response = await recordResponse(
    "POST",
    discovery.tokenEndpoint,
    { ...form, code_verifier: "[omitted]" },
    await client.post(discovery.tokenEndpoint, { form })
  );
  return {
    body: (await response.json()) as Record<string, string>,
    status: response.status(),
  };
};

/**
 * Starts an authorization in `page` and returns what the flow needs to
 * finish: the PKCE verifier and the `state` to expect on the callback.
 */
const authorize = async (page: Page, extra: Record<string, string> = {}) => {
  const { challenge, verifier } = pkce();
  const state = base64Url(randomBytes(12));
  const url = new URL(discovery.authorizationEndpoint);
  for (const [key, value] of Object.entries({
    client_id: clientId,
    code_challenge: challenge,
    code_challenge_method: "S256",
    redirect_uri: callback.url,
    resource: discovery.resource,
    response_type: "code",
    scope: "openid profile email offline_access mcp",
    state,
    ...extra,
  })) {
    url.searchParams.set(key, value);
  }
  await page.goto(url.toString());
  return { state, verifier };
};

/** Signs in on the sign-in page an OAuth flow sent the browser to. */
const signInOnPage = async (page: Page, email: string) => {
  await expect(page).toHaveURL(/\/auth\/sign-in\?/u);
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  // Better Auth allows three sign-ins per 10 seconds from one address.
  const limited = page.getByText("Too many requests");
  if (await limited.isVisible({ timeout: 1500 }).catch(() => false)) {
    await page.waitForTimeout(11_000);
    await page.getByRole("button", { name: "Sign In" }).click();
  }
};

/** A browser already signed in as the test user (the handoff is tested once). */
const signedInContext = async (browser: Browser) =>
  await browser.newContext({ storageState: await context.storageState() });

/** Waits for the redirect back to the client and returns its code. */
const codeFrom = async (page: Page, state: string) => {
  await page.waitForURL((url) => url.href.startsWith(callback.url));
  const url = new URL(page.url());
  expect(url.searchParams.get("state")).toBe(state);
  expect(url.searchParams.get("error")).toBeNull();
  return url.searchParams.get("code") ?? "";
};

const exchange = async (code: string, verifier: string) => {
  const exchanged = await tokenRequest({
    client_id: clientId,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: callback.url,
    resource: discovery.resource,
  });
  expect(exchanged.status, JSON.stringify(exchanged.body)).toBe(200);
  expect(exchanged.body.token_type?.toLowerCase()).toBe("bearer");
  return {
    access: exchanged.body.access_token ?? "",
    refresh: exchanged.body.refresh_token ?? "",
  };
};

const d1 = (sql: string) =>
  execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", "DB", "--local", "--command", sql],
    { stdio: "pipe" }
  );

test.beforeAll(async () => {
  context = await playwrightRequest.newContext();
  client = await playwrightRequest.newContext();
  const site = await context.get(`${target.site}/`, {
    headers: { accept: "text/html" },
  });
  const html = await site.text();
  isDevServer = html.includes("<!--ssr-outlet-->");
  session = await ApiSession.signUp(context, "oauth");
  const workspace = await session.bootstrap("E2E OAuth Co", "OAuth Main");
  ({ organizationId, organizationSlug } = workspace);
  projectId = workspace.project.id;
  const second = await session.rpc<{ id: string }>("projects/create", {
    name: "OAuth Side",
  });
  secondProjectId = second.id;

  appKey = workspace.apiKey.secret;
  const hits: URL[] = [];
  const events: Record<string, unknown>[] = [];
  const server = createServer((req, res) => {
    if (req.method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString() || "{}") as {
          type?: string;
          challenge?: string;
        };
        if (body.type !== "verification") {
          events.push(body);
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ challenge: body.challenge }));
      });
      return;
    }
    hits.push(new URL(req.url ?? "/", "http://localhost"));
    res.writeHead(200, { "content-type": "text/html" });
    res.end(
      "<!doctype html><title>Client callback</title><p>Back in the client"
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  callback = {
    events,
    hits,
    server,
    url: `http://localhost:${port}/callback`,
  };
});

test.afterEach(async ({}, testInfo) => {
  await attachHttpLog(testInfo);
});

test.afterAll(async () => {
  await session.destroy(organizationId);
  await context.dispose();
  await client.dispose();
  callback.server.close();
});

test("discovery: protected resource and authorization server metadata", async () => {
  const unauthenticated = await client.post(`${target.api}/mcp`, {
    data: { id: 1, jsonrpc: "2.0", method: "tools/list" },
  });
  expect(unauthenticated.status()).toBe(401);
  const challenge = unauthenticated.headers()["www-authenticate"] ?? "";
  const metadataUrl = /resource_metadata="(?<url>[^"]+)"/u.exec(challenge)
    ?.groups?.url;
  expect(metadataUrl, challenge).toBe(
    `${target.api}/.well-known/oauth-protected-resource/mcp`
  );

  const resource = await getJson(metadataUrl ?? "");
  expect(resource.resource).toBe(`${target.api}/mcp`);
  expect(resource.scopes_supported).toEqual(["mcp"]);
  expect(resource.bearer_methods_supported).toEqual(["header"]);
  const [issuer] = resource.authorization_servers as string[];
  expect(issuer?.startsWith(target.app)).toBe(true);
  // The root document serves the same resource.
  const root = await getJson(
    `${target.api}/.well-known/oauth-protected-resource`
  );
  expect(root.resource).toBe(`${target.api}/mcp`);

  // RFC 8414: the well-known segment goes between the host and the path.
  const issuerUrl = new URL(issuer ?? "");
  const metadata = await getJson(
    `${issuerUrl.origin}/.well-known/oauth-authorization-server${issuerUrl.pathname.replace(/\/$/u, "")}`
  );
  expect(metadata.issuer).toBe(issuer);
  expect(metadata.code_challenge_methods_supported).toContain("S256");
  expect(metadata.token_endpoint_auth_methods_supported).toContain("none");
  expect(metadata.scopes_supported).toContain("mcp");
  expect(metadata.registration_endpoint).toBeTruthy();
  discovery = {
    authorizationEndpoint: String(metadata.authorization_endpoint),
    issuer: issuer ?? "",
    registrationEndpoint: String(metadata.registration_endpoint),
    resource: String(resource.resource),
    resourceMetadataUrl: metadataUrl ?? "",
    tokenEndpoint: String(metadata.token_endpoint),
  };
});

test("a public client registers itself", async () => {
  const body = {
    client_name: "E2E Agent",
    grant_types: ["authorization_code", "refresh_token"],
    // Two hosts: Connected apps has to name both, not only the first.
    redirect_uris: [
      callback.url,
      callback.url.replace("localhost", "127.0.0.1"),
    ],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
  const register = async () =>
    await recordResponse(
      "POST",
      discovery.registrationEndpoint,
      body,
      await client.post(discovery.registrationEndpoint, { data: body })
    );
  let response = await register();
  // Registration allows five clients a minute from one address.
  if (response.status() === 429) {
    const wait = Number(response.headers()["x-retry-after"] ?? "60");
    await sleep((wait + 1) * 1000);
    response = await register();
  }
  expect(response.status()).toBe(201);
  const registered: { client_id: string; client_secret?: string } =
    await response.json();
  expect(registered.client_id).toBeTruthy();
  expect(registered.client_secret).toBeUndefined();
  clientId = registered.client_id;
});

test("sign in, pick a project on the consent screen, get audience-bound tokens", async ({
  browser,
}, testInfo) => {
  const browserContext = await browser.newContext();
  const page = await browserContext.newPage();
  try {
    const { state, verifier } = await authorize(page);
    await signInOnPage(page, session.email);

    await expect(page).toHaveURL(/\/oauth\/consent\?/u);
    await expect(
      page.getByRole("heading", { level: 1, name: "Connect E2E Agent" })
    ).toBeVisible();
    // Its own page: no dashboard navigation around it.
    await expect(page.getByRole("navigation", { name: /main/iu })).toHaveCount(
      0
    );
    await expect(page.getByText("Unverified app")).toBeVisible();
    await expect(page.getByText(/back to localhost/iu)).toBeVisible();
    await expect(page.getByText(session.email)).toBeVisible();
    await expect(
      page.getByRole("radio", { name: /OAuth Main/u })
    ).toBeVisible();
    for (const [width, height, name] of [
      [1440, 900, "1440"],
      [390, 844, "390"],
    ] as const) {
      await page.setViewportSize({ height, width });
      for (const scheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await testInfo.attach(`consent-${scheme}-${name}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
      }
    }
    await page.emulateMedia({ colorScheme: "light" });

    await page.getByRole("radio", { name: /OAuth Main/u }).check();
    await page.getByRole("button", { name: "Authorize" }).click();
    const code = await codeFrom(page, state);
    tokens = await exchange(code, verifier);

    const [, payload] = tokens.access.split(".");
    const claims = JSON.parse(
      Buffer.from(payload ?? "", "base64url").toString()
    ) as Record<string, unknown>;
    // `openid` adds the userinfo endpoint as a second audience.
    expect([claims.aud].flat()).toContain(discovery.resource);
    expect(claims.iss).toBe(discovery.issuer);
    expect(claims.project_id).toBe(projectId);
    expect(String(claims.scope)).toContain("mcp");
  } finally {
    await browserContext.close();
  }
});

test("the token drives /mcp for the chosen project only", async () => {
  const discover = await mcp(tokens.access, "server/discover");
  expect(discover.status).toBe(200);
  expect(discover.body.result?.capabilities).toMatchObject({ events: {} });

  const tools = await mcp(tokens.access, "tools/list");
  const list = tools.body.result?.tools as {
    name: string;
    securitySchemes?: unknown;
  }[];
  // A grant can do what a full API key does.
  expect(list.map((tool) => tool.name).toSorted()).toEqual([
    "cancelEvent",
    "createEvent",
    "deleteIdentity",
    "getEvent",
    "identifyUser",
    "listChannels",
    "listEvents",
  ]);
  expect(list[0]?.securitySchemes).toEqual([
    { scopes: ["mcp"], type: "oauth2" },
  ]);

  const created = await mcp(tokens.access, "tools/call", {
    arguments: { channelName: "agents", title: "Hello over OAuth" },
    name: "createEvent",
  });
  const result = created.body.result as {
    isError: boolean;
    structuredContent: { data: { id: string } };
  };
  expect(result.isError).toBe(false);
  const page = await session.rpc<{
    events: { id: string; projectId: string; source: string }[];
  }>("events/list", { projectId });
  const event = page.events.find(
    (candidate) => candidate.id === result.structuredContent.data.id
  );
  expect(event?.source).toBe("mcp");
  const other = await session.rpc<{ events: { id: string }[] }>("events/list", {
    projectId: secondProjectId,
  });
  expect(other.events).toHaveLength(0);

  const wrongAudience = await mcp(`${tokens.access}x`, "tools/list");
  expect(wrongAudience.status).toBe(401);
  expect(wrongAudience.challenge).toContain('error="invalid_token"');
});

test("refresh keeps the project", async () => {
  const refreshed = await tokenRequest({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: tokens.refresh,
    resource: discovery.resource,
  });
  expect(refreshed.status, JSON.stringify(refreshed.body)).toBe(200);
  tokens = {
    access: refreshed.body.access_token ?? "",
    refresh: refreshed.body.refresh_token ?? tokens.refresh,
  };
  const created = await mcp(tokens.access, "tools/call", {
    arguments: { channelName: "agents", title: "After refresh" },
    name: "createEvent",
  });
  expect(
    (created.body.result as { isError: boolean } | undefined)?.isError
  ).toBe(false);
});

/** A session-era (`initialize`) MCP request, with the current access token. */
const legacy = async (method: string, params?: unknown) => {
  const body = { id: 1, jsonrpc: "2.0", method, params };
  const response = await client.post(`${target.api}/mcp`, {
    data: body,
    headers: { authorization: `Bearer ${tokens.access}` },
  });
  await recordResponse("POST", `${target.api}/mcp`, body, response);
  return (await response.json()) as {
    result: Record<string, unknown> & {
      structuredContent?: { data: { id: string } };
    };
  };
};
test("session-era clients use the token too, and retries replay", async () => {
  const init = await legacy("initialize", {
    capabilities: {},
    clientInfo: { name: "e2e-legacy", version: "1" },
    protocolVersion: "2025-06-18",
  });
  expect(init.result).toMatchObject({ protocolVersion: "2025-06-18" });
  const call = {
    arguments: {
      channelName: "agents",
      idempotencyKey: "oauth-retry-1",
      title: "Once only",
    },
    name: "createEvent",
  };
  const first = await legacy("tools/call", call);
  const replay = await legacy("tools/call", call);
  const firstId = first.result.structuredContent?.data.id;
  expect(firstId).toMatch(/^event_/u);
  expect(replay.result.structuredContent?.data.id).toBe(firstId);
});

test("a client that leaves out resource and scope still gets a usable token", async ({
  browser,
}) => {
  const browserContext = await signedInContext(browser);
  const page = await browserContext.newPage();
  try {
    const { challenge, verifier } = pkce();
    const url = new URL(discovery.authorizationEndpoint);
    for (const [key, value] of Object.entries({
      client_id: clientId,
      code_challenge: challenge,
      code_challenge_method: "S256",
      redirect_uri: callback.url,
      response_type: "code",
      state: "bare",
    })) {
      url.searchParams.set(key, value);
    }
    const consent = await page.goto(url.toString());
    await expect(page).toHaveURL(/\/oauth\/consent\?/u);
    // Never inside another site's frame.
    const headers = consent?.headers() ?? {};
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'"
    );
    await page.getByRole("radio", { name: /OAuth Main/u }).check();
    await page.getByRole("button", { name: "Authorize" }).click();
    const code = await codeFrom(page, "bare");
    const exchanged = await tokenRequest({
      client_id: clientId,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: callback.url,
    });
    expect(exchanged.status).toBe(200);
    const bare = exchanged.body.access_token ?? "";
    expect(bare.split(".")).toHaveLength(3);
    expect(await statusOf(bare)).toBe(200);
  } finally {
    await browserContext.close();
  }
});

test("the grant subscribes to MCP Events and hears the app's events", async () => {
  test.skip(!isDevServer, "needs a callback the Worker can reach (`vite dev`)");
  const url = callback.url.replace("/callback", "/events");
  const subscribed = await mcp(tokens.access, "events/subscribe", {
    arguments: { channel: "orders" },
    delivery: {
      mode: "webhook",
      secret: `whsec_${randomBytes(32).toString("base64")}`,
      url,
    },
    name: "event.created",
  });
  expect(subscribed.body.error).toBeUndefined();
  expect(String(subscribed.body.result?.id)).toMatch(/^sub_/u);

  const created = await context.post(`${target.api}/v1/events`, {
    data: { channelName: "orders", title: "Order placed" },
    headers: { authorization: `Bearer ${appKey}` },
  });
  const { data } = (await created.json()) as { data: { id: string } };
  await expect
    .poll(() => callback.events.map((event) => event.eventId), {
      timeout: 20_000,
    })
    .toContain(data.id);

  // The agent reacts by creating an event over its own connection: that one
  // must not come back to it, or it would react again.
  const own = await mcp(tokens.access, "tools/call", {
    arguments: { channelName: "orders", title: "Agent reacted" },
    name: "createEvent",
  });
  const ownId = (
    own.body.result as { structuredContent: { data: { id: string } } }
  ).structuredContent.data.id;
  const next = await context.post(`${target.api}/v1/events`, {
    data: { channelName: "orders", title: "Second order" },
    headers: { authorization: `Bearer ${appKey}` },
  });
  const nextId = ((await next.json()) as { data: { id: string } }).data.id;
  // Once a later app event arrived, the agent's own had the same time to
  // arrive, and a few seconds more.
  await expect
    .poll(() => callback.events.map((event) => event.eventId), {
      timeout: 20_000,
    })
    .toContain(nextId);
  await sleep(3000);
  expect(callback.events.map((event) => event.eventId)).not.toContain(ownId);
});

test("a member can't connect, and a demoted owner loses access", async ({
  browser,
}) => {
  test.skip(!isLocal, "demotes the owner through the local D1 database");
  d1(
    `update member set role = 'member' where "organizationId" = '${organizationId}'`
  );
  try {
    const denied = await mcp(tokens.access, "tools/list");
    expect(denied.status).toBe(401);

    const browserContext = await browser.newContext();
    const page = await browserContext.newPage();
    try {
      await authorize(page);
      await signInOnPage(page, session.email);
      await expect(page).toHaveURL(/\/oauth\/consent\?/u);
      await expect(
        page.getByRole("radio", { name: /OAuth Main/u })
      ).toBeDisabled();
      await expect(
        page.getByText(/only owners and admins can connect/iu)
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Authorize" })
      ).toBeDisabled();
    } finally {
      await browserContext.close();
    }
  } finally {
    d1(
      `update member set role = 'owner' where "organizationId" = '${organizationId}'`
    );
  }
  const restored = await mcp(tokens.access, "tools/list");
  expect(restored.status).toBe(200);
});

test("a consent narrowed to leave out mcp cuts off earlier tokens", async () => {
  test.skip(!isLocal, "changes the consent in the local D1");
  expect(await statusOf(tokens.access)).toBe(200);
  const narrow = `update "oauthConsent" set scopes = '["openid"]' where "clientId" = '${clientId}'`;
  const restore = `update "oauthConsent" set scopes = '["openid","profile","email","offline_access","mcp"]' where "clientId" = '${clientId}'`;
  d1(narrow);
  try {
    expect(await statusOf(tokens.access)).toBe(401);
  } finally {
    d1(restore);
  }
  expect(await statusOf(tokens.access)).toBe(200);
});

test("Settings → Connected apps revokes at once", async ({ browser }) => {
  const browserContext = await signedInContext(browser);
  const page = await browserContext.newPage();
  try {
    await page.goto(
      `${target.app}/${organizationSlug}?settings=connected-apps`
    );
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("E2E Agent")).toBeVisible();
    await expect(dialog.getByText("OAuth Main")).toBeVisible();
    await expect(dialog.getByText("localhost, 127.0.0.1")).toBeVisible();
    await dialog.getByRole("button", { name: "Revoke E2E Agent" }).click();
    await page.getByRole("button", { name: "Revoke access" }).click();
    await expect(dialog.getByText("E2E Agent")).toHaveCount(0);
  } finally {
    await browserContext.close();
  }
  const revoked = await mcp(tokens.access, "tools/list");
  expect(revoked.status).toBe(401);
  const refresh = await tokenRequest({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: tokens.refresh,
    resource: discovery.resource,
  });
  expect(refresh.status).toBeGreaterThanOrEqual(400);
});

test("reconnecting doesn't bring a revoked token back", async ({ browser }) => {
  const revoked = tokens;
  const browserContext = await signedInContext(browser);
  const page = await browserContext.newPage();
  try {
    // A token's `iat` has one-second resolution.
    await page.waitForTimeout(1100);
    const flow = await authorize(page);
    await expect(page).toHaveURL(/\/oauth\/consent\?/u);
    await page.getByRole("radio", { name: /OAuth Main/u }).check();
    await page.getByRole("button", { name: "Authorize" }).click();
    tokens = await exchange(await codeFrom(page, flow.state), flow.verifier);
  } finally {
    await browserContext.close();
  }
  expect(await statusOf(tokens.access)).toBe(200);
  expect(await statusOf(revoked.access), "the revoked token").toBe(401);
});

test("revoking one project leaves the app's other projects alone", async ({
  browser,
}) => {
  const browserContext = await signedInContext(browser);
  const page = await browserContext.newPage();
  let side = tokens;
  try {
    const flow = await authorize(page);
    await expect(page).toHaveURL(/\/oauth\/consent\?/u);
    await page.getByRole("radio", { name: /OAuth Side/u }).check();
    await page.getByRole("button", { name: "Authorize" }).click();
    side = await exchange(await codeFrom(page, flow.state), flow.verifier);
  } finally {
    await browserContext.close();
  }
  const connections = await session.rpc<
    { id: string; projectName: string | null }[]
  >("oauth/connections", {});
  const grant = connections.find((row) => row.projectName === "OAuth Side");
  await session.rpc("oauth/revoke", { id: grant?.id });

  // A client replaying the revoked project's refresh token is refused...
  const replay = await tokenRequest({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: side.refresh,
    resource: discovery.resource,
  });
  expect(replay.status).toBeGreaterThanOrEqual(400);
  // ...and that doesn't cost the app its other project.
  const refreshed = await tokenRequest({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: tokens.refresh,
    resource: discovery.resource,
  });
  expect(refreshed.status, JSON.stringify(refreshed.body)).toBe(200);
  tokens = {
    access: refreshed.body.access_token ?? "",
    refresh: refreshed.body.refresh_token ?? tokens.refresh,
  };
});

test("a deleted project asks for a project again instead of looping", async ({
  browser,
}) => {
  const browserContext = await signedInContext(browser);
  const page = await browserContext.newPage();
  try {
    let flow = await authorize(page);
    await expect(page).toHaveURL(/\/oauth\/consent\?/u);
    await page.getByRole("radio", { name: /OAuth Side/u }).check();
    await page.getByRole("button", { name: "Authorize" }).click();
    tokens = await exchange(await codeFrom(page, flow.state), flow.verifier);
    expect(await statusOf(tokens.access)).toBe(200);

    await session.rpc("projects/remove", { id: secondProjectId });
    expect(await statusOf(tokens.access)).toBe(401);

    // Already signed in: straight to the consent screen, OAuth Side gone.
    flow = await authorize(page);
    await expect(page).toHaveURL(/\/oauth\/consent\?/u);
    await expect(page.getByRole("radio", { name: /OAuth Side/u })).toHaveCount(
      0
    );
    await page.getByRole("radio", { name: /OAuth Main/u }).check();
    await page.getByRole("button", { name: "Authorize" }).click();
    tokens = await exchange(await codeFrom(page, flow.state), flow.verifier);
    expect(await statusOf(tokens.access)).toBe(200);
  } finally {
    await browserContext.close();
  }
});

test("Cancel sends access_denied back to the client", async ({ browser }) => {
  const browserContext = await signedInContext(browser);
  const page = await browserContext.newPage();
  try {
    const { state } = await authorize(page);
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.waitForURL((url) => url.href.startsWith(callback.url));
    const url = new URL(page.url());
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("state")).toBe(state);
  } finally {
    await browserContext.close();
  }
});

/** The sign-in code in the first message the local Worker sent after `since`. */
const emailedCode = async (since: number) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let first: { path: string; at: number } | null = null;
    for await (const path of glob(
      "web/.wrangler/tmp/email/*/email-text/*.txt"
    )) {
      const { mtimeMs } = await stat(path);
      if (mtimeMs >= since && (!first || mtimeMs < first.at)) {
        first = { at: mtimeMs, path };
      }
    }
    const code = first
      ? /Your code: (?<value>\d{6})/u.exec(await readFile(first.path, "utf-8"))
          ?.groups?.value
      : undefined;
    if (code) {
      return code;
    }
    await sleep(200);
  }
  throw new Error("No sign-in code was emailed");
};

test("signing in with an emailed code stays in the flow", async ({
  browser,
}) => {
  test.skip(!isLocal, "codes are read from the local Worker's sent mail");
  const browserContext = await browser.newContext();
  const page = await browserContext.newPage();
  try {
    const { state } = await authorize(page);
    await expect(page).toHaveURL(/\/auth\/sign-in\?/u);
    // Better Auth UI drops the query on this link, like on Sign Up.
    await page.getByRole("link", { name: /email code/iu }).click();
    await expect(page).toHaveURL(/\/auth\/email-otp/u);
    await page.getByRole("textbox", { name: "Email" }).fill(session.email);
    const since = Date.now();
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(
      page.getByText(`We sent a code to ${session.email}`)
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Code" })
      .pressSequentially(await emailedCode(since));

    await expect(page).toHaveURL(/\/oauth\/consent\?/u);
    await page.getByRole("button", { name: "Authorize" }).click();
    expect(await codeFrom(page, state)).not.toBe("");
  } finally {
    await browserContext.close();
  }
});

test("someone new signs up from the sign-in page and stays in the flow", async ({
  browser,
}) => {
  const browserContext = await browser.newContext();
  const page = await browserContext.newPage();
  const email = testEmail("oauth-new");
  try {
    await authorize(page);
    await expect(page).toHaveURL(/\/auth\/sign-in\?/u);
    await page.getByRole("link", { name: "Sign Up" }).click();
    // Better Auth UI drops the query on this link; the flow must survive it.
    await expect(page).toHaveURL(/\/auth\/sign-up$/u);
    await expect(page.getByRole("textbox", { name: "Name" })).toBeVisible();
    await page.getByRole("textbox", { name: "Name" }).fill("E2E Newcomer");
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign Up" }).click();

    // A newcomer may have no workspace yet (the dashboard makes one on its
    // first visit, which the flow may or may not pass through): the consent
    // screen makes it in place, without leaving the flow.
    await expect(page).toHaveURL(/\/oauth\/consent\?/u);
    const create = page.getByRole("button", { name: "Create a workspace" });
    const project = page.getByRole("radio", { name: "My app" });
    await expect(create.or(project)).toBeVisible();
    if (await create.isVisible()) {
      await expect(
        page.getByRole("button", { name: "Authorize" })
      ).toBeDisabled();
      await create.click();
    }
    await expect(project).toBeChecked();
    await expect(page).toHaveURL(/\/oauth\/consent\?/u);
    await expect(page.getByRole("button", { name: "Authorize" })).toBeEnabled();
  } finally {
    await page.request.post(`${target.app}/api/auth/delete-user`, {
      data: { password: TEST_PASSWORD },
      headers: { origin: target.origin },
    });
    await browserContext.close();
  }
});
