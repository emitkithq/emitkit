import { once } from "node:events";
import { createServer } from "node:http";
import type { IncomingHttpHeaders, Server } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

import { ApiSession } from "@e2e/support/api-session";
import { attachHttpLog, recordResponse } from "@e2e/support/http-log";
import { target } from "@e2e/support/targets";
import { expect, request as playwrightRequest, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { Webhook } from "standardwebhooks";

/**
 * Actions and fields: an event that waits for an answer (docs/content/
 * concepts/questions.mdx).
 *
 * Ways it could fail, each covered below:
 * - a bad question is accepted, or rejected without saying where and how
 *   to fix it (unknown field in `requires`, duplicate ids, expiresIn on an
 *   event that doesn't wait, notify: false on one that does, a link that
 *   isn't https, a choice default that isn't an option);
 * - an event that waits comes back without `answer`, its url, or expiry;
 * - GET can't read an event back, or reads another project's;
 * - `requires` is ignored, an answer outside a field's options is stored,
 *   a second answer overwrites the first;
 * - an answer is not visible to the sender (GET) or on the timeline;
 * - cancel works on something that isn't pending, or not at all;
 * - an expired question can still be answered or canceled;
 * - someone outside the organization can open or answer the card;
 * - an idempotent retry creates a second question;
 * - MCP can't ask (tool schema out of step with the API) or read answers;
 * - error bodies lack a stable `code`;
 * - a callback isn't sent, isn't signed the Standard Webhooks way, loses
 *   `resume`, changes its `webhook-id` between retries, isn't retried after
 *   a failure, or an expiry calls back more than once;
 * - the answer page (what the push opens) doesn't enforce `requires`,
 *   doesn't send the chosen values, or doesn't show the outcome after.
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

const REFUND = {
  actions: [
    { id: "approve", label: "Refund", style: "primary" },
    {
      id: "deny",
      label: "Don't refund",
      requires: ["note"],
      style: "destructive",
    },
    { label: "Open order", url: "https://shop.example.com/admin/orders/1042" },
  ],
  channelName: "refunds",
  description: "Arrived damaged: 2 of 3 items broken.",
  fields: [
    {
      default: "partial",
      id: "resolution",
      label: "Resolution",
      options: [
        { id: "full", label: "Full refund ($240)" },
        { id: "partial", label: "Broken items only ($160)" },
      ],
      type: "choice",
    },
    {
      id: "replace",
      label: "Also send replacements for",
      multiple: true,
      options: [
        { id: "mug", label: "Mug" },
        { id: "plate", label: "Plate" },
      ],
      type: "choice",
    },
    { id: "note", label: "Note to Jane", multiline: true, type: "text" },
  ],
  title: "Refund Jane Cooper for order #1042?",
};

interface EventData {
  id: string;
  title: string;
  fields?: unknown[];
  actions?: unknown[];
  answer?: null | {
    status: string;
    url: string;
    expiresAt: string;
    action?: string;
    values?: Record<string, unknown>;
    by?: { name: string };
  };
}

const call = async (
  method: "GET" | "POST",
  path: string,
  options: {
    body?: unknown;
    key?: string;
    headers?: Record<string, string>;
  } = {}
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
      ...options.headers,
    },
    method,
  });
  return recordResponse(method, url, options.body ?? null, response);
};

/** A dashboard RPC that may fail: its status and JSON body. */
const rpc = async (
  as: APIRequestContext,
  procedure: string,
  input: unknown
) => {
  const url = `${target.app}/rpc/${procedure}`;
  const response = await recordResponse(
    "POST",
    url,
    input,
    await as.post(url, {
      data: { json: input },
      headers: { origin: target.origin },
    })
  );
  const body: { json: unknown } = await response.json();
  return { body: body.json, status: response.status() };
};

const createEvent = async (
  body: unknown,
  headers: Record<string, string> = {}
) => {
  const response = await call("POST", "/v1/events", {
    body,
    headers,
    key: apiKey,
  });
  const json: { data: EventData } = await response.json();
  return { data: json.data, response };
};

const getEvent = async (id: string, key = apiKey) => {
  const response = await call("GET", `/v1/events/${id}`, { key });
  return { body: await response.json(), status: response.status() };
};

/** One MCP JSON-RPC request with the project's API key. */
const mcp = async (id: number, method: string, params?: unknown) => {
  const response = await call("POST", "/mcp", {
    body: { id, jsonrpc: "2.0", method, params },
    key: apiKey,
  });
  return response.json();
};

test.afterEach(async ({}, testInfo) => {
  await attachHttpLog(testInfo);
});

test.beforeAll(async () => {
  context = await playwrightRequest.newContext();
  session = await ApiSession.signUp(context, "actions");
  const workspace = await session.bootstrap("E2E Actions Co", "Shop");
  ({ organizationId } = workspace);
  apiKey = workspace.apiKey.secret;
  const other = await session.rpc<{ id: string }>("projects/create", {
    name: "Other project",
  });
  const otherKey = await session.rpc<{ secret: string }>("apiKeys/create", {
    name: "other project",
    projectId: other.id,
  });
  otherProjectKey = otherKey.secret;
  outsiderContext = await playwrightRequest.newContext();
  outsider = await ApiSession.signUp(outsiderContext, "actions-outsider");
  const outsiderWorkspace = await outsider.bootstrap(
    "E2E Outsider Co",
    "Elsewhere"
  );
  outsiderOrganizationId = outsiderWorkspace.organizationId;
});

test.afterAll(async () => {
  await session.destroy(organizationId);
  await outsider.destroy(outsiderOrganizationId);
  await context.dispose();
  await outsiderContext.dispose();
});

test("a question waits: pending with its answer page and expiry, and GET reads it back", async () => {
  const { data, response } = await createEvent({ ...REFUND, expiresIn: 1800 });
  expect(response.status()).toBe(201);
  expect(data.answer?.status).toBe("pending");
  expect(data.answer?.url).toBe(`${target.app}/a/${data.id}`);
  const expiresInMs = Date.parse(data.answer?.expiresAt ?? "") - Date.now();
  expect(expiresInMs).toBeGreaterThan(1_700_000);
  expect(expiresInMs).toBeLessThan(1_800_500);

  const read = await getEvent(data.id);
  expect(read.status).toBe(200);
  expect(read.body.data).toMatchObject({
    actions: REFUND.actions,
    answer: { status: "pending" },
    channelName: "refunds",
    fields: REFUND.fields,
    id: data.id,
    title: REFUND.title,
  });

  const plain = await createEvent({
    channelName: "signups",
    notify: false,
    title: "No question",
  });
  expect(plain.data.answer).toBeNull();
});

test("a bad question is rejected with the path and the fix", async () => {
  const cases: [unknown, (string | number)[], RegExp][] = [
    [
      {
        ...REFUND,
        actions: [{ id: "deny", label: "No", requires: ["reason"] }],
      },
      ["actions", 0, "requires", 0],
      /"reason" is not a field; field ids are resolution, replace, note/u,
    ],
    [
      { channelName: "a", expiresIn: 60, title: "Nothing to answer" },
      ["expiresIn"],
      /add a button .* or a field/u,
    ],
    [{ ...REFUND, notify: false }, ["notify"], /always notifies/u],
    [
      {
        channelName: "a",
        fields: [
          { id: "x", label: "X", type: "boolean" },
          { id: "x", label: "Y", type: "text" },
        ],
        title: "t",
      },
      ["fields"],
      /Field id "x" is used twice/u,
    ],
    [
      {
        actions: [{ label: "Open", url: "http://example.com" }],
        channelName: "a",
        title: "t",
      },
      ["actions", 0, "url"],
      /https/u,
    ],
    [
      { actions: [{ label: "Neither" }], channelName: "a", title: "t" },
      ["actions", 0],
      /an id \(a button.*or a url/u,
    ],
    [
      {
        channelName: "a",
        fields: [
          {
            default: "z",
            id: "c",
            label: "C",
            options: [
              { id: "x", label: "X" },
              { id: "y", label: "Y" },
            ],
            type: "choice",
          },
        ],
        title: "t",
      },
      ["fields", 0, "default"],
      /"z" is not one of this field's options/u,
    ],
    [
      {
        channelName: "a",
        fields: [{ id: "d", label: "When", type: "date" }],
        title: "t",
      },
      ["fields", 0],
      /type is "choice".*"text", "number" or "boolean"/u,
    ],
    [
      {
        channelName: "a",
        fields: [{ id: "ok", label: "OK", required: true, type: "boolean" }],
        title: "t",
      },
      ["fields", 0, "required"],
      /"required" is not a setting here; to make a field required, list its id in a button's requires/u,
    ],
    [
      {
        actions: [{ id: "go", label: "Go", requires: ["ok"] }],
        channelName: "a",
        fields: [{ id: "ok", label: "Checked", type: "boolean" }],
        title: "t",
      },
      ["actions", 0, "requires", 0],
      /"ok" always has a value .*requires works on text and multiple-choice fields/u,
    ],
    [
      { actions: ["Approve", "Deny"], channelName: "a", title: "t" },
      ["actions", 0],
      /An action is \{ id, label \} \(a button: the answer\) or \{ label, url \} \(a link\)/u,
    ],
    [
      {
        actions: [{ id: "ok", label: "OK" }],
        channelName: "a",
        expiresIn: "30m",
        title: "t",
      },
      ["expiresIn"],
      /Seconds as a whole number from 10 to 604800/u,
    ],
    [
      {
        actions: [{ id: "submit", label: "Go" }],
        channelName: "a",
        title: "t",
      },
      ["actions", 0, "id"],
      /"submit" is the answer of the Send button/u,
    ],
    [
      {
        actions: [{ label: "Sneaky", url: "http://localhost:@evil.example/x" }],
        channelName: "a",
        title: "t",
      },
      ["actions", 0, "url"],
      /https/u,
    ],
  ];
  for (const [body, path, message] of cases) {
    const response = await call("POST", "/v1/events", { body, key: apiKey });
    expect(response.status(), JSON.stringify(body)).toBe(400);
    const json: {
      code: string;
      details: { path: (string | number)[]; message: string }[];
    } = await response.json();
    expect(json.code).toBe("validation_error");
    const detail = json.details.find(
      (candidate) => JSON.stringify(candidate.path) === JSON.stringify(path)
    );
    expect(detail?.message, JSON.stringify(json.details)).toMatch(message);
  }
});

test("answering: requires is enforced, first answer wins, the sender and the timeline see it", async () => {
  const { data } = await createEvent(REFUND);

  const noNote = await rpc(context, "answers/submit", {
    action: "deny",
    eventId: data.id,
    values: {},
  });
  expect(noNote.status).toBe(400);
  expect(JSON.stringify(noNote.body)).toMatch(/note to jane/iu);

  const wrongOption = await rpc(context, "answers/submit", {
    action: "approve",
    eventId: data.id,
    values: { resolution: "everything" },
  });
  expect(wrongOption.status).toBe(400);

  const answered = await rpc(context, "answers/submit", {
    action: "approve",
    eventId: data.id,
    values: { replace: ["mug"], resolution: "partial" },
  });
  expect(answered.status).toBe(200);
  expect(answered.body).toMatchObject({
    answer: { action: "approve", by: "E2E actions", status: "answered" },
  });

  const read = await getEvent(data.id);
  expect(read.body.data.answer).toMatchObject({
    action: "approve",
    by: { name: "E2E actions" },
    status: "answered",
    values: { replace: ["mug"], resolution: "partial" },
  });
  expect(read.body.data.answer.values).not.toHaveProperty("note");

  const second = await rpc(context, "answers/submit", {
    action: "deny",
    eventId: data.id,
    values: { note: "Changed my mind" },
  });
  expect(second.status).toBe(409);
  expect(JSON.stringify(second.body)).toMatch(
    /Already answered by E2E actions/u
  );

  const feed = await session.rpc<{
    events: { title: string; metadata: Record<string, unknown> }[];
  }>("events/list", { limit: 20 });
  expect(
    feed.events.find((event) => event.metadata.eventId === data.id)?.title
  ).toBe("E2E actions chose “Refund”");
});

test("cancel: a pending question, safely twice, and says why not otherwise", async () => {
  const { data } = await createEvent({
    actions: [{ id: "ship", label: "Ship it" }],
    channelName: "deploys",
    title: "Ship v2.3?",
  });
  const canceled = await call("POST", `/v1/events/${data.id}/cancel`, {
    key: apiKey,
  });
  expect(canceled.status()).toBe(200);
  const canceledBody = await canceled.json();
  expect(canceledBody.data.answer.status).toBe("canceled");

  const again = await call("POST", `/v1/events/${data.id}/cancel`, {
    key: apiKey,
  });
  expect(again.status()).toBe(200);
  const againBody = await again.json();
  expect(againBody.data.answer.status).toBe("canceled");

  const answeredQuestion = await createEvent({
    actions: [{ id: "ok", label: "OK" }],
    channelName: "deploys",
    title: "Answered first",
  });
  await rpc(context, "answers/submit", {
    action: "ok",
    eventId: answeredQuestion.data.id,
    values: {},
  });
  const tooLate = await call(
    "POST",
    `/v1/events/${answeredQuestion.data.id}/cancel`,
    { key: apiKey }
  );
  expect(tooLate.status()).toBe(409);
  expect(await tooLate.json()).toMatchObject({
    code: "not_pending",
    message: expect.stringMatching(/Already answered by E2E actions/u),
  });

  const lateAnswer = await rpc(context, "answers/submit", {
    action: "ship",
    eventId: data.id,
    values: {},
  });
  expect(lateAnswer.status).toBe(409);

  const plain = await createEvent({
    channelName: "signups",
    title: "Nothing to cancel",
  });
  const notWaiting = await call("POST", `/v1/events/${plain.data.id}/cancel`, {
    key: apiKey,
  });
  expect(notWaiting.status()).toBe(409);
  const notWaitingBody = await notWaiting.json();
  expect(notWaitingBody.code).toBe("not_waiting");
  expect(notWaitingBody.message).toMatch(/doesn't wait for an answer/u);
});

test("expiry: after expiresIn the question is expired and can't be answered or canceled", async () => {
  const { data } = await createEvent({
    actions: [{ id: "ok", label: "OK" }],
    channelName: "deploys",
    expiresIn: 10,
    title: "Quick one",
  });
  await sleep(11_000);
  const expired = await getEvent(data.id);
  expect(expired.body.data.answer.status).toBe("expired");
  const lateAnswer = await rpc(context, "answers/submit", {
    action: "ok",
    eventId: data.id,
    values: {},
  });
  expect(lateAnswer.status).toBe(409);
  const lateCancel = await call("POST", `/v1/events/${data.id}/cancel`, {
    key: apiKey,
  });
  expect(lateCancel.status()).toBe(409);
});

test("links only: nothing to answer, the links come back", async () => {
  const links = [
    {
      label: "Open in Stripe",
      url: "https://dashboard.stripe.com/customers/cus_1",
    },
  ];
  const { data } = await createEvent({
    actions: links,
    channelName: "signups",
    title: "New signup",
  });
  expect(data.answer).toBeNull();
  const read = await getEvent(data.id);
  expect(read.body.data.actions).toEqual(links);
  expect(read.body.data.answer).toBeNull();
});

test("other projects and other organizations can't see the question", async () => {
  const { data } = await createEvent(REFUND);
  const fromOtherProject = await getEvent(data.id, otherProjectKey);
  expect(fromOtherProject.status).toBe(404);
  expect(fromOtherProject.body.code).toBe("not_found");
  const cancelFromOtherProject = await call(
    "POST",
    `/v1/events/${data.id}/cancel`,
    { key: otherProjectKey }
  );
  expect(cancelFromOtherProject.status()).toBe(404);

  const outsiderOpens = await rpc(outsiderContext, "answers/get", {
    eventId: data.id,
  });
  expect(outsiderOpens.status).toBe(404);
  const outsiderAnswers = await rpc(outsiderContext, "answers/submit", {
    action: "approve",
    eventId: data.id,
    values: {},
  });
  expect(outsiderAnswers.status).toBe(404);
  const unknown = await getEvent("event_doesnotexist000000000000");
  expect(unknown.status).toBe(404);
});

test("an idempotent retry returns the same question", async () => {
  const headers = { "idempotency-key": `question-${Date.now()}` };
  const first = await createEvent(REFUND, headers);
  const retry = await createEvent(REFUND, headers);
  expect(retry.response.headers()["x-idempotent-replay"]).toBe("true");
  expect(retry.data.id).toBe(first.data.id);
  expect(retry.data.answer).toEqual(first.data.answer);
});

test("MCP: ask with createEvent, read the answer with getEvent, schema matches the API", async () => {
  const listed: {
    result: {
      tools: {
        name: string;
        inputSchema: { properties: Record<string, unknown> };
      }[];
    };
  } = await mcp(1, "tools/list");
  const names = listed.result.tools.map((tool) => tool.name);
  expect(names).toEqual(
    expect.arrayContaining(["createEvent", "getEvent", "cancelEvent"])
  );

  const document = await context.get(`${target.api}/openapi.json`);
  const openapi = await document.json();
  const request = openapi.components.schemas.CreateEventRequest.properties;
  const createTool = listed.result.tools.find(
    (tool) => tool.name === "createEvent"
  );
  for (const key of [
    "fields",
    "actions",
    "expiresIn",
    "callbackUrl",
    "resume",
  ]) {
    expect(createTool?.inputSchema.properties[key], key).toEqual(request[key]);
  }

  const created = await mcp(2, "tools/call", {
    arguments: {
      actions: [
        { id: "yes", label: "Yes" },
        { id: "no", label: "No" },
      ],
      channelName: "agents",
      title: "Send the follow-up email?",
    },
    name: "createEvent",
  });
  expect(created.result.isError).toBe(false);
  const { id } = created.result.structuredContent.data;
  expect(created.result.structuredContent.data.answer.status).toBe("pending");

  await rpc(context, "answers/submit", {
    action: "yes",
    eventId: id,
    values: {},
  });
  const read = await mcp(3, "tools/call", {
    arguments: { id },
    name: "getEvent",
  });
  expect(read.result.structuredContent.data.answer).toMatchObject({
    action: "yes",
    status: "answered",
  });

  const missing = await mcp(4, "tools/call", {
    arguments: { id: "event_nope" },
    name: "getEvent",
  });
  expect(missing.result.isError).toBe(true);
  expect(missing.result.structuredContent.code).toBe("not_found");
});

test("errors carry a stable code", async () => {
  const unauthenticated = await call("POST", "/v1/events", {
    body: { channelName: "a", title: "b" },
  });
  expect(await unauthenticated.json()).toMatchObject({ code: "unauthorized" });
  const unknownRoute = await call("GET", "/v1/nothing-here", { key: apiKey });
  expect(await unknownRoute.json()).toMatchObject({ code: "not_found" });
});

/** A screenshot as a file attachment, so `pnpm e2e:report` copies it into the report. */
const snap = async (page: Page, name: string) => {
  const file = test.info().outputPath(`${name}.png`);
  await page.screenshot({ path: file });
  await test.info().attach(name, { contentType: "image/png", path: file });
};

test("the answer page: requires, choosing, answering, the outcome", async ({
  browser,
}) => {
  const { data } = await createEvent(REFUND);
  const signedIn = await browser.newContext({
    storageState: await context.storageState(),
    viewport: { height: 844, width: 390 },
  });
  const page = await signedIn.newPage();
  await page.goto(data.answer?.url ?? "");
  await expect(page.getByRole("heading", { name: REFUND.title })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open order/u })).toHaveAttribute(
    "href",
    "https://shop.example.com/admin/orders/1042"
  );
  await snap(page, "pending");

  await page.getByRole("button", { name: "Don't refund" }).click();
  const problem = page.getByText("Fill in “Note to Jane” first");
  await expect(problem).toBeInViewport();
  // Not hidden behind the pinned buttons: nothing covers it.
  await expect
    .poll(() =>
      problem.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return (
          document.elementFromPoint(box.left + 4, box.top + box.height / 2) ===
          element
        );
      })
    )
    .toBe(true);
  await expect(
    page.getByRole("textbox", { name: "Note to Jane" })
  ).toBeFocused();
  await snap(page, "requires");

  await page.getByRole("radio", { name: "Full refund ($240)" }).check();
  await page.getByRole("checkbox", { name: "Plate" }).check();
  await page.getByRole("button", { name: "Refund", exact: true }).click();
  await expect(page.getByText("E2E actions chose “Refund”")).toBeVisible();
  await snap(page, "answered");

  const read = await getEvent(data.id);
  expect(read.body.data.answer).toMatchObject({
    action: "approve",
    status: "answered",
    values: { replace: ["plate"], resolution: "full" },
  });
  await signedIn.close();
});

test("createEvent returns the whole event, like GET", async () => {
  const { data } = await createEvent({
    ...REFUND,
    metadata: { orderId: "1042" },
    tags: ["support"],
  });
  const read = await getEvent(data.id);
  const { answer: _created, ...created } = data as unknown as Record<
    string,
    unknown
  >;
  const { answer: _read, ...current } = read.body.data;
  expect(created).toEqual(current);
  expect(created).toMatchObject({
    metadata: { orderId: "1042" },
    source: "api",
    tags: ["support"],
  });
});

test("answers are checked against the fields", async () => {
  const { data } = await createEvent(REFUND);
  const submit = (values: unknown) =>
    rpc(context, "answers/submit", {
      action: "approve",
      eventId: data.id,
      values,
    });
  const duplicate = await submit({ replace: ["mug", "mug"] });
  expect(duplicate.status).toBe(400);
  expect(JSON.stringify(duplicate.body)).toMatch(/Pick each option once/u);
  const unknownField = await submit({ everything: "yes" });
  expect(unknownField.status).toBe(400);
  expect(JSON.stringify(unknownField.body)).toMatch(
    /Not a field of this event/u
  );
  const wrongType = await submit({ resolution: ["full"] });
  expect(wrongType.status).toBe(400);
  const tooMany = await submit(
    Object.fromEntries(
      Array.from({ length: 6 }, (_, index) => [`f${index}`, "x"])
    )
  );
  expect(tooMany.status).toBe(400);
  const read = await getEvent(data.id);
  expect(read.body.data.answer.status).toBe("pending");
});

test("a long answer is kept on the question; the timeline event stays small", async () => {
  const { data } = await createEvent({
    actions: [{ id: "send", label: "Send" }],
    channelName: "long",
    fields: ["a", "b", "c"].map((id) => ({ id, label: id, type: "text" })),
    title: "Write a lot",
  });
  const long = "漢".repeat(2000);
  const answered = await rpc(context, "answers/submit", {
    action: "send",
    eventId: data.id,
    values: { a: long, b: long, c: long },
  });
  expect(answered.status).toBe(200);
  const read = await getEvent(data.id);
  expect(read.body.data.answer.values.a).toHaveLength(2000);
  const feed = await session.rpc<{
    events: { metadata: Record<string, unknown> }[];
  }>("events/list", { limit: 20 });
  const recorded = feed.events.find(
    (event) => event.metadata.eventId === data.id
  );
  expect(recorded?.metadata).toEqual({ action: "send", eventId: data.id });
});

test("questions in a deleted channel or project can't be read or answered", async () => {
  const inChannel = await createEvent({
    actions: [{ id: "ok", label: "OK" }],
    channelName: "doomed",
    title: "Channel goes away",
  });
  const channels = await session.rpc<{ id: string; name: string }[]>(
    "channels/list",
    {}
  );
  const doomed = channels.find((channel) => channel.name === "doomed");
  await session.rpc("channels/remove", { id: doomed?.id });
  const inDeletedChannel = await getEvent(inChannel.data.id);
  expect(inDeletedChannel.status).toBe(404);
  const opened = await rpc(context, "answers/get", {
    eventId: inChannel.data.id,
  });
  expect(opened.status).toBe(404);

  const project = await session.rpc<{ id: string }>("projects/create", {
    name: "Short-lived",
  });
  const projectKey = await session.rpc<{ secret: string }>("apiKeys/create", {
    name: "short-lived",
    projectId: project.id,
  });
  const inProject = await call("POST", "/v1/events", {
    body: {
      actions: [{ id: "ok", label: "OK" }],
      channelName: "x",
      title: "Project goes away",
    },
    key: projectKey.secret,
  });
  const inProjectBody = await inProject.json();
  await session.rpc("projects/remove", { id: project.id });
  const afterRemoval = await getEvent(inProjectBody.data.id, projectKey.secret);
  expect(afterRemoval.status).toBe(403);
  const openedAfter = await rpc(context, "answers/get", {
    eventId: inProjectBody.data.id,
  });
  expect(openedAfter.status).toBe(404);
});

test("one tap answers a lone choice; the Send answer reads 'answered'", async ({
  browser,
}) => {
  const { data } = await createEvent({
    channelName: "newsletter",
    fields: [
      {
        id: "headline",
        label: "Headline",
        options: [
          { id: "a", label: "Autumn is here: 20% off" },
          { id: "b", label: "The cosy edit" },
        ],
        type: "choice",
      },
    ],
    title: "Which headline?",
  });
  const signedIn = await browser.newContext({
    storageState: await context.storageState(),
    viewport: { height: 844, width: 390 },
  });
  const page = await signedIn.newPage();
  await page.goto(data.answer?.url ?? "");
  await page.getByRole("button", { name: /The cosy edit/u }).click();
  await expect(page.getByText("E2E actions answered")).toBeVisible();
  await snap(page, "one-tap");
  await signedIn.close();

  const read = await getEvent(data.id);
  expect(read.body.data.answer).toMatchObject({
    action: "submit",
    values: { headline: "b" },
  });
  const feed = await session.rpc<{
    events: { title: string; metadata: Record<string, unknown> }[];
  }>("events/list", { limit: 30 });
  expect(
    feed.events.find((event) => event.metadata.eventId === data.id)?.title
  ).toBe("E2E actions answered");
});

test("the feed shows questions waiting and links, and opens the answer page", async ({
  browser,
}) => {
  const billing = await session.rpc<{ state: string }>("billing/status", {});
  // With billing on, a new organization's dashboard sits under the paywall.
  test.skip(
    billing.state === "required",
    "the paywall covers the feed of an organization without a plan"
  );
  const question = await createEvent({
    actions: [{ id: "ok", label: "OK" }],
    channelName: "feed-check",
    title: "Needs someone",
  });
  await createEvent({
    actions: [
      { label: "Open in Stripe", url: "https://dashboard.stripe.com/c/1" },
    ],
    channelName: "feed-check",
    title: "New signup with a link",
  });
  const signedIn = await browser.newContext({
    storageState: await context.storageState(),
  });
  const page = await signedIn.newPage();
  await page.goto(`${target.app}/`);
  const row = page.getByRole("article", { name: "Needs someone" });
  await expect(row.getByText("Waiting for an answer")).toBeVisible();
  await page
    .getByRole("article", { name: "New signup with a link" })
    .getByRole("button")
    .first()
    .click();
  await expect(
    page.getByRole("link", { name: /Open in Stripe/u })
  ).toHaveAttribute("href", "https://dashboard.stripe.com/c/1");
  await row.getByRole("button").first().click();
  await snap(page, "feed-question");
  await row.getByRole("link", { name: "Answer" }).click();
  await expect(page).toHaveURL(new RegExp(`/a/${question.data.id}$`, "u"));
  await signedIn.close();
});

// ---------------------------------------------------------------------------
// Callbacks: a receiver on this machine, so only against a local dev server.

interface Delivery {
  readonly body: string;
  readonly headers: IncomingHttpHeaders;
}

/** Records every POST; answers 500 to the first `failFirst` of them. */
const startReceiver = async (failFirst = 0) => {
  const deliveries: Delivery[] = [];
  const server: Server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      deliveries.push({ body, headers: request.headers });
      response.writeHead(deliveries.length <= failFirst ? 500 : 200).end();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    close: () => server.close(),
    deliveries,
    url: `http://127.0.0.1:${port}/emitkit`,
  };
};

const waitFor = async (check: () => boolean, seconds: number) => {
  for (let waited = 0; waited < seconds && !check(); waited += 1) {
    await sleep(1000);
  }
};

const callbackSecret = async () => {
  const [project] = await session.rpc<{ id: string; name: string }[]>(
    "projects/list",
    {}
  );
  const revealed = await session.rpc<{ secret: string }>(
    "projects/callbackSecret",
    { id: project?.id }
  );
  return revealed.secret;
};

test("callbacks: signed, with resume, retried with the same id until it lands", async () => {
  test.skip(target.name !== "local", "the receiver runs on this machine");
  test.setTimeout(90_000);
  const receiver = await startReceiver(1);
  const { data } = await createEvent({
    ...REFUND,
    callbackUrl: receiver.url,
    resume: "refund-job-1042",
  });
  expect(data).toMatchObject({
    callback: { attempts: 0, url: receiver.url },
    resume: "refund-job-1042",
  });
  await rpc(context, "answers/submit", {
    action: "approve",
    eventId: data.id,
    values: { resolution: "full" },
  });
  // The first attempt gets a 500; the retry comes about 10 s later.
  await waitFor(() => receiver.deliveries.length >= 2, 45);
  receiver.close();
  expect(receiver.deliveries).toHaveLength(2);

  const webhook = new Webhook(await callbackSecret());
  const [first, second] = receiver.deliveries;
  for (const delivery of [first, second]) {
    expect(() =>
      webhook.verify(delivery?.body ?? "", {
        "webhook-id": String(delivery?.headers["webhook-id"]),
        "webhook-signature": String(delivery?.headers["webhook-signature"]),
        "webhook-timestamp": String(delivery?.headers["webhook-timestamp"]),
      })
    ).not.toThrow();
  }
  expect(second?.headers["webhook-id"]).toBe(first?.headers["webhook-id"]);
  const read = await getEvent(data.id);
  expect(JSON.parse(second?.body ?? "{}")).toEqual({
    answer: read.body.data.answer,
    eventId: data.id,
    resume: "refund-job-1042",
    type: "event.answered",
  });
  expect(read.body.data.callback).toMatchObject({
    attempts: 2,
    deliveredAt: expect.any(String),
    lastStatus: 200,
  });
});

test("callbacks: an expired question calls back once, with event.expired", async () => {
  test.skip(target.name !== "local", "the receiver runs on this machine");
  test.setTimeout(60_000);
  const receiver = await startReceiver();
  const { data } = await createEvent({
    actions: [{ id: "ok", label: "OK" }],
    callbackUrl: receiver.url,
    channelName: "deploys",
    expiresIn: 10,
    title: "Expires unanswered",
  });
  await waitFor(() => receiver.deliveries.length > 0, 40);
  await sleep(5000);
  receiver.close();
  expect(receiver.deliveries).toHaveLength(1);
  expect(JSON.parse(receiver.deliveries[0]?.body ?? "{}")).toMatchObject({
    answer: { action: null, status: "expired" },
    eventId: data.id,
    resume: null,
    type: "event.expired",
  });
});

/** A createEvent that must fail validation at `path` with `message`. */
const invalid = async (body: unknown, path: string, message: RegExp) => {
  const response = await call("POST", "/v1/events", { body, key: apiKey });
  expect(response.status(), JSON.stringify(body)).toBe(400);
  const json: { details: { path: string[]; message: string }[] } =
    await response.json();
  expect(
    json.details.find((detail) => detail.path.join(".") === path)?.message
  ).toMatch(message);
};

test("callbacks: where they may go, and resume stays with the sender", async () => {
  await invalid(
    { callbackUrl: "https://example.com/hook", channelName: "a", title: "t" },
    "callbackUrl",
    /only applies to an event that waits/u
  );
  await invalid(
    { channelName: "a", resume: "state", title: "t" },
    "resume",
    /only applies to an event that waits/u
  );
  // The API host, also spelled with a trailing dot or on another port.
  const api = new URL(target.api);
  const disguised = [
    `${target.api}/v1/events`,
    `${api.protocol}//${api.hostname}.${api.port ? `:${api.port}` : ""}/v1/events`,
    `${api.protocol}//${api.hostname}:8443/v1/events`,
  ];
  for (const callbackUrl of disguised) {
    await invalid(
      {
        actions: [{ id: "ok", label: "OK" }],
        callbackUrl,
        channelName: "a",
        title: "t",
      },
      "callbackUrl",
      /can't point at EmitKit itself/u
    );
  }
  await invalid(
    {
      actions: [{ id: "ok", label: "OK" }],
      channelName: "a",
      resume: "x".repeat(65_537),
      title: "t",
    },
    "resume",
    /at most 65,536 characters/u
  );

  const { data } = await createEvent({
    actions: [{ id: "ok", label: "OK" }],
    channelName: "deploys",
    resume: "secret-ish state",
    title: "Keeps its resume",
  });
  const opened = await rpc(context, "answers/get", { eventId: data.id });
  expect(JSON.stringify(opened.body)).not.toContain("secret-ish state");
  const feed = await session.rpc<unknown>("events/list", { limit: 5 });
  expect(JSON.stringify(feed)).not.toContain("secret-ish state");
});

test("another organization can't read a project's signing secret", async () => {
  const [project] = await session.rpc<{ id: string }[]>("projects/list", {});
  const outsiderAsks = await rpc(outsiderContext, "projects/callbackSecret", {
    id: project?.id,
  });
  expect(outsiderAsks.status).toBe(404);
  expect(JSON.stringify(outsiderAsks.body)).not.toContain("whsec_");
});

test("an owner reveals the callback signing secret in Settings → API keys", async ({
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
  await expect(settings).toContainText("Callback signing secret");

  await settings
    .getByRole("button", { name: "Reveal callback signing secret" })
    .click();
  const shown = settings.getByLabel("Callback signing secret", { exact: true });
  await expect(shown).toHaveText(/^whsec_/u);
  // Compared, never printed: a failure message would carry the secret.
  const matches = (await shown.textContent()) === (await callbackSecret());
  expect(matches, "the page shows the project's signing secret").toBe(true);
  const file = test.info().outputPath("settings-callback-secret.png");
  await shown.scrollIntoViewIfNeeded();
  await page.screenshot({ mask: [shown], path: file });
  await test.info().attach("settings-callback-secret", {
    contentType: "image/png",
    path: file,
  });

  await settings.getByRole("button", { name: "Done" }).click();
  await expect(shown).toBeHidden();
  await signedIn.close();
});
